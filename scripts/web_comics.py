"""Build the Drunk Yeti Webcomic reader and shareable episodes."""
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = "/comics/web/"
TITLE = "Drunk Yeti Webcomic"
DESCRIPTION = "Follow a tipsy Yeti and his raccoon hiking buddy through their alpine misadventures."
PROMO = (
    '<section class="callout"><h2>Drunk Yeti Webcomic</h2>'
    f'<p>{DESCRIPTION}</p><a class="button ink" href="{PATH}">Read the webcomic →</a></section>'
)


def episode_path(episode):
    return f'{PATH}{episode["slug"]}/'


def art_path(episode):
    return f'{PATH}art/{episode["id"]}-{episode["slug"]}.jpg'


def strip(episode, lazy=False):
    art = art_path(episode)
    title = escape(episode["title"], quote=True)
    alt = escape(episode["description"], quote=True)
    loading = ' loading="lazy"' if lazy else ''
    panels = ''.join(f'<li>{escape(panel)}</li>' for panel in episode["panels"])
    return (
        f'<figure class="webcomic-art"><a href="{art}" aria-label="View full-size artwork for {title}">'
        f'<img src="{art}" width="1440" height="960" alt="{alt}" decoding="async"{loading}></a></figure>'
        '<details class="webcomic-transcript"><summary>Read the transcript</summary>'
        f'<ol>{panels}</ol></details>'
    )


def build(page, write, origin):
    episodes = json.loads((ROOT / "comics/web/episodes.json").read_text(encoding="utf-8"))
    urls = [PATH]
    contents = ''.join(
        f'<li><a href="#episode-{episode["id"]}">{escape(episode["title"])}</a></li>'
        for episode in episodes
    )
    archive = ''.join(
        f'<article class="webcomic-strip" id="episode-{episode["id"]}"><h2>'
        f'<a href="{episode_path(episode)}">{escape(episode["title"])}</a></h2>'
        f'{strip(episode, lazy=index > 0)}</article>'
        for index, episode in enumerate(episodes)
    )
    body = (
        '<p><a href="/comics/">← All comics</a></p>'
        '<details class="webcomic-contents"><summary>Jump to an episode</summary>'
        f'<ol>{contents}</ol></details><div class="webcomic-reader">{archive}</div>'
        '<p><a href="#main">Back to top ↑</a></p>'
    )
    collection = {
        "@context": "https://schema.org", "@type": "CollectionPage",
        "name": TITLE, "url": origin + PATH, "description": DESCRIPTION,
        "mainEntity": {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": index, "name": episode["title"],
             "url": origin + episode_path(episode)}
            for index, episode in enumerate(episodes, 1)
        ]},
    }
    write(f"{PATH.strip('/')}/index.html", page(PATH, TITLE, DESCRIPTION, body, collection, image=art_path(episodes[0])))
    for index, episode in enumerate(episodes):
        path = episode_path(episode)
        previous_link = next_link = ""
        if index:
            previous_link = f'<a rel="prev" href="{episode_path(episodes[index - 1])}">← Previous episode</a>'
        if index + 1 < len(episodes):
            next_link = f'<a rel="next" href="{episode_path(episodes[index + 1])}">Next episode →</a>'
        body = (
            f'<p><a href="{PATH}#episode-{episode["id"]}">← All Drunk Yeti episodes</a></p>'
            f'<article class="webcomic-strip">{strip(episode)}</article>'
            f'<nav class="webcomic-navigation" aria-label="Episode navigation">{previous_link}{next_link}</nav>'
        )
        schema = {
            "@context": "https://schema.org", "@type": "ComicStory",
            "name": episode["title"], "url": origin + path, "description": episode["description"],
            "image": origin + art_path(episode),
            "publisher": {"@type": "Organization", "name": "Drunk Yeti Studio"},
            "isPartOf": {"@type": "CreativeWorkSeries", "name": TITLE, "url": origin + PATH},
        }
        title = f'{episode["title"]} · Drunk Yeti Webcomic'
        write(f"{path.strip('/')}/index.html", page(path, title, episode["description"], body, schema, image=art_path(episode)))
        urls.append(path)
    return urls
