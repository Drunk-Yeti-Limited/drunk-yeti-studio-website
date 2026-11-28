"""Build reviewed release news and RSS from news.json. No raw HTML in entries."""
import json,re,html
from pathlib import Path
from datetime import date,datetime,timezone
from email.utils import format_datetime
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
from storefronts import store_link
ROOT=Path(__file__).resolve().parents[1];ORIGIN='https://www.drunkyetistudio.com';E=html.escape

def article_path(post):
    return f'/news/{post["slug"]}/'


def validate(post, products):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',post['slug']):raise ValueError('Invalid news slug')
    date.fromisoformat(post['date'])
    for field in ('title','summary'):assert isinstance(post[field],str) and post[field].strip()
    assert isinstance(post['body'],list) and all(isinstance(x,str) for x in post['body'])
    if post.get('image'):
        assert post['image'].startswith('/assets/') and '..' not in post['image']
        assert (ROOT/post['image'].lstrip('/')).is_file()
    if 'product' in post and (not isinstance(post['product'], str) or post['product'] not in products):
        raise ValueError(f'Unknown product page for {post["slug"]}: {post["product"]}')
    for link in post.get('links',[]):
        u=urlparse(link['url']);assert u.scheme=='https' and u.hostname and not u.username
    return post

def read_posts(products):
    posts = json.loads((ROOT/'news.json').read_text())
    for post in posts:
        validate(post, products)
    if len({post['slug'] for post in posts}) != len(posts):
        raise ValueError('Duplicate news slug')
    return sorted(posts, key=lambda post: (post['date'], post['slug']), reverse=True)


def latest_updates(posts, product_path):
    updates = [post for post in posts if post.get('product') == product_path]
    if not updates:
        return ''
    items = ''.join(
        f'<li><time datetime="{post["date"]}">{post["date"]}</time> '
        f'<a href="{article_path(post)}">{E(post["title"])}</a></li>'
        for post in updates[:3]
    )
    return (
        '<section class="callout product-updates"><h2>Latest updates</h2>'
        f'<ul>{items}</ul><a href="/news/">All studio news →</a></section>'
    )


def replace_section(write, file, marker, fragment):
    start, end = f'<!-- {marker}_START -->', f'<!-- {marker}_END -->'
    content = (ROOT/file).read_text()
    content, count = re.subn(
        f'{start}.*?{end}', lambda match: start + fragment + end, content, flags=re.S,
    )
    if count != 1:
        raise ValueError(f'Expected one {marker} region in {file}')
    write(file, content)


def build(page, write, posts, products, discord_invite):
    urls=['/news/'];items=[];rss=ET.Element('rss',version='2.0');channel=ET.SubElement(rss,'channel')
    for key,val in [('title','Drunk Yeti Studio News'),('link',ORIGIN+'/news/'),('description','Official releases and studio updates.')]:ET.SubElement(channel,key).text=val
    for p in posts:
        path=article_path(p);urls.append(path)
        body=f'<p class="eyebrow"><time datetime="{p["date"]}">{p["date"]}</time> · Drunk Yeti Studio</p>'
        if p.get('image'):
            alt = p.get('imageAlt', p['title'] + ' artwork')
            body += f'<img class="news-image" src="{E(p["image"],quote=True)}" alt="{E(alt,quote=True)}">'
        body+=''.join('<p>'+E(t)+'</p>' for t in p['body'])
        if product_path := p.get('product'):
            body += f'<p><a class="button ink" href="{E(product_path,quote=True)}">Explore {E(products[product_path])} →</a></p>'
        body += '<div class="studio-links">' + ''.join(
            store_link(link["url"], link["label"] + " ↗", "", show_microsoft_label=True)
            for link in p.get('links', [])
        ) + '</div>'
        body += (
            f'<p><a href="{E(discord_invite, quote=True)}">Join the studio on Discord ↗</a> · '
            '<a href="/news/">All studio news →</a></p>'
        )
        schema={'@context':'https://schema.org','@type':'BlogPosting','headline':p['title'],'description':p['summary'],'datePublished':p['date'],'url':ORIGIN+path,'author':{'@type':'Organization','name':'Drunk Yeti Studio'},'publisher':{'@type':'Organization','name':'Drunk Yeti Studio'}}
        if p.get('image'):schema['image']=ORIGIN+p['image']
        write(path.strip('/')+'/index.html',page(path,p['title'],p['summary'],body,schema,image=p.get('image')))
        items.append(f'<article class="callout"><time datetime="{p["date"]}">{p["date"]}</time><h2><a href="{path}">{E(p["title"])}</a></h2><p>{E(p["summary"])}</p><a href="{path}">Read the release update →</a></article>')
        item=ET.SubElement(channel,'item')
        for key,val in [('title',p['title']),('link',ORIGIN+path),('guid',ORIGIN+path),('description',p['summary']),('pubDate',format_datetime(datetime.fromisoformat(p['date']).replace(tzinfo=timezone.utc)))]:ET.SubElement(item,key).text=val
    community = (
        '<div class="studio-links"><a href="/news/feed.xml">Subscribe via RSS ↗</a>'
        '<a href="https://discord.gg/Euxqepsq8T">Join the Drunk Yeti Discord ↗</a>'
        '<a href="https://www.patreon.com/DrunkYeti">Support the studio on Patreon ↗</a>'
        '<a href="https://mastodon.social/@drunkyetistudio" rel="me">Follow on Mastodon ↗</a>'
        '<a href="https://bsky.app/profile/drunkyetistudio.bsky.social">Follow on Bluesky ↗</a></div>'
    )
    write('news/index.html',page('/news/','Studio news & releases','Official Drunk Yeti game releases, software updates, and news from across the studio.',community+''.join(items)))
    write('news/feed.xml',ET.tostring(rss,encoding='unicode',xml_declaration=True))
    teasers=''.join(f'<article><p class="eyebrow">{p["date"]}</p><h3><a href="/news/{p["slug"]}/">{E(p["title"])}</a></h3><p>{E(p["summary"])}</p><a href="/news/{p["slug"]}/">Read the update →</a></article>' for p in posts[:3])
    section='<section class="section" aria-labelledby="latest-news-title"><div class="section-heading"><div><div class="eyebrow">FROM THE STUDIO</div><h2 id="latest-news-title">Release news &amp; updates</h2></div><a href="/news/">All studio news →</a></div><div class="pillar-grid">'+teasers+'</div></section>'
    replace_section(write, 'index.html', 'STUDIO_NEWS', section)
    replace_section(
        write, 'desktop-buddy/index.html', 'PRODUCT_UPDATES',
        latest_updates(posts, '/desktop-buddy/'),
    )
    return urls
