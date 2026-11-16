import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import refresh_google_play as g

APP = 'games.drunkyeti.test'


def app_html(app=APP, owner='Drunk+Yeti+Studio', author=g.PUBLISHER, action='Install'):
    url = g.DETAILS + app
    data = {
        '@type': 'SoftwareApplication',
        'name': 'Example',
        'operatingSystem': 'ANDROID',
        'applicationCategory': 'GAME_ACTION',
        'description': 'A game.',
        'author': {'name': author},
    }
    return (
        f'<meta property="og:url" content="{url}">'
        f'<a href="/store/apps/developer?id={owner}">Studio</a>'
        f'<button aria-label="{action}"><meta itemprop="url" content="{url}"></button>'
        f'<script type="application/ld+json">{json.dumps(data)}</script>'
    )


class PlayTests(unittest.TestCase):
    def test_owner_and_package_validation(self):
        self.assertEqual(g.listing(g.Page(app_html()), APP)['category'], 'Games')
        for text in (app_html(owner='Other'), app_html(app='com.drunkyeti.other'), app_html(author='Other')):
            with self.subTest(text=text), self.assertRaises(ValueError):
                g.listing(g.Page(text), APP)
        self.assertIsNone(g.package('https://example.com/store/apps/details?id=' + APP))
        self.assertEqual(g.package(g.DETAILS + 'com.drunkyeti.houseofwilds'), 'com.drunkyeti.houseofwilds')
        self.assertIsNotNone(g.listing(g.Page(app_html(action='$2.99')), APP))

    def test_refresh_publishes_once_after_launch_and_preserves_on_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'assets').mkdir()
            fixtures = root / 'fixtures'
            fixtures.mkdir()
            developer = fixtures / 'developer.html'
            profile = f'<a href="/store/apps/details?id={APP}">Example</a>'
            developer.write_text(profile)
            app = fixtures / f'{APP}.html'
            news = root / 'news.json'
            catalog = root / 'assets/catalog.json'
            drafts = root / 'news-drafts.json'
            drafts.write_text(json.dumps([{'slug': 'editorial-draft'}]))
            original_drafts = drafts.read_bytes()

            with patch.object(g, 'ROOT', root):
                app.write_text(app_html(action='Pre-register'))
                g.refresh_google_play(fixtures)
                self.assertEqual(json.loads(news.read_text()), [])
                self.assertEqual(json.loads(catalog.read_text()), [])

                app.write_text(app_html())
                g.refresh_google_play(fixtures)
                posts = json.loads(news.read_text())
                self.assertEqual([post['slug'] for post in posts], ['games-drunkyeti-test-android-launch'])
                self.assertEqual(posts[0]['links'][0]['url'], g.DETAILS + APP)
                self.assertEqual(json.loads(catalog.read_text())[0]['packageId'], APP)
                before = {p: p.read_bytes() for p in (news, catalog)}
                g.refresh_google_play(fixtures)
                self.assertTrue(all(p.read_bytes() == content for p, content in before.items()))

                developer.write_text('Blocked')
                with self.assertRaises(ValueError):
                    g.refresh_google_play(fixtures)
                developer.write_text(profile)
                app.write_text(app_html(owner='Other'))
                with self.assertRaises(ValueError):
                    g.refresh_google_play(fixtures)
                self.assertTrue(all(p.read_bytes() == content for p, content in before.items()))
                self.assertEqual(drafts.read_bytes(), original_drafts)


if __name__ == '__main__':
    unittest.main()
