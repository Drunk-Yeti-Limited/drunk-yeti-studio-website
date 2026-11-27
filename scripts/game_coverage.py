"""Render the press directory from public, game-specific coverage links."""

import html
import json
from pathlib import Path
from urllib.parse import urlsplit

PATH = '/press/game-coverage/'
TITLE = 'Game listings & Steam curator reviews'
DESCRIPTION = 'Browse Drunk Yeti Studio games for third-party directory listings and public Steam curator reviews.'

ROOT = Path(__file__).resolve().parents[1]
ESCAPE = html.escape


def link_list(links):
    items = ''.join(
        f'<li><a href="{ESCAPE(link["url"], quote=True)}">{ESCAPE(link["label"])}</a></li>'
        for link in links
    )
    return f'<ul>{items}</ul>'


def build(page, write, cards):
    coverage = json.loads((ROOT / 'game-coverage.json').read_text())
    steam_games = {
        urlsplit(card['url']).path.split('/')[2]: card
        for card in cards
        if card.get('storefront') == 'Steam' and card['category'] == 'Games'
    }
    entries = []
    for app, card in sorted(steam_games.items(), key=lambda entry: entry[1]['title'].casefold()):
        game = coverage.get(app, {})
        listings = [*game.get('listings', []), {
            'label': 'SteamDB', 'url': f'https://steamdb.info/app/{app}/',
        }]
        reviews = game.get('curators', [])
        review_body = link_list(reviews) if reviews else '<p>No individual curator reviews verified.</p>'
        entries.append(
            f'<details id="steam-{app}"><summary>{ESCAPE(card["title"])}</summary>'
            f'<div class="coverage-links"><p><a href="{ESCAPE(card["url"], quote=True)}">Official Steam page</a></p>'
            f'<details><summary>Directory listings ({len(listings)})</summary>{link_list(listings)}</details>'
            f'<details><summary>Steam curator reviews ({len(reviews)})</summary>{review_body}'
            f'<p><a href="https://store.steampowered.com/curators/curatorsreviewing/?appid={app}">'
            'Browse this game’s curators on Steam</a></p></details></div></details>'
        )
    body = '<section aria-label="Games in alphabetical order">\n' + '\n'.join(entries) + '\n</section>'
    write(PATH.strip('/') + '/index.html', page(PATH, TITLE, DESCRIPTION, body))
    return PATH
