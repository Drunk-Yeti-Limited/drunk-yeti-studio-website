# Social profiles and sign-in

The account page supports 16 self-reported network handles. Each is private by default; a user may share individual handles with accepted Drunk Yeti friends. Stored handles never establish a verified identity, entitlement, or game-platform connection.

Google, Discord, and GitHub are enabled for web sign-in in manifest revision 40. The Discord and GitHub authorization redirects matched the supplied client IDs and Supabase callback. A successful user sign-in through each provider is still required to validate its client secret and token exchange.

## Finish verified identity linking

1. In the project's Supabase Authentication → Sign In / Providers settings, enable manual identity linking. A logged-in user can then prove ownership of another provider and attach it to the same account.
2. Set the public account manifest's `auth.identity_linking` to `true` after confirming the dashboard setting. Until then, the page displays existing identities and keeps connection changes disabled.
3. Sign into an existing account, connect a second provider, and confirm the account UUID, purchases, and saves remain unchanged. Sign out and sign in through that provider. Unlink only while another working sign-in identity remains.

The connector does not expose the dashboard auth configuration. The current dashboard login stopped at GitHub passkey verification, so this activation has not yet been performed.

## Additional providers

All use this authorized callback URL:

`https://rgafawpucqdhjrzodayl.supabase.co/auth/v1/callback`

| Provider | Setup | Supabase provider ID |
| --- | --- | --- |
| X | https://developer.x.com/ — OAuth 2.0 Web App, request email, supply real website/terms/privacy URLs; Client ID and Client Secret | `x` |
| Twitch | https://dev.twitch.tv/console/apps — register application, callback, Client ID and Client Secret | `twitch` |
| Microsoft | https://entra.microsoft.com/ — app registration supporting intended personal/organizational accounts, Web callback, application ID and secret **value** | `azure` |
| LinkedIn | https://www.linkedin.com/developers/apps — request Sign In with LinkedIn using OpenID Connect, callback and client credentials | `linkedin_oidc` |
| GitLab | https://gitlab.com/-/user_settings/applications — OAuth application, callback, `read_user` scope and client credentials | `gitlab` |

Enter secrets directly in Supabase. Never commit them or place them in the browser bundle. These providers are implemented in the client but have empty `ready_surfaces` in the manifest until configured and checked. After validation, add `web` to that provider's readiness list. Microsoft requires the `email` scope (implemented); Microsoft sign-in alone does not establish Xbox profile access.

Steam website identity verification uses a separate OpenID 2.0 server integration. Xbox services, PlayStation Network, and Nintendo integrations require platform-specific setup and, where applicable, developer approval. Their current profile fields are only self-reported handles/friend codes.

## Verification

- `cd account && npm ci && npm test && npm run build`
- `supabase/tests/social_profiles.sql`: transaction-only RLS regression suite, run against a disposable/local PostgreSQL fixture. Validates owner CRUD, ownership reassignment denial, private defaults, pending/accepted/blocked friend visibility, scoped-app denial, and anonymous denial.
- The suite passed locally with PGlite 0.5.15, using the live project's authorization/friend function definitions and a stubbed rate limiter. No hosted fixture accounts were created. Hosted RLS, grants, and security advisors were inspected separately.
- OAuth unit tests use real SDK PKCE construction; they do not claim real provider consent/token exchange has completed.

Official references: https://supabase.com/docs/guides/auth/auth-identity-linking and https://supabase.com/docs/guides/auth/social-sign-in
