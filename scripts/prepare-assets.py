#!/usr/bin/env python3
"""Refresh the root GitHub Pages catalog from public itch.io profile cards and product descriptions.

Run: python3 scripts/prepare-assets.py
Requires Pillow; no API key, backend or GitHub Actions workflow is needed.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROFILE = 'https://drunkyeti.itch.io/'


def fetch(url):
    request = Request(url, headers={'User-Agent': 'DrunkYeti-Portfolio-Catalog/1.2'})
    with urlopen(request, timeout=30) as response:
        return response.read()


class ProfileParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.cards = []
        self.card = None
        self.depth = 0
        self.capture = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get('class', '').split()
        if tag == 'div' and self.card is None and 'game_cell' in classes:
            self.card = {'title': '', 'description': '', 'browser': False}
            self.depth = 0
        if self.card is None:
            return
        if tag == 'div':
            self.depth += 1
        if tag == 'a' and 'title' in classes and 'game_link' in classes:
            self.card['url'] = attrs.get('href', '')
            self.capture = ('title', 'a', self.depth)
        elif tag == 'div' and 'game_text' in classes:
            self.capture = ('description', 'div', self.depth)
        if tag == 'img':
            source = attrs.get('data-lazy_src') or attrs.get('src')
            if source and urlparse(source).hostname == 'img.itch.zone':
                self.card['coverSource'] = source
        if 'web_flag' in classes:
            self.card['browser'] = True
        if 'price_tag' in classes:
            self.card['productType'] = attrs.get('title', '').lower()

    def handle_data(self, data):
        if self.card is not None and self.capture:
            self.card[self.capture[0]] += data

    def handle_endtag(self, tag):
        if self.card is None:
            return
        if self.capture and tag == self.capture[1] and self.depth == self.capture[2]:
            self.capture = None
        if tag == 'div':
            self.depth -= 1
            if self.depth == 0:
                self.cards.append(self.card)
                self.card = None
                self.capture = None


class DescriptionParser(HTMLParser):
    """Read only itch.io's authored description, never comments/nav/script text."""
    BLOCKS = {'div', 'p', 'br', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4',
              'h5', 'h6', 'section', 'blockquote', 'table', 'tr', 'td', 'hr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.found = False
        self.parts = []
        self.ignored = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div' and not self.depth and 'formatted_description' in attrs.get('class', '').split():
            self.depth = 1
            self.found = True
            self.parts.append(' ')
            return
        if not self.depth:
            return
        if tag == 'div':
            self.depth += 1
        if tag in {'script', 'style', 'template'}:
            self.ignored = tag
        if not self.ignored and tag in self.BLOCKS:
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if not self.depth:
            return
        if tag == self.ignored:
            self.ignored = None
        if tag in self.BLOCKS:
            self.parts.append(' ')
        if tag == 'div':
            self.depth -= 1

    def handle_data(self, data):
        if self.depth and not self.ignored:
            self.parts.append(data)

    @property
    def frostpass(self):
        text = ' '.join(''.join(self.parts).split()).casefold()
        return bool(re.search(r'\byeti\s+frostpass\b', text))


def refresh_frostpass(card, previous=None, pages_dir=None):
    """A failed fetch must not silently remove a previously verified badge."""
    if urlparse(card['url']).hostname != 'drunkyeti.itch.io':
        return None
    try:
        if pages_dir is not None:
            slug = urlparse(card['url']).path.strip('/')
            if not re.fullmatch(r'[a-z0-9-]+', slug):
                raise ValueError('Invalid product slug')
            html = (pages_dir / (slug + '.html')).read_text(encoding='utf-8')
        else:
            html = fetch(card['url']).decode('utf-8')
        parser = DescriptionParser()
        parser.feed(html)
        parser.close()
        if not parser.found:
            raise ValueError('Product description missing; page may be unavailable')
        card['frostpass'] = parser.frostpass
        card['frostpassCheck'] = 'verified'
        return None
    except Exception as error:
        card['frostpass'] = bool(previous and previous.get('frostpass') is True)
        card['frostpassCheck'] = 'unavailable'
        return f"{card['title']} Frostpass check: {error}"


def classify(card):
    title = card['title'].lower()
    text = f"{title} {card.get('description', '')}".lower()
    kind = card.get('productType', '')
    if re.search(r'\bmods?\b', title):
        return 'Mods'
    if re.search(r'soundtrack|\bost\b|game[- ]music|music (?:album|pack)', title):
        return 'Soundtracks'
    if re.search(r'\bcomic\b|graphic novel', text):
        return 'Comics'
    if 'asset pack' in kind or any(word in text for word in (
        'asset pack', 'asset collection', 'adventure kit', 'side-scroller kit',
        'top-down alien frontier', 'samurai collection', 'illustrated sci-fi',
    )) or any(word in title for word in (
        'kana ronin', 'lantern sky', 'combined arms', 'heartpost:', 'halloween realms',
        'winter & christmas', 'autumn & thanksgiving', 'new year', 'orbitbreak: sector zero',
        'orbitbreak: alien frontier',
    )) and 'is built' not in title:
        return 'Assets'
    if 'tool' in kind or any(word in title for word in (
        'maker', 'generator', 'analyzer', 'pioneer', 'wizard', 'explorer', 'converter',
        'snowing app', 'soloist forge', 'desktop buddy',
    )):
        return 'Tools'
    return 'Games'


def normalize(card):
    url = card.get('url', '').split('?', 1)[0].rstrip('/')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'drunkyeti.itch.io':
        raise ValueError(f'Unexpected product URL: {url}')
    slug = parsed.path.strip('/')
    if not re.fullmatch(r'[a-z0-9-]+', slug):
        raise ValueError(f'Invalid product slug: {slug}')
    card['title'] = ' '.join(card['title'].replace('\u200b', '').split())
    card['description'] = ' '.join(card.get('description', '').split()).rstrip(' ]')
    if not card['title']:
        raise ValueError(f'Missing product title: {url}')
    return dict(title=card['title'], url=url,
                image=f'./assets/covers/{slug}.webp' if card.get('coverSource') else './assets/logo.png',
                description=card['description'], category=classify(card),
                browser=bool(card.get('browser')), **({'coverSource': card['coverSource']} if card.get('coverSource') else {}))


def write_if_changed(path, content):
    if path.exists() and path.read_bytes() == content:
        return False
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_bytes(content)
    temporary.replace(path)
    return True


def refresh_cover(card, previous=None):
    if not card.get('coverSource'):
        return None
    destination = ROOT / card['image'].removeprefix('./')
    try:
        if (previous and previous.get('coverSource') == card['coverSource']
                and previous.get('image') == card['image'] and destination.exists()):
            with Image.open(destination) as image:
                image.verify()
            return None
        with Image.open(BytesIO(fetch(card['coverSource']))) as image:
            image.load()
            # Preserve transparency against the site's card background.
            rgba = image.convert('RGBA')
            background = Image.new('RGBA', rgba.size, '#dbedf0')
            background.alpha_composite(rgba)
            output = BytesIO()
            background.convert('RGB').save(output, 'WEBP', quality=86)
        write_if_changed(destination, output.getvalue())
        return None
    except Exception as error:
        if not destination.exists():
            card['image'] = './assets/logo.png'
        return f"{card['title']}: {error}"


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--html', type=Path, help='Use a saved profile page for offline checks')
    cli.add_argument('--pages-dir', type=Path, help='Read saved product descriptions from <slug>.html files')
    args = cli.parse_args()
    parser = ProfileParser()
    parser.feed(args.html.read_text() if args.html else fetch(PROFILE).decode('utf-8'))
    cards = []
    seen = set()
    for raw in parser.cards:
        card = normalize(raw)
        if card['url'] not in seen:
            cards.append(card)
            seen.add(card['url'])
    extras_path = ROOT / 'catalog-extras.json'
    if extras_path.exists():
        for extra in json.loads(extras_path.read_text()):
            if urlparse(extra['url']).hostname not in ('store.steampowered.com', 'drunkyeti.itch.io'):
                raise ValueError('Unsupported extra storefront')
            if extra['url'] not in seen:
                cards.append(extra)
                seen.add(extra['url'])
    old_path = ROOT / 'assets/catalog.json'
    old = json.loads(old_path.read_text()) if old_path.exists() else []
    if not cards or len(cards) < len(old) * .75:
        raise RuntimeError('Profile response appears incomplete; existing catalog was preserved.')
    (ROOT / 'assets/covers').mkdir(parents=True, exist_ok=True)
    previous = {card['url']: card for card in old}
    with ThreadPoolExecutor(max_workers=4) as pool:
        description_warnings = [warning for warning in pool.map(
            lambda card: refresh_frostpass(card, previous.get(card['url']), args.pages_dir), cards) if warning]
    with ThreadPoolExecutor(max_workers=6) as pool:
        warnings = [warning for warning in pool.map(
            lambda card: refresh_cover(card, previous.get(card['url'])), cards) if warning]
    warnings = description_warnings + warnings
    frostpass_count = sum(card.get('frostpass') is True for card in cards)
    changed = write_if_changed(old_path, (json.dumps(cards, ensure_ascii=False, indent=2) + '\n').encode())
    categories = dict(sorted(Counter(card['category'] for card in cards).items()))
    metadata_path = ROOT / 'assets/catalog-meta.json'
    if changed or not metadata_path.exists():
        metadata = dict(source=PROFILE, updated=datetime.now(timezone.utc).isoformat(),
                        count=len(cards), categories=categories, frostpass=frostpass_count, warnings=warnings)
        write_if_changed(metadata_path, (json.dumps(metadata, indent=2) + '\n').encode())
    print(json.dumps(dict(count=len(cards), added=len(seen - {p['url'] for p in old}),
                          categories=categories, frostpass=frostpass_count, changed=changed, warnings=warnings), indent=2))
    if warnings:
        print('Failed description checks retained prior Frostpass labels; cover failures retained existing artwork or the studio-logo fallback.', file=sys.stderr)


if __name__ == '__main__':
    from refresh_merch import refresh_merch
    failures = []
    for name, refresh in [('itch.io', main), ('Redbubble', refresh_merch)]:
        try:
            refresh()
        except Exception as error:
            failures.append(name)
            print(f'{name} refresh failed: {error}. Last saved catalog retained.', file=sys.stderr)
    if failures:
        sys.exit(1)
