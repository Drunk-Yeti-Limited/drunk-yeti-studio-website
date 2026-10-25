import importlib.util
import pathlib
import unittest
spec = importlib.util.spec_from_file_location('account_client', pathlib.Path(__file__).parents[1] / 'sdk/account_client.py')
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)

class ContractTest(unittest.TestCase):
    def test_provider_is_dynamic_and_surface_gated(self):
        m = {'auth': {'providers': [{'id': 'google', 'name': 'Google', 'ready_surfaces': []}]}}
        settings = {'external': {'google': True}}
        self.assertEqual(client.login_methods(m, settings), [])
        m['auth']['providers'][0]['ready_surfaces'] = ['desktop']
        self.assertEqual(client.login_methods(m, settings), [{'id': 'google', 'name': 'Google'}])
        self.assertEqual(client.login_methods(m, settings, 'ios'), [])
        self.assertEqual(client.login_methods(m, {'external': {'google': False}}), [])

    def test_versions_and_new_sections(self):
        self.assertRaises(ValueError, client.normalize_manifest, {'schema_version': 2})
        m = {'schema_version': 1, 'sections': [{'type': 'notice', 'title': 'New'}, {'type': 'unknown', 'title': 'Future'}]}
        self.assertEqual(len(client.normalize_manifest(m)['sections']), 1)

    def test_no_anonymous_snapshot(self):
        self.assertRaises(ValueError, client.AccountClient().snapshot)

if __name__ == '__main__':
    unittest.main()
