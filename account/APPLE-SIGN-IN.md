# Sign in with Apple

Web sign-in uses the existing Supabase Auth PKCE flow, including account linking.
The website shows the official Apple button first on iPhone, iPad (including
desktop browsing mode) and Mac. It remains available on other devices so users
can access the same account after changing devices. Both the public account
manifest and Supabase Auth must report Apple enabled before the button appears.

Existing users should sign in with their current method, then use **Social &
gaming → Connect Apple**. This is especially important with Hide My Email, which
can provide a different email address. No profile or purchase is merged by client
code. A connected Apple identity uses the same account and role checks as other
sign-in methods, including the existing admin/owner welcome dialog.

## Registration

- Primary App ID: `com.drunkyetistudio.account`
- Web Services ID: `com.drunkyetistudio.account.web`
- Callback: `https://rgafawpucqdhjrzodayl.supabase.co/auth/v1/callback`
- Website domains: `www.drunkyetistudio.com`, `drunkyetistudio.com`
- Auth callback domain: `rgafawpucqdhjrzodayl.supabase.co`
- Supabase Apple Client IDs: web Services ID first.
- Allow users without an email: off.

Only the web surface is activated. Native apps need their own entitlement and
callback integration before any native surface is marked ready.

## Credential maintenance

The current Apple OAuth client secret expires **2027-05-12 14:51:50 UTC**.
Rotate it before this date to avoid interrupting web sign-in. The `.p8` signing
key is stored separately in the owner's private files. Never commit a private
key or client secret to this repository, frontend, tests or deployment logs.

Generate an ES256 JWT using the Apple signing key, its Key ID, the owning Team ID,
the web Services ID as `sub`, `https://appleid.apple.com` as `aud`, current `iat`
and an `exp` no more than six months later. Update only the Apple provider's
Secret Key in Supabase Auth, keeping the Services ID first. Confirm Apple remains
enabled and the live sign-in button opens Apple's authorization page.

An authorization-page check does not prove completed Apple consent, token
exchange, private-relay mail delivery or native app login. Keep these distinct
from automated mocked callback and account-linking tests.
