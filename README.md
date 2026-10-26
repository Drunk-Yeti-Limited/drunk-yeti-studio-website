# Drunk Yeti portfolio — v1.1

A self-contained, buildless Three.js portfolio for desktop and mobile layouts.

## Publish on GitHub Pages

The delivery ZIP contains the website at its root. Extract it first; do not upload the ZIP itself.

1. Create a **public** repository on GitHub Free. For an account homepage, name it `YOUR-USERNAME.github.io`. Any other repository name creates a project site at `https://YOUR-USERNAME.github.io/REPOSITORY/`.
2. Upload the extracted **contents**, including `index.html`, `style.css`, `catalog.js`, `scene.js`, `assets/`, and `.nojekyll`, to the repository root. Keep the `assets` folder and its subfolders intact. GitHub Desktop is convenient for uploading the complete tree, including `.nojekyll`.
3. Open **Settings → Pages**. Select **Deploy from a branch**, branch **main**, folder **/(root)**, and save.
4. Open the URL GitHub supplies after deployment finishes.

No npm install, build command, workflow YAML, API key, backend, or paid hosting plan is needed. GitHub runs its own deployment workflow internally even with branch publishing. The free address is included; a purchased custom domain is optional. This is a studio portfolio linking to external storefronts. GitHub's Pages usage policies and quotas still apply.

## Preview locally

Opening `index.html` directly with a `file://` URL will block module/model fetches in many browsers. Serve the website folder with any static HTTP server, for example:

    python3 -m http.server 8080

Then visit `http://localhost:8080`. This GitHub Pages repository serves the website from its root.

## What's included

- Original Drunk Yeti mascot extracted from Collision Karts v0.33, with its 78 skinned meshes and 19 animation clips preserved in GLB.
- Toon materials, idle/blink behavior, a custom bone-driven greeting, turntable spin, and pointer response.
- Glossy inflated logo, derived from the studio's original itch.io logo silhouette, with rounded front/back geometry, moving lighting, and touch rotation.
- 78 public itch.io entries plus the verified Hover Rancher soundtrack on Steam, with local artwork, categories, search, browser-demo filtering, and progressive display.
- Six actual videos discovered on the supplied YouTube channel, with click-to-open privacy-enhanced YouTube embeds.
- Dedicated mod, soundtrack and merch panels; Redbubble shop and Facebook community links alongside Steam, itch.io, YouTube, X, and the Google Sites archive.
- Responsive CSS, reduced-motion behavior, static image fallbacks, keyboard controls, mobile frame-rate limits, and offscreen animation suspension.
- All Three.js dependencies self-hosted, pinned to r170. YouTube is contacted for playback only after a video is selected. Store and social links are external destinations.

## Edit the collection

Update `assets/catalog.json`. Fields are `title`, `url`, `image`, `description`, `category` (`Games`, `Tools`, `Assets`, `Mods`, `Soundtracks`, `Comics`), and `browser` (boolean). `frostpass` (boolean) adds the Yeti Frostpass card label across every category; it is detected from the full itch.io product description, not its short profile summary. An optional `storefront` labels external store destinations. Prices and operating-system promises are left to the storefront pages, where current download availability is authoritative.

Update `assets/videos.json` with each video's `id` and `title`. Put a matching thumbnail at `assets/VIDEO-ID.jpg`.

The games and merch galleries are snapshots. Refresh both when releases change:

    python3 -m pip install Pillow
    python3 scripts/prepare-assets.py

The same command also refreshes the public Redbubble shop into `assets/merch.json`, `assets/merch-meta.json`, and compressed product images under `assets/merch/`. It reads public shop-page data, follows exposed next-page links, verifies artist ownership, and preserves the last saved catalog if the shop response is blocked, empty or incomplete. If the image CDN rejects downloading, existing local thumbnails are retained; new products use the exact public image URL from the shop. Such fallbacks are reported in merch metadata. Browsers contact Redbubble's CDN for those images, which can still fail independently; the studio logo is the last-resort display fallback. A failed source refresh exits with an error while still allowing the other source to update. No login or private API is used. Run `python3 scripts/refresh_merch.py` to refresh merch alone.

The merch gallery shows eight products initially, with a More merch button. Prices and options are left to Redbubble so cached prices are never presented as current. New products appear on the website after rerunning the script and committing the generated files. This is an on-demand refresh, not an automatically scheduled job.

The script reads the public itch.io profile, classifies the listings, downloads new or changed artwork, verifies cached images, and writes `assets/catalog.json` and `assets/catalog-meta.json`. It preserves the existing catalog if the profile response appears incomplete. Listings without cover artwork use the studio logo. It requires Python 3.9+, Pillow and network access. No API key or Actions workflow is required.

`catalog-extras.json` holds explicitly verified external store listings, currently the Hover Rancher Soundtrack on Steam. Do not populate it with guessed or unpublished page URLs. As of the October 23 refresh, no soundtracks appeared on the public itch.io profile; newly listed soundtracks will be classified automatically on the next refresh. The mod and music buttons clear other filters before opening their category.

After reviewing the result, commit `scripts/`, `catalog-extras.json`, the generated catalog metadata and changed images along with any page updates. Browser preview files are ignored by Git.

## Models

The separate **Drunk-Yeti-3D-Models.zip** includes:

- `drunk-yeti.glb`: original rig, materials, textures, expressions and animation clips.
- `drunk-yeti-mascot.obj` / `.mtl` plus textures: static bind-pose interchange export.
- `drunk-yeti-inflated-logo.glb`: compact web-ready rounded logo.
- `drunk-yeti-inflated-logo.obj` / `.mtl` / `logo.png`: rounded logo interchange export.

OBJ stores static geometry; motion is implemented in the website and the mascot's animation data is retained in GLB. Materials and textures must remain beside the corresponding OBJ/GLB when importing. The logo is an alpha-silhouette relief with rounded edges, not a manually sculpted full character model.

## Verification

The original release checked model loading, rig clips and logo topology. The v1.1 refresh checks JavaScript syntax, catalog categories, local asset references and image decoding. Browser preview was blocked by the browser URL security policy in this environment, so visual rendering and real-device behavior remain unverified for this update.

## Credits and licenses

Drunk Yeti branding, mascot, catalog imagery and projects belong to their respective rights holders. The mascot comes from the user's supplied Collision Karts project; the studio logo and project covers were sourced from the supplied itch.io profile. Video identifiers and titles come from the supplied YouTube channel. Three.js and its loaders are MIT licensed; see `assets/THREE-LICENSE.txt`. The dependency license does not relicense the studio's creative assets.

## Account avatars

The homepage has a persistent Your account button, including on phones. Profile
settings offer the existing Drunk Yeti logo by default, plus Raccoon, Fox, Beaver,
Seagull, Otter, and Owl portraits from the studio animation archives. There are no
player uploads: six shared images total 813,467 bytes, and each profile stores only
an allowlisted avatar ID. See `account/avatars/README.md` for source provenance.

The avatar migration was applied before the client rollout. Transactional database
checks verified all seven choices, default values, old-client preservation, invalid
value rejection, account isolation, authentication and app-scope enforcement.
`npm test` in `account/` covers save/reload, fallback and account-switch clearing.
Local Chromium could not launch in this environment, so responsive styling was
reviewed in code but visual browser verification remains outstanding.

## Shared account platform

`account/PLATFORM.md` documents the deployed v1 backend contract and rollout gates.
The Yeti world account tab displays Yeti Shards, separate game wallets, earned
achievements, unlocks, offers and planned Xbox/PlayStation connections. Public
configuration and per-account revision checks let compatible clients discover
updates; Google/Apple/Facebook buttons require backend and per-surface readiness.
JavaScript and Python integration clients live in `account/sdk/`. Native app
binaries, payment processing and console linking are not included in this release.


### Yeti Frostpass description labels

The refresh checks every linked public itch.io product page, including games,
tools, mods and assets. Put **Yeti Frostpass** anywhere in the page description;
matching is case-insensitive, tolerates whitespace/line breaks and inline markup,
and ignores navigation, comments and scripts. A successful later check removes
the badge if the phrase is removed. Failed requests or missing descriptions retain
the previous verified flag and report a warning (`frostpassCheck: unavailable`).
New, unverified pages receive no badge. External storefront extras are not scraped.
The original short card description stays unchanged. Searching “Yeti Frostpass”
also finds labeled cards. The label is catalog metadata, never proof of paid access;
subscription authorization remains a separate server-side check.

For offline fixtures, `--pages-dir DIR` reads each product's `<slug>.html`.
Run `python3 -m unittest discover -s scripts/tests` for description checks and
`node scripts/tests/catalog-badge.mjs` for card rendering. New labels appear after
refreshing and publishing the generated catalog alongside the website files.
