#!/usr/bin/env python3
"""Send newly published Studio News articles to the studio's Discord webhook."""
import argparse
import base64
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from news_pages import ORIGIN

FEED = ORIGIN + '/news/feed.xml'
LEDGER_BRANCH = 'discord-news-deliveries'
LEDGER_FILE = '.github/discord-deliveries.json'
ARTICLE = re.compile(r'/news/[a-z0-9]+(?:-[a-z0-9]+)*/')
WEBHOOK = re.compile(r'https://discord\.com/api/(?:v\d+/)?webhooks/\d+/[A-Za-z0-9_.-]+')
STUDIO_SERVER = '1430323655904334028'
DISCORD_HEADERS = {'User-Agent': f'DiscordBot ({ORIGIN}, 1.0)'}
# These were already live when the integration was added.
EARLIER_ARTICLES = {
    ORIGIN + '/news/com-drunkyeti-houseofwilds-android-launch/',
    ORIGIN + '/news/games-drunkyeti-schmuck-android-launch/',
}


def live(url):
    try:
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
            if response.geturl() != url:
                raise ValueError('Studio News returned an unexpected redirect.')
            data = response.read(2_000_001)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ValueError('Studio News could not be read.') from exc
    if len(data) > 2_000_000:
        raise ValueError('Studio News response exceeds the size limit.')
    return data


def feed_items(data):
    items = []
    seen = set()
    for item in ElementTree.fromstring(data).findall('./channel/item'):
        url = item.findtext('link', '').strip()
        guid = item.findtext('guid', '').strip()
        title = item.findtext('title', '').strip()
        if guid != url or not url.startswith(ORIGIN) or not ARTICLE.fullmatch(url.removeprefix(ORIGIN)) or not title:
            raise ValueError('Studio News has an invalid article entry.')
        if guid not in seen:
            items.append((guid, title, item.findtext('description', '').strip()))
            seen.add(guid)
    return list(reversed(items))


def playable_link(url):
    parts = urlsplit(url)
    if parts.scheme != 'https':
        return False
    if parts.netloc == 'play.google.com':
        return parts.path == '/store/apps/details' and parts.query.startswith('id=')
    if parts.netloc == 'store.steampowered.com':
        return parts.path.startswith('/app/')
    if parts.netloc == 'apps.apple.com':
        return '/app/' in parts.path
    return parts.netloc == 'drunkyeti.itch.io' and len(parts.path) > 1


class ArticlePage(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.canonical = ''
        self.image = ''
        self.play = ''
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href') or ''
        if tag == 'meta' and attrs.get('property') == 'og:image':
            image = attrs.get('content') or ''
            if image.startswith(ORIGIN + '/assets/'):
                self.image = image
        if tag == 'a' and not self.play:
            href = attrs.get('href') or ''
            if playable_link(href):
                self.play = href


def message(url, title, summary, article_html):
    article = ArticlePage(article_html.decode('utf-8'))
    if article.canonical != url:
        raise ValueError('The live article did not match its RSS link.')
    description = summary[:1600]
    if article.play:
        description += f'\n\n[Play or get the release]({article.play})'
    embed = {'title': title[:256], 'description': description, 'url': url, 'color': 0xCAFF61}
    if article.image:
        embed['image'] = {'url': article.image}
    return {'embeds': [embed], 'allowed_mentions': {'parse': []}}


class Ledger:
    """Save a delivery attempt before it is sent, in a branch outside the Pages source."""
    def __init__(self, repository, token):
        if not re.fullmatch(r'[\w.-]+/[\w.-]+', repository) or not token:
            raise ValueError('Repository and GitHub Actions token are required for delivery.')
        self.endpoint = f'https://api.github.com/repos/{repository}'
        self.token = token
        self.branch = self.api(f'/git/ref/heads/{LEDGER_BRANCH}', optional=True)
        self.file = self.api(f'/contents/{LEDGER_FILE}?ref={LEDGER_BRANCH}', optional=True) if self.branch else None
        self.sha = self.file['sha'] if self.file else None
        self.items = json.loads(base64.b64decode(self.file['content'])) if self.file else {}

    def api(self, path, payload=None, method=None, optional=False):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(self.endpoint + path, data=data, method=method, headers={
            'Authorization': f'Bearer {self.token}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        })
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as exc:
            if optional and exc.code == 404:
                return None
            raise ValueError(f'Discord delivery ledger could not be accessed (HTTP {exc.code}).') from exc

    def save(self):
        if not self.branch:
            head = self.api('/git/ref/heads/main')['object']['sha']
            self.branch = self.api('/git/refs', {'ref': f'refs/heads/{LEDGER_BRANCH}', 'sha': head})
        content = base64.b64encode((json.dumps(self.items, indent=2) + '\n').encode()).decode()
        payload = {'message': 'Record Studio News Discord delivery', 'branch': LEDGER_BRANCH, 'content': content}
        if self.sha:
            payload['sha'] = self.sha
        self.sha = self.api(f'/contents/{LEDGER_FILE}', payload, 'PUT')['content']['sha']


def check_webhook(webhook):
    try:
        with urlopen(Request(webhook, headers=DISCORD_HEADERS), timeout=20) as response:
            metadata = json.load(response)
    except (OSError, ValueError):
        raise ValueError('Could not verify the Discord release webhook.') from None
    if metadata.get('guild_id') != STUDIO_SERVER or not metadata.get('channel_id'):
        raise ValueError('The release webhook must belong to the Drunk Yeti Studio server.')


def deliver(webhook, ledger, url, payload):
    ledger.items[url] = 'pending'
    ledger.save()
    request = Request(
        webhook + '?wait=true', json.dumps(payload).encode(),
        headers={**DISCORD_HEADERS, 'Content-Type': 'application/json'},
    )
    try:
        with urlopen(request, timeout=20) as response:
            message_id = str(json.load(response).get('id', ''))
    except HTTPError as exc:
        if 400 <= exc.code < 500:
            del ledger.items[url]
            ledger.save()
            raise ValueError(f'Discord rejected the message (HTTP {exc.code}).') from None
        raise ValueError('Discord delivery is unconfirmed. Check the channel before retrying.') from None
    except (URLError, TimeoutError, ValueError):
        raise ValueError('Discord delivery is unconfirmed. Check the channel before retrying.') from None
    if not message_id.isdigit():
        raise ValueError('Discord delivery is unconfirmed. Check the channel before retrying.')
    ledger.items[url] = message_id
    ledger.save()


def main(send):
    webhook = os.environ.get('DISCORD_RELEASE_WEBHOOK', '')
    if send and not webhook:
        print('Discord setup pending. Add DISCORD_RELEASE_WEBHOOK as an Actions secret.')
        return
    if send and not WEBHOOK.fullmatch(webhook):
        raise ValueError('DISCORD_RELEASE_WEBHOOK must be the Discord webhook URL.')
    items = feed_items(live(FEED))
    if not send:
        for url, title, summary in items:
            message(url, title, summary, live(url))
        print(f'Preview verified {len(items)} live news articles.')
        return

    check_webhook(webhook)
    ledger = Ledger(os.environ.get('GITHUB_REPOSITORY', ''), os.environ.get('GH_TOKEN', ''))
    pending = [url for url, status in ledger.items.items() if status == 'pending']
    if pending:
        print(f'::warning::{len(pending)} earlier Discord deliveries need review.')
    sent = 0
    for url, title, summary in items:
        if url in EARLIER_ARTICLES or url in ledger.items:
            continue
        deliver(webhook, ledger, url, message(url, title, summary, live(url)))
        print(f'Posted {url} to Discord.')
        sent += 1
    print(f'Checked {len(items)} live articles and posted {sent}.')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--send', action='store_true', help='Deliver new articles through the configured webhook.')
    try:
        main(cli.parse_args().send)
    except (OSError, ValueError, ElementTree.ParseError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
