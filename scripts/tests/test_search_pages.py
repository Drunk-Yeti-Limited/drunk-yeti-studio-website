import unittest,json,xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[2]
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__();self.h1=0;self.links=[];self.descriptions=[];self.canonicals=[];self.feed(text)
 def handle_starttag(self,t,a):
  a=dict(a)
  if t=='h1':self.h1+=1
  if t=='a':self.links.append(a.get('href',''))
  if t=='meta' and a.get('name')=='description':self.descriptions.append(a['content'])
  if t=='link' and a.get('rel')=='canonical':self.canonicals.append(a['href'])
class SearchPages(unittest.TestCase):
 def test_sitemap(self):
  urls=[e.text for e in ET.parse(ROOT/'sitemap.xml').findall('.//{*}loc')];self.assertEqual(len(urls),len(set(urls)))
  for url in urls:
   path=url.removeprefix('https://www.drunkyetistudio.com');p=ROOT/path.strip('/')/'index.html';self.assertTrue(p.exists(),path)
   self.assertNotIn(path,['/account/','/admin/','/unsubscribe/','/delete-account/'])
 def test_static_catalog(self):
  cards=json.loads((ROOT/'assets/catalog.json').read_text());mapping={'Games':'games','Tools':'tools','Assets':'assets','Mods':'mods','OS':'os','Soundtracks':'soundtracks','Comics':'comics'}
  for cat,slug in mapping.items():
   p=Page((ROOT/slug/'index.html').read_text());self.assertEqual(p.h1,1);self.assertEqual(len(p.descriptions),1);self.assertEqual(p.canonicals,['https://www.drunkyetistudio.com/'+slug+'/'])
   for c in cards:
    if c['category']==cat:self.assertIn(c['url'],p.links)
 def test_no_early_access(self):
  self.assertNotIn('early access',(ROOT/'account/index.html').read_text().lower())
if __name__=='__main__':unittest.main()
