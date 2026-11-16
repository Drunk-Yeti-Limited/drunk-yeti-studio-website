import unittest,sys,json,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import refresh_google_play as g
class PlayTests(unittest.TestCase):
 def html(self,owner='Drunk+Yeti+Studio',package='com.drunkyeti.test'):
  return '<meta property="og:url" content="https://play.google.com/store/apps/details?id='+package+'"><a href="/store/apps/developer?id='+owner+'">Studio</a><script type="application/ld+json">'+json.dumps({'@type':'SoftwareApplication','name':'Example','operatingSystem':'ANDROID','applicationCategory':'GAME_ACTION','description':'A game.'})+'</script>'
 def test_owner_and_package_validation(self):
  self.assertEqual(g.listing(self.html(),'com.drunkyeti.test')['category'],'Games')
  for text in [self.html('Other'),self.html(package='com.drunkyeti.other')]:
   with self.assertRaises(ValueError):g.listing(text,'com.drunkyeti.test')
  self.assertIsNone(g.package('https://evil.example/store/apps/details?id=com.drunkyeti.test'))
 def test_refresh_preserves_and_deduplicates(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'assets').mkdir();(root/'fixtures').mkdir();f=root/'fixtures'
   (f/'developer.html').write_text('<a href="/store/apps/details?id=com.drunkyeti.test">Test</a>')
   (f/'com.drunkyeti.test.html').write_text(self.html())
   with patch.object(g,'ROOT',root):
    g.refresh_google_play(f);g.refresh_google_play(f)
    self.assertEqual(len(json.loads((root/'news-drafts.json').read_text())),1)
    before=(root/'assets/catalog.json').read_bytes()
    (f/'developer.html').write_text('Blocked')
    with self.assertRaises(ValueError):g.refresh_google_play(f)
    self.assertEqual((root/'assets/catalog.json').read_bytes(),before)
    (f/'developer.html').write_text('<a href="/store/apps/details?id=com.drunkyeti.test">Test</a>')
    (f/'com.drunkyeti.test.html').write_text(self.html('Other'))
    with self.assertRaises(ValueError):g.refresh_google_play(f)
    self.assertEqual((root/'assets/catalog.json').read_bytes(),before)
if __name__=='__main__':unittest.main()
