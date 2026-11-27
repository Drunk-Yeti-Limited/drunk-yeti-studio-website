#!/usr/bin/env python3
"""Build crawlable collections from the same catalog as the interactive homepage."""
from pathlib import Path
import json, html
from urllib.parse import urlparse
import game_coverage
import studio_pages
import news_pages
import site_search
from android_lineup import development_section
from storefronts import MICROSOFT_PUBLISHER, store_link
from support_page import BODY as SUPPORT_BODY
from html.parser import HTMLParser
R=Path(__file__).resolve().parents[1]; ORIGIN='https://www.drunkyetistudio.com'; esc=html.escape
CATEGORIES=[('games','Games','Indie games','Explore Drunk Yeti indie games, from arcade adventures to card games. Find official releases, downloads and supported devices.'),('tools','Tools','Game makers & creative tools','Find Drunk Yeti software for creating games, art, music and more. Each release page explains the current features, downloads and license.'),('assets','Assets','Game asset packs','Browse Drunk Yeti asset packs for your next project. Check each pack’s store page for included files, formats and licensing terms.'),('mods','Mods','Game mods','Explore Drunk Yeti mods and new ways to play. Read the release page for compatible game versions, requirements and installation instructions.'),('soundtracks','Soundtracks','Game soundtracks','Listen beyond the game with Drunk Yeti soundtrack releases. Follow a release to its official store for tracks, previews and purchase options.'),('os','OS','Linux operating systems','Explore PlaySpace and Prismatic, Drunk Yeti’s Linux projects for gaming and creative work. Find requirements, downloads and installation guides.'),('comics','Comics','Comics & illustrated stories','Discover illustrated stories and comics from Drunk Yeti. Visit each publication’s release page for previews and available editions.')]
METRICOOL = '<script>function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"e890aba54a4994186f83bb6d7d77fe89"})});</script>'
nav='<a href="/desktop-buddy/">Desktop Buddy</a>'+''.join(f'<a href="/{slug}/">{esc(title)}</a>' for slug,_,title,_ in CATEGORIES)
def page(path,title,description,body,schema=None,intro=None,*,image=None,indexable=True):
    url=ORIGIN+path
    social_image = ORIGIN + (image or '/assets/social-preview-v1.png')
    robots = 'index,follow,max-image-preview:large' if indexable else 'noindex,follow'
    analytics = METRICOOL if indexable else ''
    social_type = "article" if schema and schema.get("@type") == "BlogPosting" else "website"
    metadata={'@context':'https://schema.org','@type':'WebPage','name':title,'description':description,'url':url} if schema is None else schema
    data=json.dumps(metadata,ensure_ascii=False).replace('<','\\u003c')
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} | Drunk Yeti Studio</title><meta name="description" content="{esc(description,quote=True)}"><link rel="canonical" href="{url}"><meta name="robots" content="{robots}"><meta property="og:type" content="{social_type}"><meta property="og:site_name" content="Drunk Yeti Studio"><meta property="og:title" content="{esc(title,quote=True)}"><meta property="og:description" content="{esc(description,quote=True)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{esc(social_image,quote=True)}"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="Drunk Yeti Studio News" href="/news/feed.xml"><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/collections.css"><link rel="stylesheet" href="/studio.css?v=3"><script type="application/ld+json">{data}</script>{analytics}</head><body class="studio-page"><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">DRUNK YETI <small>STUDIO</small></a><a href="/account/">Your account ↗</a></header>{studio_pages.NAV}<main id="main"><p class="eyebrow">INDEPENDENT GAMES · CREATIVE SOFTWARE · ORIGINAL WORLDS</p><h1>{esc(title)}</h1><p class="intro">{esc(intro if intro is not None else description)}</p>{body}</main><footer>{studio_pages.FOOTER}</footer></body></html>'''
def write(path,data):
    p=R/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data)
class IndexMetadata(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.canonical = None; self.noindex = False; self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')
        if tag == 'meta' and attrs.get('name', '').lower() in ('robots', 'googlebot'):
            self.noindex |= 'noindex' in attrs.get('content', '').lower()

def privacy_urls(root=R):
    # New app policies are published separately; catalog refresh must retain them.
    urls = []
    for file in sorted((root/'privacy').rglob('index.html')):
        url = '/' + file.parent.relative_to(root).as_posix() + '/'
        metadata = IndexMetadata(file.read_text())
        if not metadata.noindex and metadata.canonical == ORIGIN + url:
            urls.append(url)
    return urls

def main():
    cards=json.loads((R/'assets/catalog.json').read_text());urls=['/','/desktop-buddy/','/about/','/help/','/privacy/']
    products = studio_pages.read_products()
    product_titles = studio_pages.product_titles(products)
    posts = news_pages.read_posts(product_titles)
    studio_links = {p['catalogSlug']: studio_pages.path(p) for p in products}
    studio_links.update({p['releaseUrl']: studio_pages.path(p) for p in products if p.get('releaseUrl')})
    studio_links.update({p["microsoftUrl"]: studio_pages.path(p) for p in products if p.get("microsoftUrl")})
    microsoft_by_game = {studio_pages.path(p): p["microsoftUrl"] for p in products if p.get("microsoftUrl")}
    search_pages = {}

    def recorded_page(path, title, description, body, schema=None, intro=None, **options):
        search_pages[path] = (title, intro if intro is not None else description)
        return page(path, title, description, body, schema, intro, **options)

    guides = {
        'os': '<section><h2>Choose your Linux project</h2><p>PlaySpace focuses on gaming, while Prismatic is presented as a creative operating system. Open the project that fits your interests to read its current release notes and installation guidance.</p><h2>Before you install</h2><p>Check the listed hardware requirements, download format and supported installation method. Back up your files before changing an operating system. A project’s release page is the best place to check what is included in the current build.</p><p>Looking for an individual app instead of an operating system? Browse our <a href="/tools/">creative tools and game makers</a>. For account questions, visit <a href="/help/">Help & support</a>.</p></section>',
        'comics': '<section><h2>Meet Moly, Bart & Skid</h2><p>The Heart Under The Mountain is a comic based on Moly, Bart & Skid. Open its publication page to explore the story and check the available editions and reading formats.</p><h2>Explore the studio’s original worlds</h2><p>Our illustrated stories sit alongside a wider collection of <a href="/games/">independent games</a> and <a href="/soundtracks/">music releases</a>. Browse those collections to discover more work from the studio, or visit <a href="/about/">About Drunk Yeti</a> for official channels and contact information.</p><p>Check each publication’s release page before downloading or purchasing. It contains the current description, previews and file information for that edition.</p></section>'
    }
    android = (
        'android', 'Android', 'Android games & apps',
        'Find official Drunk Yeti Studio Android releases on Google Play, including card games, screenshots, and device compatibility links.',
    )
    steam = ('steam', 'Steam', 'Games on Steam', 'Explore official Drunk Yeti Steam releases, from idle games and factory management to hovercraft adventures and soundtracks.')
    windows = ("windows", "Microsoft Store", "Windows PC games", "Browse Drunk Yeti Studio Windows PC releases on the Microsoft Store.")
    storefronts = {"android": "Google Play", "steam": "Steam", "windows": "Microsoft Store"}
    for slug,category,title,description in [*CATEGORIES, android, steam, windows]:
        is_android = slug == 'android'
        if storefront := storefronts.get(slug):
            items = [c for c in cards if c.get('storefront') == storefront]
        else:
            items = [c for c in cards if c['category'] == category and c.get('storefront') != 'Microsoft Store']
        markup = []
        listing_links = []
        for c in items:
            assert urlparse(c['url']).scheme=='https' and urlparse(c['url']).hostname in ('drunkyeti.itch.io','store.steampowered.com','play.google.com','apps.microsoft.com')
            img='/'+c['image'].removeprefix('./') if c['image'].startswith('./') else c['image']
            product_url = studio_links.get(c['url']) or studio_links.get(c.get('packageId') or studio_pages.catalog_slug(c['url']))
            destination = product_url or c['url']
            listing_links.append(destination)
            store_label = 'Wishlist on Steam' if c.get('storefront') == 'Steam' and c.get('releaseStatus') == 'Coming soon' else 'Get it on Google Play' if c.get('storefront') == 'Google Play' else 'View on Steam' if c.get('storefront') == 'Steam' else 'View on Microsoft Store' if c.get('storefront') == 'Microsoft Store' else 'View on itch.io'
            alternate = microsoft_by_game.get(destination) if slug == "games" and c.get("storefront") is None else None
            alternate_link = store_link(alternate, "Get it from Microsoft", "release") if alternate else ""
            markup.append(
                f'<article><a href="{esc(destination, quote=True)}"><img src="{esc(img, quote=True)}" '
                f'alt="" loading="lazy" width="315" height="250"><h2>{esc(c["title"])}</h2></a>'
                f'<p>{esc(c.get("releaseStatus", ""))}</p>'
                f'<p>{esc(c.get("description") or "See the official release page for details and downloads.")}</p>'
                + store_link(c['url'], store_label + ' ↗', 'release') + alternate_link + '</article>'
            )
        hub={'windows':'play','steam':'play','android':'play','games':'play','tools':'create','assets':'create','mods':'play','soundtracks':'worlds','os':'create','comics':'worlds'}[slug]
        intro=f'<aside class="collection-intro"><p>Looking for a place to start? <a href="/{hub}/">Explore our {"games" if hub=="play" else "creative software" if hub=="create" else "worlds and media"} guide →</a></p></aside>'
        if slug == 'games':
            intro = '<aside class="collection-intro"><p><a href="/windows/">Browse Microsoft Store releases</a> · <a href="/android/">Browse Android releases</a> · <a href="/steam/">Browse Steam releases</a> · <a href="/play/">Find browser games</a></p></aside>'
        if is_android:
            intro = (
                '<aside class="collection-intro"><p>Each app’s Google Play listing shows whether you can install it on your device. '
                '<a href="https://play.google.com/store/apps/developer?id=Drunk+Yeti+Studio">Visit our Google Play developer page ↗</a></p>'
                '<p><a href="/games/">Browse all games</a> · <a href="/news/">Read the latest release news</a></p></aside>'
            )
        android_development = development_section(items) if is_android else ""
        if android_development:
            intro = '<p class="studio-links"><a href="#android-in-development">Android games in development ↓</a></p>' + intro
        if slug == 'windows':
            intro = '<aside class="collection-intro"><p>' + store_link(MICROSOFT_PUBLISHER, 'Browse the Microsoft Store publisher catalog', 'release') + '</p><p><a href="/games/">All games</a> · <a href="/steam/">Steam releases</a> · <a href="/android/">Google Play releases</a></p></aside>'
        body=intro+'<p class="note"> Availability, prices and platform support are listed on each official release page.</p><div class="grid">'+''.join(markup)+'</div>'+guides.get(slug,'')
        body += android_development
        schema={'@context':'https://schema.org','@type':'CollectionPage','name':title,'description':description,'url':ORIGIN+'/'+slug+'/','mainEntity':{'@type':'ItemList','numberOfItems':len(items),'itemListElement':[{'@type':'ListItem','position':i+1,'name':c['title'],'url':ORIGIN+url if url.startswith('/') else url} for i,(c,url) in enumerate(zip(items,listing_links))]}}
        write(slug+'/index.html',recorded_page('/'+slug+'/',title,description,body,schema));urls.append('/'+slug+'/')
    write('help/index.html',recorded_page('/help/','Help & support','Get help with Drunk Yeti accounts, Apple sign-in, purchases, Frostpass, browser games, downloads and Desktop Buddy.', SUPPORT_BODY))
    urls.extend(privacy_urls())
    urls.append(game_coverage.build(page, write, cards))
    urls.extend(studio_pages.build(recorded_page, write, cards, products, posts))
    urls.extend(news_pages.build(recorded_page, write, posts, product_titles, studio_pages.DISCORD_INVITE))
    urls = list(dict.fromkeys(urls))
    site_search.build(page, write, search_pages, products, posts, cards)
    article_dates = {news_pages.article_path(post): post['date'] for post in posts}
    entries = [
        '<url><loc>' + ORIGIN + url + '</loc>'
        + (f'<lastmod>{article_dates[url]}</lastmod>' if url in article_dates else '')
        + '</url>'
        for url in urls
    ]
    write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
          + ''.join(entries) + '</urlset>\n')
    write('robots.txt','User-agent: *\nAllow: /\n\nSitemap: '+ORIGIN+'/sitemap.xml\n')
    print(f'Built {len(urls)} sitemap URLs and {len(CATEGORIES) + len(storefronts)} crawlable collections.')
if __name__=='__main__':main()
