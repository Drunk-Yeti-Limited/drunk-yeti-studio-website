# Microsoft sign-in and Xbox continuation

The account page supports Supabase's `azure` provider for personal Microsoft accounts. Microsoft sign-in creates a normal Supabase user on first registration and signs in existing users thereafter. Existing players should use **Connect Microsoft** while signed in to keep their current account, especially when provider emails differ. No custom email-based account merging is performed.

## Provider configuration (still required)

- App/client ID: `74aebaec-1a84-4b69-b57c-7099fb1a42e5`
- Microsoft app supported accounts: personal Microsoft accounts.
- Add Web redirect `https://rgafawpucqdhjrzodayl.supabase.co/auth/v1/callback` alongside the existing Xbox Edge Function callback. Keep both.
- Supabase Authentication > Sign In / Providers > Azure: client ID above; client secret **Value** supplied directly in dashboard; tenant URL `https://login.microsoftonline.com/consumers`; enable Azure. Keep email required.
- The Xbox Edge Function secret `XBOX_CLIENT_SECRET` is separate from Supabase Auth's Azure secret configuration. Saving one does not configure the other.
- Review `email` / `xms_edov` optional claims per Supabase's Azure guide, retaining any existing manifest settings.
- Add the studio's existing privacy and terms URLs to Microsoft branding before public onboarding.

## Automatic Xbox setup

Microsoft sign-in or manual identity linking records a one-use, expiring browser continuation and a nonce on the OAuth return URL. Only a successful callback plus an authenticated user with a Microsoft identity can consume it. Identity linking also binds the original Drunk Yeti account ID.

After sign-in, the page checks the Xbox connection. An existing Xbox connection is preserved. Otherwise it automatically starts the existing PKCE-protected Xbox flow, including Microsoft consent/account selection when required. The player chooses their Microsoft/Xbox account in Microsoft's UI; the site never infers a gamertag from an email address. Xbox scopes are requested separately from Microsoft email authentication, as documented by Microsoft. No provider tokens are persisted by the Xbox service.

Cancellation, no Xbox profile, or provider errors leave the Microsoft/Drunk Yeti sign-in intact. The continuation is consumed before redirect, preventing loops. A player can retry with Connect Xbox. Logout removes the continuation.

## Verification

`npm test --prefix account` and `npm run build --prefix account`.
Tests cover nonce and owner binding, expiry/cancellation, one-use behavior, preserving existing connections, one redirect only, and retaining sign-in after Xbox failure. Real Microsoft registration/login and automatic Xbox continuation must still be tested after Azure credentials and redirect setup. The pre-existing manual Xbox flow has been verified live.

Sources:
- https://supabase.com/docs/guides/auth/social-sign-in/auth-azure
- https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication
