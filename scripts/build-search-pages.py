#!/usr/bin/env python3
"""Build crawlable collections from the same catalog as the interactive homepage."""
from pathlib import Path
import json, html
from urllib.parse import urlparse
import studio_pages
from support_page import BODY as SUPPORT_BODY
from html.parser import HTMLParser
R=Path(__file__).resolve().parents[1]; ORIGIN='https://www.drunkyetistudio.com'; esc=html.escape
CATEGORIES=[('games','Games','Indie games','Explore Drunk Yeti indie games, from arcade adventures to card games. Find official releases, downloads and supported devices.'),('tools','Tools','Game makers & creative tools','Find Drunk Yeti software for creating games, art, music and more. Each release page explains the current features, downloads and license.'),('assets','Assets','Game asset packs','Browse Drunk Yeti asset packs for your next project. Check each pack’s store page for included files, formats and licensing terms.'),('mods','Mods','Game mods','Explore Drunk Yeti mods and new ways to play. Read the release page for compatible game versions, requirements and installation instructions.'),('soundtracks','Soundtracks','Game soundtracks','Listen beyond the game with Drunk Yeti soundtrack releases. Follow a release to its official store for tracks, previews and purchase options.'),('os','OS','Linux operating systems','Explore PlaySpace and Prismatic, Drunk Yeti’s Linux projects for gaming and creative work. Find requirements, downloads and installation guides.'),('comics','Comics','Comics & illustrated stories','Discover illustrated stories and comics from Drunk Yeti. Visit each publication’s release page for previews and available editions.')]
METRICOOL = '<script>function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"e890aba54a4994186f83bb6d7d77fe89"})});</script>'
nav='<a href="/desktop-buddy/">Desktop Buddy</a>'+''.join(f'<a href="/{slug}/">{esc(title)}</a>' for slug,_,title,_ in CATEGORIES)
def page(path,title,description,body,schema=None):
    url=ORIGIN+path
    metadata={'@context':'https://schema.org','@type':'WebPage','name':title,'description':description,'url':url} if schema is None else schema
    data=json.dumps(metadata,ensure_ascii=False).replace('<','\\u003c')
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} | Drunk Yeti Studio</title><meta name="description" content="{esc(description,quote=True)}"><link rel="canonical" href="{url}"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="website"><meta property="og:site_name" content="Drunk Yeti Studio"><meta property="og:title" content="{esc(title,quote=True)}"><meta property="og:description" content="{esc(description,quote=True)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{ORIGIN}/assets/social-preview-v1.png"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/collections.css"><link rel="stylesheet" href="/studio.css?v=2"><script type="application/ld+json">{data}</script>{METRICOOL}</head><body class="studio-page"><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">DRUNK YETI <small>STUDIO</small></a><a href="/account/">Your account ↗</a></header>{studio_pages.NAV}<main id="main"><p class="eyebrow">INDEPENDENT GAMES · CREATIVE SOFTWARE · ORIGINAL WORLDS</p><h1>{esc(title)}</h1><p class="intro">{esc(description)}</p>{body}</main><footer>{studio_pages.FOOTER}</footer></body></html>'''
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
    guides = {
        'os': '<section><h2>Choose your Linux project</h2><p>PlaySpace focuses on gaming, while Prismatic is presented as a creative operating system. Open the project that fits your interests to read its current release notes and installation guidance.</p><h2>Before you install</h2><p>Check the listed hardware requirements, download format and supported installation method. Back up your files before changing an operating system. A project’s release page is the best place to check what is included in the current build.</p><p>Looking for an individual app instead of an operating system? Browse our <a href="/tools/">creative tools and game makers</a>. For account questions, visit <a href="/help/">Help & support</a>.</p></section>',
        'comics': '<section><h2>Meet Moly, Bart & Skid</h2><p>The Heart Under The Mountain is a comic based on Moly, Bart & Skid. Open its publication page to explore the story and check the available editions and reading formats.</p><h2>Explore the studio’s original worlds</h2><p>Our illustrated stories sit alongside a wider collection of <a href="/games/">independent games</a> and <a href="/soundtracks/">music releases</a>. Browse those collections to discover more work from the studio, or visit <a href="/about/">About Drunk Yeti</a> for official channels and contact information.</p><p>Check each publication’s release page before downloading or purchasing. It contains the current description, previews and file information for that edition.</p></section>'
    }
    for slug,category,title,description in CATEGORIES:
        items=[c for c in cards if c['category']==category]; markup=[]
        for c in items:
            assert urlparse(c['url']).scheme=='https' and urlparse(c['url']).hostname in ('drunkyeti.itch.io','store.steampowered.com')
            img='/'+c['image'].removeprefix('./') if c['image'].startswith('./') else c['image']
            markup.append(f'<article><a href="{esc(c["url"],quote=True)}"><img src="{esc(img,quote=True)}" alt="{esc(c["title"],quote=True)} cover" loading="lazy" width="315" height="250"><h2>{esc(c["title"])}</h2></a><p>{esc(c.get("description") or "See the official release page for details and downloads.")}</p><a class="release" href="{esc(c["url"],quote=True)}">View release ↗</a></article>')
        hub={'games':'play','tools':'create','assets':'create','mods':'play','soundtracks':'worlds','os':'create','comics':'worlds'}[slug]
        intro=f'<aside class="collection-intro"><p>Looking for a place to start? <a href="/{hub}/">Explore our {"games" if hub=="play" else "creative software" if hub=="create" else "worlds and media"} guide →</a></p></aside>'
        body=intro+'<p class="note"> Availability, prices and platform support are listed on each official release page.</p><div class="grid">'+''.join(markup)+'</div>'+guides.get(slug,'')
        schema={'@context':'https://schema.org','@type':'CollectionPage','name':title,'description':description,'url':ORIGIN+'/'+slug+'/','mainEntity':{'@type':'ItemList','numberOfItems':len(items),'itemListElement':[{'@type':'ListItem','position':i+1,'name':c['title'],'url':c['url']} for i,c in enumerate(items)]}}
        write(slug+'/index.html',page('/'+slug+'/',title,description,body,schema));urls.append('/'+slug+'/')
    write('help/index.html',page('/help/','Help & support','Get help with Drunk Yeti accounts, Apple sign-in, purchases, Frostpass, browser games, downloads and Desktop Buddy.', SUPPORT_BODY))
    urls.extend(privacy_urls())
    urls = list(dict.fromkeys(urls + studio_pages.build(page,write,cards)))
    write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+ORIGIN+u+'</loc></url>' for u in urls)+'</urlset>\n')
    write('robots.txt','User-agent: *\nAllow: /\n\nSitemap: '+ORIGIN+'/sitemap.xml\n')
    print(f'Built {len(urls)} sitemap URLs and seven crawlable collections.')
if __name__=='__main__':main()
