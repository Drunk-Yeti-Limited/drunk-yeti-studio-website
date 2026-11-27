"""Editorial previews for Android editions that are still underway."""
from html import escape
import re

GAMES = (
    ('Klay Karts', ('Klay Karts', 'Clay Karts'), '/games/klay-karts/', 'Race through sculpted circuits and reshape your shortcuts.'),
    ('Super Nexus War', ('Nexus Wars', 'Super Nexus War'), 'https://drunkyeti.itch.io/nexus-wars', 'Command forces and fight for control of the battlefield.'),
    ('Chainfall', ('Chainfall', 'Chainfall Deluxe'), 'https://drunkyeti.itch.io/chainfall', 'Jump, convert blocks, and take on flat, cube, and sphere arenas.'),
    ('MANA', ('MANA',), 'https://store.steampowered.com/app/2724160/', 'Play the angles in a colorful strategy arena.'),
    ('Squirrel Idle Tycoon', ('Squirrel Idle Tycoon',), 'https://store.steampowered.com/app/4166770/', 'Build and automate a squirrel-powered ice and water business.'),
)


def title_key(title):
    return re.sub(r'[^a-z0-9]', '', title.removesuffix(' — Android').lower())


def development_section(releases):
    live = {title_key(release['title']) for release in releases}
    cards = []
    for title, aliases, url, description in GAMES:
        if any(title_key(alias) in live for alias in aliases):
            continue
        label = 'Explore the game' if url.startswith('/') else 'See another edition'
        cards.append(
            f'<article class="callout"><h3>{escape(title)}</h3><p>{escape(description)}</p>'
            f'<a href="{escape(url, quote=True)}">{label} →</a></article>'
        )
    if not cards:
        return ''
    return (
        '<section class="wide" id="android-in-development" aria-labelledby="android-development-title">'
        '<h2 id="android-development-title">Android games in development</h2>'
        '<p>These Android editions are in development, testing, or release review. '
        'Follow <a href="/news/">studio news</a> for public launch announcements.</p>'
        '<div class="feature-columns">' + ''.join(cards) + '</div></section>'
    )
