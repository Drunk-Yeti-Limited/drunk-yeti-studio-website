# Account section: activation and maintenance

The canonical portal is part of the existing studio website at `/account/`. Its code and compiled browser bundle are committed here; normal GitHub Pages publishing needs no npm build step. The standalone private Sites prototype is not used by this integration.

## Current status

- Existing confirmed email/password accounts can use the backend-connected login, profile, friends, progress and export UI.
- New registration, recovery email, social-provider redirects and OAuth consent are intentionally gated off in `src/config.js` until configuration and end-to-end checks are complete.
- These UI gates are release controls, not backend access controls. Supabase currently allows email signup at the API level. Configure backend signup policy independently for a closed beta.
- No service-role key is included. The publishable key is public by design; deployed row-level security and RPC grants protect records.
- Account deletion, provider linking, full portability export and purchase processing are not complete in this website. The export includes game data, not every provider/Auth record.

## Dashboard settings needed

Project: `drunk-yeti-accounts` / `rgafawpucqdhjrzodayl`.

1. Under Authentication → URL Configuration, set Site URL to `https://www.drunkyetistudio.com` and add the exact allowed redirect `https://www.drunkyetistudio.com/account/`. Confirm the canonical www domain serves HTTPS. Do not add broad wildcard redirects. If staging is used, add only its reviewed exact callback.
2. Configure production SMTP with an owned, verified sending address/domain. Verify confirmation and recovery delivery, expiration, failure behavior and a recovery link opened in the initiating browser (PKCE). Test that emails return to `/account/`, not localhost or the private prototype.
3. Before opening registration, finish the deletion/support flow and privacy information, and configure Auth abuse protections. Then set `emailCallbacks` and `registration` true only after real tests pass.
4. For Apple/Google/Facebook, register the real applications in their provider developer consoles, configure the Supabase provider callback shown in the dashboard, and keep provider secrets in Supabase. Website redirect and provider-to-Supabase redirect are different. Only enable `providerCallbacks` after testing; the page also checks the backend provider enabled flags.
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

Tests cover callback validation, consent scope composition, UI element references, logged-out state, disabled activation paths, signed-in rendering with mocked backend data, switching accounts, API-failure recovery and logout. Browser inspection checks real rendering separately. No tests create a real customer account, send email or change a real password. Live cross-device/provider authentication must still be tested after configuration.

If account behavior must be rolled back, remove the two homepage account links or revert this commit. Do not delete players, tables or saves.

## Email-first rollout (25 October 2026)

Google and Apple developer accounts are not prerequisites for this release. The create-account form now includes password confirmation and explains email verification; existing password logins remain available. Confirmation resend is implemented using Supabase Auth. Sending/signup remain gated until a verified SMTP sender and exact callback URL are configured, rather than presenting a false success. No account or email was created during tests.

Immediate owner action: choose/verify a free SMTP sending service (for example Resend) using the existing studio domain, add its supplied DNS records at the domain provider, and configure its credentials in Supabase Authentication SMTP. Allow `https://www.drunkyetistudio.com/account/` in Auth redirect URLs. Do not send credentials in chat. A successful real signup, confirmation and recovery test must precede enabling the email release flags. Social-provider flags can stay false indefinitely.
