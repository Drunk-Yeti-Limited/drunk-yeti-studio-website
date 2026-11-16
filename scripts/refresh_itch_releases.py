"""Check studio itch.io build channels and queue new devlog entries and builds as news drafts."""
import hashlib
import json
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from refresh_google_play import ROOT, read_json, save

PROFILE = 'https://drunkyeti.itch.io'
LATEST = 'https://api.itch.io/wharf/latest'
DENVER = ZoneInfo('America/Denver')
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')


def fetch(url):
    request = Request(url, headers={'User-Agent': 'DrunkYeti-Website-ReleaseCheck/1.0'})
    with urlopen(request, timeout=8) as response:
        payload = response.read(2_000_001)
    if len(payload) > 2_000_000:
        raise ValueError('itch.io response too large')
    return payload


def check_version(slug, channel, read):
    query = urlencode({'target': 'drunkyeti/' + slug, 'channel_name': channel})
    result = json.loads(read(LATEST + '?' + query))
    if result.get('errors') == ['invalid channel']:
        return None
    if result.get('errors'):
        raise ValueError('itch.io did not return channel data')
    version = result.get('latest')
    if version is None:
        return None
    if not isinstance(version, str) or not version.strip() or len(version) > 128:
        raise ValueError('Unrecognized build version')
    return version


def devlogs(slug, read):
    try:
        tree = ElementTree.fromstring(read(f'{PROFILE}/{slug}/devlog.rss'))
    except HTTPError as error:
        if error.code == 404:
            return
        raise
    if tree.tag != 'rss' or tree.find('channel') is None:
        raise ValueError('Expected itch.io devlog RSS')
    for item in tree.findall('./channel/item'):
        url = (item.findtext('link') or '').strip()
        target = urlparse(url)
        if (target.scheme != 'https' or target.netloc != 'drunkyeti.itch.io'
                or not target.path.startswith(f'/{slug}/devlog/')):
            continue
        title = ' '.join((item.findtext('title') or '').split())[:150]
        try:
            published = parsedate_to_datetime(item.findtext('pubDate', ''))
        except (ValueError, TypeError):
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        if title:
            yield url, title, published.astimezone(DENVER).date().isoformat()


def post(slug, title, date, summary, url, key):
    digest = hashlib.sha256(key.encode()).hexdigest()[:16]
    return {
        'slug': f'itch-{slug}-{digest}', 'date': date, 'title': title, 'summary': summary,
        'body': [summary], 'links': [{'label': 'View on itch.io', 'url': url}],
    }


def refresh_itch_releases(root=ROOT, read=fetch):
    config = read_json(root / 'itch-releases.json', {})
    state_path = root / 'assets/itch-releases.json'
    drafts_path = root / 'news-drafts.json'
    state = read_json(state_path, {})
    drafts = read_json(drafts_path, [])
    known = {entry['slug'] for entry in drafts + read_json(root / 'news.json', [])}
    added = 0
    today = datetime.now(DENVER).date().isoformat()

    def queue(entry):
        nonlocal added
        if entry['slug'] not in known:
            drafts.append(entry)
            known.add(entry['slug'])
            added += 1

    for slug, project in config.items():
        if not SLUG.fullmatch(slug) or any(not SLUG.fullmatch(c) for c in project['channels']):
            raise ValueError('Invalid itch.io project or channel in configuration')
        title = project['title']
        record = state.setdefault(slug, {})
        versions = record.setdefault('versions', {})
        changes = {}
        for channel in project['channels']:
            try:
                version = check_version(slug, channel, read)
            except (OSError, ValueError) as error:
                print(f'itch.io {slug}/{channel}: {error}. Retaining previous version.')
                continue
            if version and versions.get(channel) != version:
                if channel in versions:
                    changes.setdefault(version, []).append(channel)
                versions[channel] = version
        for version, channels in sorted(changes.items()):
            queue(post(slug, f'{title} {version} on itch.io', today,
                       f'{title} build {version} is available for {", ".join(sorted(channels))}.',
                       f'{PROFILE}/{slug}', 'build:' + version))

        try:
            for url, heading, date in devlogs(slug, read):
                queue(post(slug, f'{title} — {heading}', date,
                           f'Drunk Yeti Studio posted a {title} update on itch.io.', url, url))
        except (OSError, ValueError, ElementTree.ParseError) as error:
            print(f'itch.io devlog for {slug}: {error}. Retaining existing drafts.')

    save(drafts_path, drafts)
    save(state_path, state)
    print(json.dumps({'itch_projects': len(config), 'new_itch_drafts': added}))


if __name__ == '__main__':
    refresh_itch_releases()
