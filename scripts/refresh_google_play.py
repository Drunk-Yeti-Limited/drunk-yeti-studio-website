#!/usr/bin/env python3
"""Refresh public Android listings and announce first-time releases on Studio News."""
import argparse
import hashlib
import json
import re
import runpy
import sys
from collections import Counter
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from studio_pages import path as product_path

ROOT = Path(__file__).resolve().parents[1]
PLAY = 'https://play.google.com'
PUBLISHER = 'Drunk Yeti Studio'
DEVELOPER = PLAY + '/store/apps/developer?id=Drunk+Yeti+Studio'
DETAILS = PLAY + '/store/apps/details?id='
LOCALE = '&hl=en&gl=US'
PACKAGE_ID = re.compile(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+')
COVERS = {
    'com.drunkyeti.houseofwilds': './assets/covers/chainfall-pi.webp',
    'games.drunkyeti.schmuck': './assets/covers/schmuck-deluxe.webp',
}
DEFAULT_COVER = './assets/logo.png'
AVAILABLE_ACTION = re.compile(r'install|buy(?: .*)?|\$\s*\d+(?:\.\d{2})?(?: buy)?', re.IGNORECASE)


def package(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'play.google.com' or parsed.path != '/store/apps/details':
        return None
    ids = parse_qs(parsed.query).get('id', [])
    return ids[0] if len(ids) == 1 and PACKAGE_ID.fullmatch(ids[0]) else None


def is_screenshot_url(url):
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.netloc == 'play-lh.googleusercontent.com'


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links = []
        self.meta = {}
        self.structured = []
        self.app_offers = set()
        self.screenshot = None
        self.script = None
        self.release_button = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href'):
            self.links.append(urljoin(PLAY, attrs['href']))
        if tag == 'meta':
            content = attrs.get('content') or ''
            self.meta[attrs.get('property') or attrs.get('name')] = content
            if self.release_button and attrs.get('itemprop') == 'url':
                if app := package(content):
                    self.app_offers.add(app)
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.script = []
        if tag == 'button':
            label = (attrs.get('aria-label') or '').strip()
            enabled = 'disabled' not in attrs and attrs.get('aria-disabled') != 'true'
            self.release_button = enabled and AVAILABLE_ACTION.fullmatch(label) is not None
        if tag == 'img' and not self.screenshot and attrs.get('alt') == 'Screenshot image':
            url = attrs.get('src') or ''
            if is_screenshot_url(url):
                self.screenshot = url

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            try:
                self.structured.append(json.loads(''.join(self.script)))
            except ValueError:
                pass
            self.script = None
        if tag == 'button':
            self.release_button = False


def listing(page, app):
    owner = any(
        url.scheme == 'https' and url.hostname == 'play.google.com' and url.path == '/store/apps/developer'
        and parse_qs(url.query).get('id') == [PUBLISHER]
        for url in map(urlparse, page.links)
    )
    if not owner or package(page.meta.get('og:url', '')) != app:
        raise ValueError(f'Listing ownership or package could not be verified for {app}')
    data = next((item for item in page.structured
                 if isinstance(item, dict) and item.get('@type') == 'SoftwareApplication'), {})
    name = data.get('name')
    if not isinstance(name, str) or not name.strip() or data.get('operatingSystem') != 'ANDROID':
        raise ValueError(f'Missing Android app metadata for {app}')
    author = data.get('author')
    if not isinstance(author, dict) or author.get('name') != PUBLISHER:
        raise ValueError(f'Android publisher could not be verified for {app}')
    if app not in page.app_offers:
        return None

    description = (data.get('description') or '').strip()
    return {
        'title': name.strip() + ' — Android',
        'url': DETAILS + app,
        'image': COVERS.get(app, DEFAULT_COVER),
        'description': (description + ' Available on Google Play for Android.').strip(),
        'category': 'Games' if str(data.get('applicationCategory', '')).startswith('GAME') else 'Tools',
        'browser': False,
        'storefront': 'Google Play',
        'platforms': ['Android'],
        'packageId': app,
    }


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, value):
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if not path.exists() or path.read_text() != text:
        temp = path.with_suffix(path.suffix + '.tmp')
        temp.write_text(text)
        temp.replace(path)


def launch_slug(app):
    stem = app.replace('.', '-')
    if not re.fullmatch(r'[a-z0-9-]+', stem):
        # Retain stable URLs for existing apps and avoid collisions for IDs with capitals or underscores.
        stem = re.sub(r'[^a-z0-9]+', '-', stem.lower()).strip('-')
        stem += '-' + hashlib.sha256(app.encode()).hexdigest()[:8]
    return stem + '-android-launch'


def save_screenshot(url, app):
    # Media is optional; a listing can still be announced if its gallery is temporarily unavailable.
    if not is_screenshot_url(url):
        return None
    limit = 2 * 1024 * 1024
    try:
        request = Request(url, headers={'Accept': 'image/webp, image/png, image/jpeg'})
        with urlopen(request, timeout=15) as response:
            if not is_screenshot_url(response.geturl()):
                return None
            mime = response.headers.get_content_type()
            data = response.read(limit + 1)
    except (OSError, ValueError) as error:
        print(f'Could not download {app} artwork: {error}', file=sys.stderr)
        return None

    if not data or len(data) > limit:
        return None
    if mime == 'image/webp' and data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        ext = 'webp'
    elif mime == 'image/png' and data.startswith(b'\x89PNG\r\n\x1a\n'):
        ext = 'png'
    elif mime == 'image/jpeg' and data.startswith(b'\xff\xd8\xff'):
        ext = 'jpg'
    else:
        return None
    file = ROOT / 'assets/google-play' / f'{app}.{ext}'
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(data)
    return '/' + file.relative_to(ROOT).as_posix()


def launch_post(card, slug, screenshot, product):
    name = card['title'].removesuffix(' — Android')
    description = card['description'].removesuffix('Available on Google Play for Android.').strip()
    body = ['Check the Google Play listing for device compatibility, availability, and current release details.']
    if description:
        body.insert(0, description)
    post = {
        'slug': slug,
        'date': datetime.now(ZoneInfo('America/Denver')).date().isoformat(),
        'title': f'{name} is now on Google Play',
        'summary': f'{name} is available for Android from Drunk Yeti Studio.',
        'body': body,
        'links': [
            {'label': 'Get it on Google Play', 'url': card['url']},
            {'label': 'More Drunk Yeti apps on Google Play', 'url': DEVELOPER},
        ],
    }
    if screenshot:
        post.update(image=screenshot, imageAlt=f'{name} gameplay screenshot from the official Google Play listing.')
    elif card['image'] != DEFAULT_COVER:
        post['image'] = card['image'].removeprefix('.')
    if product:
        post['product'] = product
    return post


def refresh_google_play(pages_dir=None):
    def fetch(url, name):
        if pages_dir:
            return (Path(pages_dir) / (name + '.html')).read_text()
        request = Request(url, headers={'User-Agent': 'DrunkYeti-Website-ReleaseCheck/1.0'})
        with urlopen(request, timeout=30) as response:
            return response.read().decode('utf-8')

    profile = Page(fetch(DEVELOPER + LOCALE, 'developer'))
    apps = sorted({app for link in profile.links if (app := package(link))})
    if not apps:
        raise ValueError('No app links found; saved releases retained (page may be blocked or changed)')

    # Verify the detail pages before changing saved data. Skip pre-registration and unavailable listings.
    released = []
    for app in apps:
        page = Page(fetch(DETAILS + app + LOCALE, app))
        if card := listing(page, app):
            released.append((card, page.screenshot))

    path = ROOT / 'google-play-releases.json'
    by_url = {entry['url']: entry for entry in read_json(path, [])}
    catalog = {entry['url']: entry for entry in read_json(ROOT / 'assets/catalog.json', [])}
    drafts = read_json(ROOT / 'news-drafts.json', [])
    published = read_json(ROOT / 'news.json', [])
    known_slugs = {post['slug'] for post in drafts + published}
    products = {
        product['releaseUrl']: product_path(product)
        for product in read_json(ROOT / 'studio-content.json', {}).get('products', [])
        if product.get('releaseUrl')
    }
    new_count = 0
    announcements = []
    for card, screenshot_url in released:
        url = card['url']
        if old := by_url.get(url):
            old_cover = old['image']
            if old_cover.startswith('./assets/') and (ROOT / old_cover).is_file():
                card['image'] = old_cover
        else:
            new_count += 1
            slug = launch_slug(card['packageId'])
            if slug not in known_slugs:
                screenshot = save_screenshot(screenshot_url, card['packageId']) if screenshot_url and not pages_dir else None
                if screenshot and card['image'] == DEFAULT_COVER:
                    card['image'] = '.' + screenshot
                announcements.append(launch_post(card, slug, screenshot, products.get(url)))
                known_slugs.add(slug)
        by_url[url] = card

    # Write announcements before recording the releases as seen, so a retry cannot lose a launch.
    save(ROOT / 'news.json', published + announcements)
    catalog.update(by_url)
    save(path, list(by_url.values()))
    save(ROOT / 'assets/catalog.json', list(catalog.values()))
    metadata = read_json(ROOT / 'assets/catalog-meta.json', {})
    metadata.update(
        count=len(catalog),
        categories=dict(sorted(Counter(entry['category'] for entry in catalog.values()).items())),
        googlePlaySource=DEVELOPER,
    )
    save(ROOT / 'assets/catalog-meta.json', metadata)
    print(json.dumps({
        'checked': len(apps),
        'unavailable': len(apps) - len(released),
        'new': new_count,
        'saved': len(by_url),
        'published': len(announcements),
    }))


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--pages-dir', type=Path, help='Offline HTML fixtures: developer.html and <package>.html')
    args = cli.parse_args()
    refresh_google_play(args.pages_dir)
    runpy.run_path(str(ROOT / 'scripts/build-search-pages.py'), run_name='__main__')
