import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import announce_studio_news as news

URL = news.ORIGIN + '/news/new-release/'
WEBHOOK = 'https://discord.com/api/webhooks/123/test-token'
SCREENSHOT = news.ORIGIN + '/assets/logo.png'
PLAY = 'https://play.google.com/store/apps/details?id=games.drunkyeti.test'
HTML = (
    f'<link rel="canonical" href="{URL}"><meta property="og:image" content="{SCREENSHOT}">'
    f'<a href="{PLAY}">Get it on Google Play</a>'
).encode()


class DiscordDelivery(unittest.TestCase):
    def test_publish_once_with_live_article_data(self):
        old = next(iter(news.EARLIER_ARTICLES))
        items = ''.join(f'<item><title>Studio news</title><link>{url}</link><guid>{url}</guid>'
                        '<description>A launch.</description></item>' for url in (URL, URL, old))
        feed = f'<rss><channel>{items}</channel></rss>'.encode()
        writes, posts = [], []
        ledger = SimpleNamespace(items={})
        ledger.save = lambda: writes.append(ledger.items.copy())

        def discord(request, **unused):
            if request.get_method() == 'GET':
                return io.BytesIO(json.dumps({'guild_id': news.STUDIO_SERVER, 'channel_id': '1'}).encode())
            self.assertEqual(ledger.items[URL], 'pending')
            self.assertTrue(request.full_url.endswith('?wait=true'))
            posts.append(json.loads(request.data))
            return io.BytesIO(b'{"id":"987"}')

        with patch.dict(os.environ, {'DISCORD_RELEASE_WEBHOOK': WEBHOOK}), \
             patch.object(news, 'live', side_effect=lambda url: feed if url == news.FEED else HTML), \
             patch.object(news, 'Ledger', return_value=ledger), patch.object(news, 'urlopen', side_effect=discord):
            news.main(True)
            news.main(True)
        self.assertEqual(writes, [{URL: 'pending'}, {URL: '987'}])
        self.assertEqual(len(posts), 1)
        embed = posts[0]['embeds'][0]
        self.assertEqual(embed['image']['url'], SCREENSHOT)
        self.assertIn(PLAY, embed['description'])
        self.assertEqual(posts[0]['allowed_mentions'], {'parse': []})

    def test_ambiguous_delivery_keeps_claim(self):
        ledger = SimpleNamespace(items={}, save=lambda: None)
        with patch.object(news, 'urlopen', side_effect=TimeoutError), self.assertRaisesRegex(ValueError, 'unconfirmed'):
            news.deliver(WEBHOOK, ledger, URL, {})
        self.assertEqual(ledger.items[URL], 'pending')

    def test_definite_rejection_allows_retry(self):
        ledger = SimpleNamespace(items={}, save=lambda: None)
        error = HTTPError(WEBHOOK, 429, '', {}, None)
        with patch.object(news, 'urlopen', side_effect=error), self.assertRaisesRegex(ValueError, 'HTTP 429'):
            news.deliver(WEBHOOK, ledger, URL, {})
        self.assertEqual(ledger.items, {})


if __name__ == '__main__':
    unittest.main()
