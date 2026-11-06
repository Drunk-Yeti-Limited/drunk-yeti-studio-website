"""Refresh public Redbubble shop cards without login or private endpoints."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHOP = 'https://www.redbubble.com/people/drunkyeti/shop'


class ShopPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.payload = ''
        self.next_url = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'script' and a.get('id') == '__NEXT_DATA__':
            self.capture = True
        if tag in ('a', 'link') and ('next' in a.get('rel', '').split()
                or a.get('aria-label', '').lower() in ('next', 'next page')):
            self.next_url = urljoin(SHOP, a.get('href', ''))

    def handle_endtag(self, tag):
        if tag == 'script':
            self.capture = False

    def handle_data(self, data):
        if self.capture:
            self.payload += data


def atomic_json(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    if path.exists() and path.read_bytes() == data:
        return False
    temporary = path.with_suffix('.json.partial')
    temporary.write_bytes(data)
    temporary.replace(path)
    return True


def parse_shop(html):
    page = ShopPage()
    page.feed(html)
    props = json.loads(page.payload)['props']['pageProps']
    cards = []
    for result in props['results']:
        item = result['inventoryItem']
        work = item['work']
        if work.get('artistUsername', '').lower() != 'drunkyeti':
            continue
        url = item['productPageUrl']
        if urlparse(url).hostname != 'www.redbubble.com' or not urlparse(url).path.startswith('/i/'):
            raise ValueError('Unexpected product URL')
        previews = item['previewSet']['previews']
        source = next((p['url'] for p in previews if p['previewTypeId'] == 'product_close'), previews[0]['url'])
        if not (urlparse(source).hostname or '').endswith('.redbubble.net'):
            raise ValueError('Unexpected image host')
        key = str(work['id']) + '-' + item['productTypeId']
        cards.append(dict(id=key, title=work['title'].strip(), product=item['description'],
                          url=url, image='./assets/merch/' + key + '.webp', imageSource=source))
    return cards, page.next_url


def refresh_merch():
    output = ROOT / 'assets/merch.json'
    previous = json.loads(output.read_text()) if output.exists() else []
    old = {p['id']: p for p in previous}
    cards, visited = [], set()
    next_url = SHOP
    while next_url:
        if next_url in visited or len(visited) >= 20:
            raise RuntimeError('Incomplete pagination; existing merch catalog retained')
        if urlparse(next_url).hostname != 'www.redbubble.com':
            raise ValueError('Unexpected pagination host')
        visited.add(next_url)
        with urlopen(next_url, timeout=30) as response:
            found, next_url = parse_shop(response.read().decode('utf-8'))
        cards.extend(found)
    cards = list({p['id']: p for p in cards}.values())
    if not cards or len(cards) < len(previous) * .75:
        raise RuntimeError('Empty or incomplete shop response; existing merch catalog retained')
    (ROOT / 'assets/merch').mkdir(parents=True, exist_ok=True)

    def cover(card):
        local_image = './assets/merch/' + card['id'] + '.webp'
        path = ROOT / local_image.removeprefix('./')
        if old.get(card['id'], {}).get('imageSource') == card['imageSource'] and path.exists():
            with Image.open(path) as image:
                image.verify()
            return
        try:
            with urlopen(card['imageSource'], timeout=30) as response:
                raw = response.read()
        except Exception as error:
            # Public CDN images can reject the updater while working in visitors'
            # browsers. Keep an existing local preview or use the exact image
            # advertised by the public shop; never substitute invented artwork.
            card['image'] = local_image if path.exists() else card['imageSource']
            return f"{card['title']}: using {'cached' if path.exists() else 'public CDN'} image ({error})"
        with Image.open(BytesIO(raw)) as image:
            image = image.convert('RGB')
            image.thumbnail((480, 480))
            buffer = BytesIO()
            image.save(buffer, 'WEBP', quality=84)
        path.write_bytes(buffer.getvalue())

    # A shop/schema failure never replaces the catalog. CDN failures retain
    # cached thumbnails or the public image URLs from that same shop response.
    with ThreadPoolExecutor(max_workers=4) as pool:
        warnings = [warning for warning in pool.map(cover, cards) if warning]
    changed = atomic_json(output, cards)
    if changed or not (ROOT / 'assets/merch-meta.json').exists():
        atomic_json(ROOT / 'assets/merch-meta.json', dict(source=SHOP, count=len(cards),
                    updated=datetime.now(timezone.utc).isoformat(), pages=len(visited), warnings=warnings))
    print(json.dumps(dict(merch=len(cards), changed=changed, pages=len(visited), warnings=warnings)))


if __name__ == '__main__':
    refresh_merch()
