import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('catalog_refresh', Path(__file__).parents[1] / 'prepare-assets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FrostpassTests(unittest.TestCase):
    def parse(self, html):
        p = module.DescriptionParser(); p.feed(html); p.close(); return p

    def test_case_markup_entities_and_line_breaks(self):
        for content in ['Yeti Frostpass', 'yEtI fRoStPaSs', 'Yeti&nbsp;<b>Frostpass</b>', 'Yeti<br>Frostpass', '<div>Yeti <span>Frost</span>pass</div>']:
            with self.subTest(content=content):
                p = self.parse('<div class="formatted_description user_formatted">'+content+'</div>')
                self.assertTrue(p.frostpass)

    def test_only_authored_description(self):
        p = self.parse('<nav>Yeti Frostpass</nav><div class="formatted_description"><p>Game</p><!-- Yeti Frostpass --><script>"Yeti Frostpass"</script><style>Yeti Frostpass</style></div><div class="comments">Yeti Frostpass</div>')
        self.assertTrue(p.found); self.assertFalse(p.frostpass)
        self.assertFalse(self.parse('<div class="formatted_description">Yeti Frostpassage</div>').frostpass)

    def test_update_remove_preserve_and_new_failure(self):
        card = {'title':'Example','url':'https://drunkyeti.itch.io/example','description':'Short summary'}
        with patch.object(module, 'fetch', return_value=b'<div class="formatted_description">YETI FROSTPASS</div>'):
            self.assertIsNone(module.refresh_frostpass(card)); self.assertTrue(card['frostpass'])
        self.assertEqual(card['description'], 'Short summary')
        with patch.object(module, 'fetch', return_value=b'<div class="formatted_description">No membership text</div>'):
            module.refresh_frostpass(card, {'frostpass':True}); self.assertFalse(card['frostpass'])
        for response in [b'<h1>Unavailable</h1>', None]:
            with patch.object(module, 'fetch', **({'return_value':response} if response else {'side_effect':TimeoutError('timeout')})):
                self.assertIsNotNone(module.refresh_frostpass(card, {'frostpass':True})); self.assertTrue(card['frostpass'])
                self.assertEqual(card['frostpassCheck'], 'unavailable')
                module.refresh_frostpass(card); self.assertFalse(card['frostpass'])

    def test_external_extra_not_fetched(self):
        with patch.object(module, 'fetch') as fetch:
            module.refresh_frostpass({'url':'https://store.steampowered.com/app/1/'})
            fetch.assert_not_called()
