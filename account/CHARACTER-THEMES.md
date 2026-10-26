# Character ownership contract

Dark Yeti and Blush Yeti each cost 100 Shards. The account store accepts either
100 purchased web Shards or 100 earned Shards, explicitly chosen by the player.
Balances are not mixed. The seven starter avatars remain free.

One durable license per character lives in `dy_entitlements`:

| Character ID | Namespace (`game_id`) | Ownership key (`item_id`) |
| --- | --- | --- |
| dark-yeti | yeti-account | avatar:dark-yeti |
| blush-yeti | yeti-account | avatar:blush-yeti |

The legacy `avatar:` prefix is deliberately stable: this entitlement owns the
whole character theme, not just the portrait. Do not mint a second paid license
for a Buddy skin or browser theme. Apps should not inspect payment/order history
or infer ownership from the selected profile avatar.

`dy_account_manifest(1).character_themes` provides versioned catalog entries,
preview image, palette, entitlement reference, and per-surface integration status.
`dy_account_snapshot(1).unlocks` provides authenticated ownership, including valid
achievement grants. JS `characterThemes` and Python `character_themes` join these
into `owned`, `integration`, and `available` values. Unknown surfaces stay unavailable.

The account avatar integration is ready. Desktop Buddy skins, Yeti Browser themes,
and game themes are planned: no animation/model packages or game binaries are
included in this release. Ownership is retained for when those integrations ship.
Each app must initially implement this contract and its relevant asset renderer.
Backend data cannot introduce arbitrary new executable app behavior.

When an integration ships, publish a versioned, trusted asset package appropriate
for its renderer; add its stable `asset_id`, supported format and minimum client
version to the integration metadata; mark only supported integrations ready and
increment the character version. Catalog changes bump manifest revision through
`account_config`; purchases bump account data revision through entitlement/ledger
triggers. Existing clients poll revisions and refresh on foreground. Download only
allowlisted, integrity-verified assets; never execute code supplied by a manifest.
Clear cached ownership on logout or user switch. Protected game services must
validate ownership server-side rather than trusting client booleans.

Redemption uses existing `dy_redeem_offer`: player advisory lock, server-owned
price/version, idempotent request ID, atomic wallet debit + entitlement + receipt,
insufficient-balance rejection, duplicate-ownership rejection across both wallet
choices, and payment-hold enforcement. Avatar selection independently checks the
entitlement. Purchasing does not automatically equip or change other apps' choices.

Validation: `tests/character-themes.sql` uses disposable fixture users inside an
explicit transaction and must always be rolled back; never spend a real user's
Shards for verification. The JS and Python helpers are compatible with schema v1;
older clients may ignore the additive catalog field safely.

Artwork: original approved logo-based image-generation previews; Blush Yeti's fur
was edited to pale pink #FADDE8. Website WebP copies are 512×512 with alpha, shared
static assets (no per-user uploads). Dark palette: charcoal #27282D / gold #F2CC67;
Blush palette: pale pink #FADDE8 / coral #F39A96. These are intended palette values.
