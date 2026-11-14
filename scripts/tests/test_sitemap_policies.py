"""Catalog refresh discovers new policies without indexing excluded pages."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts'))
spec = importlib.util.spec_from_file_location('search_pages', ROOT/'scripts/build-search-pages.py')
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)

class PolicyDiscovery(unittest.TestCase):
    def test_new_policy_discovered_but_private_or_canonicalized_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for slug, canonical, robots in [
                ('new-game', '/privacy/new-game/', ''),
                ('internal', '/privacy/internal/', '<meta name="robots" content="noindex,follow">'),
                ('duplicate', '/privacy/new-game/', ''),
            ]:
                target = root/'privacy'/slug/'index.html'
                target.parent.mkdir(parents=True)
                target.write_text(f'<link rel="canonical" href="{pages.ORIGIN}{canonical}">{robots}')
            self.assertEqual(pages.privacy_urls(root), ['/privacy/new-game/'])

if __name__ == '__main__':
    unittest.main()
