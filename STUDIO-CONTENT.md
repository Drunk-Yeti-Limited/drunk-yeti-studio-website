# Studio website editorial content

The public site is organized around Play, Create, Worlds & Media, Studio, and Support. The complete collections and interactive homepage catalog remain available.

## Updating the pages

- Edit product copy and exact browser hosts in `studio-content.json`.
- Edit hub copy and homepage featured cards in `scripts/studio_pages.py`.
- Run `python scripts/build-search-pages.py`. This produces the collections, hubs, eight project pages, studio/about, help, press, and sitemap. It also refreshes the marked homepage feature block.
- `scripts/prepare-assets.py` calls this generator after its catalog update. The scheduled refresh commits the homepage, hubs, and nested project pages too.
- Do not label browser experiences as the complete downloadable game. AR3NA Open Arena is distinct from All-Stars; Avalanca and A Rocket's Intensity use their own browser builds.

## Evidence and imagery

Editorial product descriptions were checked against the official itch.io release pages on 2026-11-14. Current live server roots were also retrieved successfully over HTTPS:

- https://ar3na.drunkyetistudio.com/
- https://avalanca.drunkyetistudio.com/
- https://arocketsintensity.drunkyetistudio.com/

The server check establishes that each serves its game client, not that multiplayer, purchases, every device, or every mode passed an end-to-end test. The Rockets host was also present in the 1.0.1 Lite release's arena configuration.

Official release-gallery image origins and dimensions are recorded in `assets/studio/sources.json`. Covers are labeled as cover artwork. Galleries may show previous builds; the pages tell visitors to check release notes. Avoid invented prices, ratings, awards, platforms, release dates, download counts, or universal Frostpass claims.

## Checks

```sh
python scripts/build-search-pages.py
python -m unittest discover -s scripts/tests -p 'test_search_pages.py'
python -m unittest discover -s scripts/tests -p 'test_studio_routes.py'
node scripts/tests/catalog-badge.mjs
node scripts/tests/frostpass-filter.mjs
node scripts/tests/buddy-client.mjs
```

Check the homepage, Play, Create, a project page, and navigation on phone and desktop widths before publishing. Keep the Google verification meta tag, AdSense loader, account routes, Buddy pairing policy, and catalog filter IDs intact.
