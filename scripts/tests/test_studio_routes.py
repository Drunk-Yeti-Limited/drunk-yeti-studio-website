"""Protect crawlable studio routes and game-server destinations across refreshes."""
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]

class Links(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.refs=[]; self.ids=[]; self.h1=0; self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if 'id' in attrs: self.ids.append(attrs['id'])
        if tag == 'h1': self.h1+=1
        if tag in ('a','link','script','img'):
            ref=attrs.get('href') or attrs.get('src')
            if ref:self.refs.append(ref)

class StudioRoutes(unittest.TestCase):
    def test_public_routes_have_no_broken_local_targets(self):
        for node in ET.parse(ROOT/'sitemap.xml').findall('.//{*}loc'):
            path=urlsplit(node.text).path
            source=ROOT/path.strip('/')/'index.html'
            page=Links(source.read_text())
            self.assertEqual(page.h1,1,path)
            self.assertEqual(len(page.ids),len(set(page.ids)),path)
            for ref in page.refs:
                parts=urlsplit(ref)
                if parts.scheme or parts.netloc or not parts.path:continue
                target=ROOT/parts.path.lstrip('/') if parts.path.startswith('/') else source.parent/unquote(parts.path)
                if target.is_dir():target=target/'index.html'
                self.assertTrue(target.is_file(),f'{path} → {ref}')

    def test_three_explicit_game_hosts(self):
        products=json.loads((ROOT/'studio-content.json').read_text())['products']
        hosts={urlsplit(p['browser']).hostname for p in products if p.get('browser')}
        self.assertEqual(hosts,{'ar3na.drunkyetistudio.com','avalanca.drunkyetistudio.com','arocketsintensity.drunkyetistudio.com'})
        for file in ['index.html','play/index.html']:
            links=Links((ROOT/file).read_text()).refs
            for p in products:
                if p.get('browser'):self.assertIn(p['browser'],links)

if __name__=='__main__':unittest.main()
