# Account section: activation and maintenance

The canonical portal is part of the existing studio website at `/account/`. Its code and compiled browser bundle are committed here; normal GitHub Pages publishing needs no npm build step. The standalone private Sites prototype is not used by this integration.

## Current status

- Existing confirmed email/password accounts can use the backend-connected login, profile, friends, progress and export UI.
- Email registration, recovery and confirmation resend are enabled in `src/config.js`. Resend domain verification, custom SMTP storage, email confirmation requirements and the exact website callback have been verified in the dashboards. Live inbox delivery and link completion still need owner testing.
- Social-provider redirects and OAuth consent remain disabled.
- These UI gates are release controls, not backend access controls. Supabase currently allows email signup at the API level. Configure backend signup policy independently for a closed beta.
- No service-role key is included. The publishable key is public by design; deployed row-level security and RPC grants protect records.
- Account deletion, provider linking, full portability export and purchase processing are not complete in this website. The export includes game data, not every provider/Auth record.

## Dashboard settings needed

Project: `drunk-yeti-accounts` / `rgafawpucqdhjrzodayl`.

1. Under Authentication → URL Configuration, set Site URL to `https://www.drunkyetistudio.com/account/` and add the exact allowed redirect `https://www.drunkyetistudio.com/account/`. Confirm the canonical www domain serves HTTPS. Do not add broad wildcard redirects. If staging is used, add only its reviewed exact callback.
2. Configure production SMTP with an owned, verified sending address/domain. Verify confirmation and recovery delivery, expiration, failure behavior and a recovery link opened in the initiating browser (PKCE). Test that emails return to `/account/`, not localhost or the private prototype.
3. Email rollout is enabled to allow owner signup testing. Complete inbox confirmation and recovery tests, deletion/support flow, privacy information and abuse-protection review before promoting the service broadly.
4. For Apple/Google/Facebook, register the real applications in their provider developer consoles, configure the Supabase provider callback shown in the dashboard, and keep provider secrets in Supabase. Website redirect and provider-to-Supabase redirect are different. After testing, add the applicable surface to the provider readiness list in the account manifest; the page also checks the live backend provider enabled flags. See `PLATFORM.md`.
5. For studio SSO, enable Supabase OAuth server; use authorization path `/account/` with the Site URL above. Keep dynamic registration disabled initially. Register each game/Buddy/PlaySpace client and its exact redirect URI; assign the returned client ID and reviewed capabilities to the existing `dy_apps` registry. Enable the appropriate record. Then enable `oauthServer` after consent/deny/expiry and two-app tests.
6. Do not enable native app integrations merely because this page works. Native callback routing, secure vaults, verified rewards and authoritative coin gameplay remain separate work.

Nothing in the repository can supply Apple/Google developer ownership, SMTP credentials or dashboard authority. Enter secrets only into the relevant provider/Supabase settings, never into chat or public files.

## Build and test

Use Node 24+ for the test runner's module mocks:

```sh
cd account
npm ci
npm test
npm run build
```

Commit source, lockfile and generated `app.js` together. Keep dependencies pinned. `app.js` bundles the SDK locally, avoiding a runtime CDN dependency. The account page has a restrictive CSP and uses textContent for profile names and other remote strings. The portfolio's heavier 3D/merch/video scripts are not loaded on this route.

Tests cover callback validation, consent scope composition, UI element references, logged-out state, enabled email signup, recovery and resend paths, signed-in rendering with mocked backend data, switching accounts, API-failure recovery and logout. Browser inspection checks real rendering separately. No tests create a real customer account, send email or change a real password. Live cross-device/provider authentication must still be tested after configuration.

If account behavior must be rolled back, remove the two homepage account links or revert this commit. Do not delete players, tables or saves.

## Email activation checkpoint

Enabled email registration and callbacks after dashboard setup, with social login and cross-app OAuth still off. Rebuilt the shipped bundle and changed its URL to avoid a stale cached disabled bundle. Tests use mocked email delivery and do not prove real inbox delivery. The owner must complete signup and confirmation using their own credentials, followed by password recovery.

## Shared account platform

See `PLATFORM.md` for the v1 manifest/revision/snapshot contract, provider discovery,
Yeti Shards ledger, cross-game unlocks and future console connection boundaries.
Social provider buttons now use backend discovery rather than a compiled release
flag. Native apps still require their initial SDK/auth integration.
