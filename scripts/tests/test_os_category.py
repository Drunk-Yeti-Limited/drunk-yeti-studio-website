import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('refresh_os', Path(__file__).parents[1] / 'prepare-assets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class OperatingSystemTests(unittest.TestCase):
    def test_registered_os_survives_missing_tags_and_renaming(self):
        for title in ('Drunk Yeti PlaySpace Linux Distro', 'PlaySpace Next', 'App Maker'):
            card = {'url': 'https://drunkyeti.itch.io/drunk-yeti-playspace-linux-distro',
                    'title': title, 'description': '', 'productType': ''}
            self.assertEqual(module.normalize(card)['category'], 'OS')

    def test_linux_compatible_tool_is_not_an_os(self):
        self.assertEqual(module.classify({'title': 'Linux Art Maker', 'description': 'Runs on Linux'}), 'Tools')
