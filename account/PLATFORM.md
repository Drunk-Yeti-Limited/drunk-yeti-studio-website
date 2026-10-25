# Drunk Yeti account platform v1

Yeti Shards are the shared **earned** currency. A player's account connects their
avatar, achievements, cross-game unlocks and balances. Game coins are separate,
play-only balances with no cash-out, transfer or real-world prizes.

## Shipped and pending

The backend and website now provide a versioned manifest, efficient revision
checks, private account snapshots, dynamic avatar catalog, a transaction ledger,
verified-achievement Shard awards, and atomic offer redemption / coin exchange.
The website's Yeti world tab renders these sections from the manifest. JavaScript
and Python clients are in `sdk/`; the Python client is intended for Buddy/PlaySpace
integration and does not replace either application's authentication manager.

All seven starter avatars remain free. No real reward amounts, paid offers or
exchange rates have been chosen. Cash purchases, offer redemption and casino
exchange are disabled in production. There is no payment processor, StoreKit /
Play Billing receipt verifier, casino gameplay authority, or console-linking
adapter in this release. No native app or distro binary has been updated.

## Stable HTTPS contract

Base: `https://rgafawpucqdhjrzodayl.supabase.co`. Use the publishable key in the SDK
as `apikey`; private calls also need `Authorization: Bearer <player access token>`.
Never ship a service-role key in a website, game, desktop app or distro.

| RPC / endpoint | Signed in? | Purpose |
| --- | --- | --- |
| `POST /rest/v1/rpc/dy_account_manifest` with `{"p_schema":1}` | No | Supported UI sections, avatars, feature readiness, login and connection catalog |
| `GET /auth/v1/settings` | No | Supabase's currently enabled provider flags |
| `POST /rest/v1/rpc/dy_account_revision` with `{}` | Yes | Manifest and current player's data revision |
| `POST /rest/v1/rpc/dy_account_snapshot` with `{"p_schema":1}` | Yes | Profile, wallets, achievements, unlocks, offers, verified connections and latest 50 ledger entries |
| `POST /rest/v1/rpc/dy_redeem_offer` | Yes | Atomic, idempotent token redemption using offer ID, expected version and request UUID |
| `POST /rest/v1/rpc/dy_currency_event` | Trusted server only | Validated event / receipt credit or debit with immutable event identity |

JSON quantities and revisions are decimal **strings**, not floating-point amounts.
Display them as integers. The snapshot supplies `schema_version`,
`manifest_revision`, `data_revision`, `generated_at`, `player_id`, and named arrays.
Existing game wallets are exposed as `game_wallets`; new provenance-aware balances
are `wallets`. Do not merge them or treat all currencies as interchangeable.

Register each native application's OAuth client with an exact callback and reviewed
`dy_apps` scopes. `account_read` deliberately authorizes a player's cross-game
account summary; `economy` authorizes that player's offer redemptions. Neither is
implicitly added to existing apps. `profile`, `achievements`, `saves`, and other
existing scopes keep their existing meanings. A client-supplied app/platform name
is presentation context, never proof of authorization or purchase origin.

## Refresh and compatibility

1. Fetch the public manifest when opening the account or sign-in screen. Fetch
   Auth settings too; provider buttons require both readiness and actual enablement.
2. Fetch an authenticated snapshot on sign-in. Keep private data only for that
   session/account. Clear it immediately on sign-out or account switch.
3. While the account screen is visible, check revisions every 60 seconds and when
   returning to the foreground. Fetch the snapshot when either revision changes.
   The website implements this without resetting unsaved profile fields.
4. Refresh after purchases, rewards and profile changes. Use verified server values
   as authority. Offline display may be explicitly marked stale; offline spending
   is never permitted. Do not convert local save claims directly into currency.
5. Render known section types (`wallets`, `achievements`, `unlocks`, `store`,
   `connections`, `notice`). Ignore unknown fields and section types safely. Do not
   evaluate downloaded code, HTML, arbitrary URLs or action names.
6. An incompatible major schema requires a client update. Keep v1 available when
   introducing v2. Never silently reinterpret v1 fields. Open the hosted account
   portal as a fallback if the native client cannot render a new experience.

Apps need **one initial integration** of this contract. Thereafter new records,
labels, supported sections, avatar entries and supported login providers can show
up without rebuilding apps. New gameplay assets, native interactions, permissions
or provider-specific SDKs can still require updates. Remote JSON cannot guarantee
that an old executable supports arbitrary future features.

Manifest revision increments for configuration/catalog changes. Per-player
revisions increment for profiles, saves, balances, achievements, entitlements,
reward grants and verified platform links. If editing presentation metadata in
`dy_apps`, also update the manifest document so cached titles refresh. Polling is
foreground-only; add a server push invalidation layer later if volume requires it.
Achievement lists are currently returned in full; the activity preview is capped
at 50. Introduce additive cursor endpoints before accounts accumulate very large
histories. This release is not a load-tested claim of unlimited capacity.

## Enable Google / Apple / Facebook later

The shared discovery rule is:

```
provider listed in manifest
AND current surface in provider.ready_surfaces
AND /auth/v1/settings.external[provider.id] == true
```

All `ready_surfaces` arrays start empty. The website uses `web`; native integrations
should use stable surface names such as `desktop`, `ios`, or `android`. Do not set
readiness until each callback flow has passed its tests.

1. Create the provider developer application. Store its credentials only in
   Supabase Auth, configure the exact provider-to-Supabase callback, then enable it.
2. Configure and test the exact app/website return URI separately. Native apps use
   the system browser and PKCE, secure session storage and verified callback
   routing. Never pass bearer tokens through query strings. Provider discovery is
   not itself an OAuth implementation.
3. As an administrator, add the tested surface to that provider's
   `dy_private.account_config.document.auth.providers[].ready_surfaces`. This
   increments the revision. No website flag or app rebuild is needed for the
   three supported providers. The same process removes buttons on disablement.
4. Check sign-in, cancellation, account linking and recovery on each platform.
   Do not merge identities merely because emails or display names match.

## Xbox / PlayStation readiness

Public connection IDs are `xbox` and `psn`; the UI label is PlayStation. Both are
`planned`. The existing `dy_platform_links` table already enforces unique verified
platform identity ownership and one link per platform per player. Snapshots expose
only platform and verification time, never the stored subject hash or provider
secrets. There is no user-write endpoint for claiming a gamertag or PSN account.

Future platform-approved server adapters must verify ownership, establish a link
with the signed-in Yeti user, handle conflicts and revocations, and map verified
platform achievement IDs to internal definitions. Console login/linking is not
interchangeable with generic Microsoft OAuth. Partner access, SDK requirements and
platform approval must be resolved before marking a connection ready. Old clients
can continue to show verified connection status even if they lack the new linking UI.

## Economy operation

- `dy_private.currencies` distinguishes earned from purchased currencies. Purchased
  balances require an originating title and store. Shared earned Shards use ID
  `yeti-shards`. Create separate purchased currency IDs per title/store; never mix
  paid and earned provenance into one aggregate balance.
- `dy_currency_event` is callable only by the trusted service role. Its caller must
  verify receipts or authoritative gameplay events, validate products and recipient
  ownership, and use a stable event ID. Reusing an event for a different player or
  amount is rejected. Balance updates and ledger insertion are one transaction.
- Configure `dy_private.shard_rewards` per verified achievement. The existing
  `dy_award_verified` path awards Shards once on first achievement insertion.
  Enabling a rule later does not automatically backfill historical achievements.
  Backfills need explicit idempotent events. Revoking an achievement removes its
  rule-based unlocks; currency clawbacks need an explicit audited adjustment and
  a defined insufficient-balance policy. Never silently edit ledger history.
- Existing `dy_reward_rules` / `dy_reward_grants` support cross-game unlocks.
  Purchased unlocks use existing `dy_entitlements`. Paid avatars use target game
  `yeti-account` and item `avatar:<catalog-id>`; selection checks actual ownership.
- Offers define authoritative integer cost, target, effect and version. Increase
  the version whenever price or effect changes. The server rejects stale versions.
  An unlocked item cannot be bought again. Retry a timed-out request with the same
  UUID; the website retains it in account-scoped session storage across reloads.
- Casino exchange debits earned Shards and credits the existing game wallet in one
  transaction. Purchased currencies cannot fund that exchange. No casino app ID or
  exchange ratio has been guessed or activated. The game's play/spin outcomes must
  eventually be settled by a trusted server, not a client-side balance upload.
- The service role remains powerful: do not distribute it among game clients.
  Per-game servers should go through a narrow verified-event gateway with their
  own scoped credentials. That gateway and receipt validation are launch work.

Store rules must be checked for the actual product and distribution market before
launch. Google Play's payments policy says purchased virtual currencies must stay
within the app/game title where purchased. Apple has specific multiplatform and
in-app-purchase rules. Web purchase capability is not permission to put external
payment links into every native app.

Sources checked October 25, 2026:
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://developer.apple.com/app-store/review/guidelines/#in-app-purchase
- https://supabase.com/docs/guides/database/functions

## Security and verification

Private economy/config tables have RLS and no direct anon/authenticated grants.
Public privileged RPCs have explicit execute grants, empty search paths and
ownership/scope checks (except the intentionally public, non-personal manifest).
Existing account deletion requests block access. Export includes new balances,
ledger and orders. No auth/provider secrets are part of the manifest.

`npm test` covers provider rollout/removal, surface gating, version compatibility,
unknown fields/types, safe rendering, wallet display, avatars, account-switch
clearing, and auth regressions. Python contract tests cover native discovery.
`tests/platform.sql` runs transactionally against the backend and rolls back every
fixture; it tests credits, replay/mismatch, negative balances, offer versions,
double-spend prevention, casino exchange, cross-game rewards, scope/owner checks,
paid-title restrictions, exports and revision changes. Concurrent load has not
been benchmarked; transaction locks enforce serialized balance mutation.

Supabase advisors flag intentional definer RPCs and policy-free private tables.
The public manifest exposes only curated public configuration. Account snapshot
and redemption require an authenticated, scope-authorized owner. These warnings
were reviewed, not silenced by broadening table access. See:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

The pre-existing leaked-password protection warning remains a separate setup item:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Live visual/browser testing remains blocked by this environment's connection
failure to the custom domain. Automated tests do not prove native callback flows,
store approvals, actual receipt validation, or live email delivery.

## Payment integration checkpoint

The checkout preview, signed webhook handler, ledger fulfillment and review holds
are now implemented. See `PAYMENTS.md` for the connected sandbox, required secrets
and activation steps. Cash purchases remain off and no hosted checkout has yet
been completed end to end. This supersedes the earlier statement that no payment
processor integration exists; the processor is connected but runtime credentials
and sandbox acceptance testing remain pending.

## Multiplayer foundation

The public account manifest now advertises a versioned `multiplayer` contract.
See [MULTIPLAYER.md](MULTIPLAYER.md) for matchmaking, friend lobbies, numbered
guests, presence/coin privacy, JS/Python clients and game activation requirements.
The website provides Play together and saved preferences. Actual game engines
and guest signup remain gated until each game integrates the backend.
