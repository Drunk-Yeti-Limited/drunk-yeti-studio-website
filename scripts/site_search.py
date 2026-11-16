"""Index public studio pages, release posts, support topics and catalog releases."""
import json

from news_pages import article_path
from studio_pages import path as product_path
from support_page import SEARCH_TOPICS


def build(page, write, pages, products, posts, catalog):
    index = []

    def add(url, title, description, kind, label, terms=''):
        result = dict(url=url, title=title, description=description, kind=kind, label=label)
        if terms:
            result['terms'] = terms
        index.append(result)

    curated = {product_path(p): p for p in products}
    articles = {article_path(post): post for post in posts}
    product_types = {'games': 'Game', 'tools': 'Tool', 'comics': 'Comic'}
    add('/', 'Drunk Yeti Studio', 'Independent games, creative software, comics and music.', 'page', 'Studio')
    add('/desktop-buddy/', 'Drunk Yeti Desktop Buddy', 'Download our desktop pet and connect it to the studio website.',
        'product', 'Tool', 'virtual companion desktop Windows Mac macOS Linux mascot')
    for url, (title, description) in pages.items():
        if product := curated.get(url):
            terms = ' '.join((product['description'], product['edition']))
            add(url, title, description, 'product', product_types.get(product['section'], 'Project'), terms)
        elif post := articles.get(url):
            terms = ' '.join(post['body'])
            if related := curated.get(post.get('product')):
                terms += ' ' + related['name']
            add(url, title, description, 'news', 'News', terms)
        else:
            kind, label = ('support', 'Support') if url == '/help/' else ('page', 'Page')
            add(url, title, description, kind, label)

    for anchor, title, description in SEARCH_TOPICS:
        add(f'/help/#{anchor}', title, description, 'support', 'Support')
    for release in catalog:
        storefront = release.get('storefront') or release['category']
        terms = [release['category'], *(release.get('platforms') or [])]
        if release.get('browser'):
            terms.append('play in browser')
        if release.get('frostpass') is True:
            terms.append('Yeti Frostpass')
        add(release['url'], release['title'], release.get('description') or '', 'release',
            f'Release · {storefront}', ' '.join(terms))
    write('assets/site-search.json', json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n')

    description = 'Find games, tools, release news, and answers to common support questions.'
    body = '''
    <form class="site-search-form" action="/search/" method="get" role="search" data-studio-search>
        <label class="sr-only" for="site-query">Search the studio</label>
        <input type="search" id="site-query" name="q" placeholder="Try House of Wilds or password reset" maxlength="120" required>
        <button class="button ink" type="submit">Search</button>
    </form>
    <div data-search-results>
        <p role="status" data-search-status>Enter a title, topic, or platform.</p>
        <ol class="site-search-list" data-search-list></ol>
    </div>
    <noscript><p>Enable JavaScript to search, or browse <a href="/games/">Games</a>,
    <a href="/tools/">Tools</a>, <a href="/news/">News</a>, and <a href="/help/">Support</a>.</p></noscript>
    <script type="module" src="/studio-search.js?v=1"></script>
    '''
    write('search/index.html', page('/search/', 'Search the studio', description, body, indexable=False))
