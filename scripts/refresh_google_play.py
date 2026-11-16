#!/usr/bin/env python3
"""Refresh verified public Google Play listings; retain saved entries on failure."""
import argparse, json, re, runpy
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.request import Request, urlopen
ROOT = Path(__file__).resolve().parents[1]
DEVELOPER = 'https://play.google.com/store/apps/developer?id=Drunk+Yeti+Studio'
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.links=[]; self.meta={}; self.structured=[]; self.capture=False; self.parts=[]; self.feed(text)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='a': self.links.append(urljoin('https://play.google.com',a.get('href','')))
        if tag=='meta': self.meta[a.get('property',a.get('name',''))]=a.get('content','')
        if tag=='script' and a.get('type')=='application/ld+json': self.capture=True; self.parts=[]
    def handle_data(self, data):
        if self.capture:self.parts.append(data)
    def handle_endtag(self, tag):
        if tag=='script' and self.capture:
            self.capture=False
            try:self.structured.append(json.loads(''.join(self.parts)))
            except ValueError:pass

def package(url):
    u=urlparse(url)
    if u.scheme!='https' or u.hostname!='play.google.com' or u.path!='/store/apps/details':return None
    value=parse_qs(u.query).get('id',[''])[0]
    return value if re.fullmatch(r'com\.drunkyeti\.[a-zA-Z0-9_.]+',value) else None

def listing(text, app):
    p=Page(text)
    owner=any(urlparse(x).hostname=='play.google.com' and urlparse(x).path=='/store/apps/developer' and parse_qs(urlparse(x).query).get('id')==['Drunk Yeti Studio'] for x in p.links)
    if not owner or package(p.meta.get('og:url',''))!=app: raise ValueError('Listing ownership or package could not be verified')
    data=next((x for x in p.structured if isinstance(x,dict) and x.get('@type')=='SoftwareApplication'),None)
    if not data or not data.get('name') or data.get('operatingSystem')!='ANDROID':raise ValueError('Missing Android app metadata')
    return {'title':data['name']+' — Android','url':'https://play.google.com/store/apps/details?id='+app,'image':'./assets/covers/chainfall-pi.webp' if app=='com.drunkyeti.houseofwilds' else './assets/logo.png','description':data.get('description','')+' Available on Google Play for Android.','category':'Games' if str(data.get('applicationCategory','')).startswith('GAME') else 'Tools','browser':False,'storefront':'Google Play','platforms':['Android'],'packageId':app}

def read_json(path, default):return json.loads(path.read_text()) if path.exists() else default

def save(path, value):
    text=json.dumps(value,ensure_ascii=False,indent=2)+'\n'
    if not path.exists() or path.read_text()!=text:
        temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(text);temp.replace(path)

def refresh_google_play(pages_dir=None):
    def fetch(url, name):
        if pages_dir:return (Path(pages_dir)/(name+'.html')).read_text()
        with urlopen(Request(url,headers={'User-Agent':'DrunkYeti-Website-ReleaseCheck/1.0'}),timeout=30) as r:return r.read().decode('utf-8')
    profile=Page(fetch(DEVELOPER+'&hl=en&gl=US','developer'))
    apps=sorted({package(x) for x in profile.links if package(x)})
    if not apps:raise ValueError('No app links found; saved releases retained (page may be blocked or changed)')
    # Verify all detail pages before touching any saved data.
    found=[listing(fetch('https://play.google.com/store/apps/details?id='+app+'&hl=en&gl=US',app),app) for app in apps]
    path=ROOT/'google-play-releases.json';old=read_json(path,[]);by_url={x['url']:x for x in old}
    new=[x for x in found if x['url'] not in by_url]
    by_url.update({x['url']:x for x in found});releases=list(by_url.values())
    drafts=read_json(ROOT/'news-drafts.json',[]);published=read_json(ROOT/'news.json',[]);known={x['slug'] for x in drafts+published}
    for x in new:
        slug=x['packageId'].replace('.','-')+'-android-launch'
        if slug not in known:
            drafts.append({'slug':slug,'date':datetime.now(timezone.utc).date().isoformat(),'title':x['title']+' is on Google Play','summary':x['description'],'image':x['image'].removeprefix('.'),'body':['Now available on Android. Visit the official Google Play listing for device compatibility, availability and current release details.'],'links':[{'label':'Get it on Google Play','url':x['url']}]})
    catalog=read_json(ROOT/'assets/catalog.json',[])
    merged={x['url']:x for x in catalog};merged.update(by_url)
    save(path,releases);save(ROOT/'assets/catalog.json',list(merged.values()));save(ROOT/'news-drafts.json',drafts)
    metadata=read_json(ROOT/'assets/catalog-meta.json',{})
    metadata.update(count=len(merged),categories=dict(sorted(Counter(x['category'] for x in merged.values()).items())),googlePlaySource=DEVELOPER)
    save(ROOT/'assets/catalog-meta.json',metadata)
    print(json.dumps({'checked':len(found),'new':len(new),'saved':len(releases),'drafts':len(drafts)}))

if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--pages-dir',type=Path,help='Offline HTML fixtures: developer.html and <package>.html');args=cli.parse_args()
    refresh_google_play(args.pages_dir)
    runpy.run_path(str(ROOT/'scripts/build-search-pages.py'),run_name='__main__')
