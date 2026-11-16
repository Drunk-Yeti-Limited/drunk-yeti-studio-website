import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_itch_releases import refresh_itch_releases


class ItchReleases(unittest.TestCase):
    def test_versions_devlogs_and_retry(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            (root / 'assets').mkdir()
            (root / 'itch-releases.json').write_text(json.dumps({
                'snowlight': {'title': 'Snowlight', 'channels': ['windows-full']},
            }))
            version = '1.1'
            feed = None

            def read(url):
                if url.endswith('devlog.rss'):
                    if not feed:
                        raise HTTPError(url, 404, 'No feed', {}, None)
                    return feed
                if version is None:
                    raise HTTPError(url, 503, 'Unavailable', {}, None)
                return json.dumps({'latest': version}).encode()

            refresh_itch_releases(root, read)
            self.assertEqual(json.loads((root / 'news-drafts.json').read_text()), [])
            version = '1.2'
            feed = b"""<rss><channel><item><title>Fresh tracks</title>
            <link>https://drunkyeti.itch.io/snowlight/devlog/1/fresh-tracks</link>
            <pubDate>Mon, 16 Nov 2026 16:00:00 GMT</pubDate></item><item><title>Other site</title>
            <link>https://example.com/snowlight/devlog/2</link>
            <pubDate>Mon, 16 Nov 2026 16:00:00 GMT</pubDate></item></channel></rss>"""
            refresh_itch_releases(root, read)
            version = None
            refresh_itch_releases(root, read)
            drafts = json.loads((root / 'news-drafts.json').read_text())
            self.assertEqual([post['title'] for post in drafts], [
                'Snowlight 1.2 on itch.io', 'Snowlight — Fresh tracks',
            ])
            state = json.loads((root / 'assets/itch-releases.json').read_text())
            self.assertEqual(state['snowlight']['versions']['windows-full'], '1.2')
