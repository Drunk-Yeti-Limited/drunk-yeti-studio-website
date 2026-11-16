#!/usr/bin/env python3
"""Prepare channel-specific announcement drafts from published studio news."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from news_pages import ORIGIN, ROOT, article_path, read_posts
from studio_pages import product_titles, read_products

CHANNELS = {
    'bluesky': 'social', 'mastodon': 'social', 'threads': 'social',
    'facebook': 'social', 'instagram': 'social', 'youtube': 'social',
    'tiktok': 'social', 'pinterest': 'social', 'discord': 'community',
    'patreon': 'community', 'itchio': 'store', 'steam': 'store',
    'newsletter': 'email',
}
VIDEO_CHANNELS = {'instagram', 'youtube', 'tiktok'}
MANUAL_CHANNELS = {'patreon', 'itchio', 'steam', 'newsletter'}
GAMBLING_TERMS = ('casino', 'slots', 'hold’em', "hold'em")


def campaign_url(post, channel):
    tags = urlencode({
        'utm_source': channel,
        'utm_medium': CHANNELS[channel],
        'utm_campaign': post['slug'],
    })
    return f'{ORIGIN}{article_path(post)}?{tags}'


def short_caption(post, link):
    # Counting code points is conservative for multi-code-point graphemes.
    room = 300 - len(link) - 2
    title = post['title']
    if room < 2:
        raise ValueError(f'Bluesky link exceeds 300 characters for {post["slug"]}')
    message = f'{title}\n\n{post["summary"]}'
    if len(message) > room:
        message = title if len(title) <= room else title[:room - 1].rstrip() + "…"
    return f'{message}\n\n{link}'


def has_store_link(post, hostname):
    return any(urlsplit(link['url']).hostname == hostname for link in post.get('links', []))


def release_package(post, sent):
    artwork = post.get('image')
    alt = post.get('imageAlt') or f'{post["title"]} — official studio artwork'
    search_text = ' '.join([post['slug'], post['title'], post['summary'], *post['body']]).lower()
    channels = {}
    for channel in CHANNELS:
        if channel in sent:
            continue
        if channel == 'steam' and not has_store_link(post, 'store.steampowered.com'):
            continue
        if channel == 'itchio' and not has_store_link(post, 'drunkyeti.itch.io'):
            continue
        if channel == 'tiktok' and any(term in search_text for term in GAMBLING_TERMS):
            continue
        link = campaign_url(post, channel)
        caption = f'{post["title"]}\n\n{post["summary"]}\n\n{link}'
        if channel == 'bluesky':
            caption = short_caption(post, link)
        if channel in MANUAL_CHANNELS:
            caption = '\n\n'.join([post['title'], post['summary'], *post['body'], link])
        media = None
        if artwork:
            media = {'url': ORIGIN + artwork, 'alt': alt}
        channels[channel] = {
            'caption': caption,
            'link': link,
            'artwork': media,
            'video': post.get('video'),
            'needs_video': channel in VIDEO_CHANNELS and not post.get('video'),
            'review_required': True,
        }
    return {
        'slug': post['slug'],
        'title': post['title'],
        'canonical_url': ORIGIN + article_path(post),
        'store_links': post.get('links', []),
        'channels': channels,
    }


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.json.partial')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def build_packages(output, slug=None, mark_sent=None):
    posts = read_posts(product_titles(read_products()))
    if slug:
        posts = [post for post in posts if post['slug'] == slug]
        if not posts:
            raise ValueError(f'No published release matches {slug}')
    if mark_sent and not slug:
        raise ValueError('--mark-sent requires --slug')
    ledger_path = output / 'sent.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
    if mark_sent:
        ledger[slug] = sorted(set(ledger.get(slug, [])) | {mark_sent})
        write_json(ledger_path, ledger)
    receipts_path = output / 'receipts.json'
    receipts = json.loads(receipts_path.read_text()) if receipts_path.exists() else {}
    for post in posts:
        omitted = set(ledger.get(post['slug'], [])) | set(receipts.get(post['slug'], {}))
        package = release_package(post, omitted)
        write_json(output / f'{post["slug"]}.json', package)
    print(f'Prepared {len(posts)} release draft package(s) in {output}')
    return posts


def summarize_new_releases(output, previously_published):
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if not summary:
        return
    with Path(summary).open('a', encoding='utf-8') as file:
        for path in sorted(output.glob('*.json')):
            if path.stem in previously_published or path.stem in {'sent', 'receipts'}:
                continue
            package = json.loads(path.read_text())
            file.write(f'\n## Release drafts for {package["title"]}\n\n')
            file.write('Review the copy and destination before publishing.\n')
            for channel, draft in package['channels'].items():
                file.write(f'\n### {channel}\n\n')
                file.write(draft['caption'] + '\n')
                if draft['artwork']:
                    file.write(f'\n[Artwork]({draft["artwork"]["url"]}) · {draft["artwork"]["alt"]}\n')
                if draft['video']:
                    file.write(f'\n[Video]({draft["video"]})\n')
                elif draft['needs_video']:
                    file.write('\nAttach a gameplay clip before scheduling.\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'preview' / 'release-social')
    parser.add_argument('--slug', help='Prepare only this published news slug')
    parser.add_argument('--mark-sent', choices=CHANNELS, help='Record a verified delivery')
    args = parser.parse_args()
    build_packages(args.output, args.slug, args.mark_sent)


if __name__ == '__main__':
    main()
