#!/usr/bin/env python3
"""Send one reviewed release announcement to Mastodon or Discord."""
import argparse
import hashlib
import json
import os
import re
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from announce_studio_news import DISCORD_HEADERS, STUDIO_SERVER
from release_social import ROOT, build_packages, write_json

MASTODON = 'https://mastodon.social'
MASTODON_ACCOUNT = 'drunkyetistudio'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def request_json(url, *, payload=None, headers=None):
    request = Request(url, data=payload, headers=headers or {})
    try:
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            return json.load(response)
    except URLError as exc:
        status = getattr(exc, 'code', None)
        label = f'HTTP {status}' if status else 'network error'
        raise RuntimeError(f'Publishing request failed ({label}). Check the destination before retrying.') from None


def validate_discord_webhook(webhook):
    url = urlsplit(webhook)
    if url.scheme != 'https' or url.netloc != 'discord.com' or url.query or url.fragment:
        raise ValueError('Use the official Discord channel webhook URL.')
    if not re.fullmatch(r'/api(?:/v\d+)?/webhooks/\d+/[A-Za-z0-9_-]+', url.path):
        raise ValueError('Use a Discord incoming webhook URL.')


def discord_send(draft, webhook):
    validate_discord_webhook(webhook)
    caption, _ = draft['caption'].rsplit('\n\n', 1)
    embed = {'description': caption, 'url': draft['link'], 'title': 'Studio release'}
    if draft['artwork']:
        embed['image'] = {'url': draft['artwork']['url']}
    payload = {'embeds': [embed], 'allowed_mentions': {'parse': []}}
    result = request_json(webhook + '?wait=true', payload=json.dumps(payload).encode(),
                          headers={**DISCORD_HEADERS, 'Content-Type': 'application/json'})
    return result['id']


def verify_mastodon_account(token):
    headers = {'Authorization': f'Bearer {token}'}
    identity = request_json(f'{MASTODON}/api/v1/accounts/verify_credentials', headers=headers)
    if identity['username'] != MASTODON_ACCOUNT or identity['acct'] != MASTODON_ACCOUNT:
        raise ValueError('The Mastodon credentials belong to a different account.')
    return headers


def mastodon_send(draft, token, slug):
    headers = verify_mastodon_account(token)
    instance = request_json(f'{MASTODON}/api/v2/instance')
    limits = instance['configuration']['statuses']
    caption = draft['caption']
    if len(caption) > limits['max_characters']:
        raise ValueError('The caption exceeds this Mastodon server’s limit.')
    # The release page supplies the preview image. Publishing the link only needs status access.
    payload = json.dumps({'status': caption, 'visibility': 'public', 'language': 'en'}).encode()
    headers['Content-Type'] = 'application/json'
    headers['Idempotency-Key'] = hashlib.sha256(f'drunk-yeti:{slug}'.encode()).hexdigest()
    result = request_json(f'{MASTODON}/api/v1/statuses', payload=payload, headers=headers)
    return result['url']


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('slug')
    cli.add_argument('channel', choices=('mastodon', 'discord'))
    mode = cli.add_mutually_exclusive_group()
    mode.add_argument('--send', action='store_true', help='Publish this announcement')
    mode.add_argument('--check', action='store_true', help='Verify the destination without posting')
    args = cli.parse_args()
    output = ROOT / 'preview' / 'release-social'
    build_packages(output, args.slug)
    package = json.loads((output / f'{args.slug}.json').read_text())
    draft = package['channels'].get(args.channel)
    if not draft:
        cli.error('This release has already been recorded for that channel.')
    if args.check:
        try:
            if args.channel == 'discord':
                webhook = os.environ['DISCORD_RELEASE_WEBHOOK']
                validate_discord_webhook(webhook)
                info = request_json(webhook, headers=DISCORD_HEADERS)
                if info.get('type') != 1 or not str(info.get('channel_id', '')).isdigit():
                    raise ValueError('Discord did not confirm an incoming channel webhook.')
                if info.get('guild_id') != STUDIO_SERVER:
                    raise ValueError('The release webhook belongs to a different Discord server.')
                print(f'Discord channel ID: {info["channel_id"]}')
            else:
                verify_mastodon_account(os.environ['MASTODON_RELEASE_TOKEN'])
                print(f'Mastodon account: @{MASTODON_ACCOUNT}@mastodon.social')
        except (ValueError, RuntimeError, KeyError) as exc:
            cli.error(str(exc))
        return
    if not args.send:
        print(json.dumps(draft, ensure_ascii=False, indent=2))
        return
    try:
        if args.channel == 'discord':
            delivery = discord_send(draft, os.environ['DISCORD_RELEASE_WEBHOOK'])
        else:
            delivery = mastodon_send(draft, os.environ['MASTODON_RELEASE_TOKEN'], args.slug)
    except (ValueError, RuntimeError, KeyError) as exc:
        cli.error(str(exc))
    receipts = output / 'receipts.json'
    deliveries = json.loads(receipts.read_text()) if receipts.exists() else {}
    deliveries.setdefault(args.slug, {})[args.channel] = delivery
    write_json(receipts, deliveries)
    build_packages(output, args.slug, args.channel)
    print(f'Published to {args.channel}: {delivery}')


if __name__ == '__main__':
    main()
