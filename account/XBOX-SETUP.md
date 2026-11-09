# Xbox connection setup

Microsoft application: `74aebaec-1a84-4b69-b57c-7099fb1a42e5`.
Directory: `9e9818d1-9f5b-4adf-b04b-ccddbcadb780` (administrative metadata;
authorization intentionally uses `/consumers` for personal Microsoft accounts).

Register this exact **Web** redirect in the Microsoft application:

`https://rgafawpucqdhjrzodayl.supabase.co/functions/v1/xbox-callback`

The server reads `XBOX_CLIENT_SECRET` from Supabase Edge Function secrets.
Never commit its value. No Graph permissions or implicit grant are needed.
Scope is `XboxLive.signin`; no background/offline access is requested.

Website: sign into an existing Drunk Yeti account, open Social accounts,
then Connect Xbox. Complete Microsoft authorization and verify the connected
card. Xbox is a gaming identity connection, not a Supabase login provider.
It does not automatically import game saves, achievements, purchases or currency.

Security: JWT + profile-scope checks; PKCE S256; ten-minute state; separate
sessionStorage browser proof; atomic pending-request consumption; unique Xbox
identity constraint; tokens used in memory only; no account merging. Direct
Microsoft HTTPS responses supply the verified identity. An expired, reused,
cancelled or mismatched attempt never becomes a connection. Disconnect leaves
Drunk Yeti saves and purchases intact. Server-only tables intentionally have no
browser grants or RLS policies. One pending row per user bounds storage growth.

Validation: `npm test --prefix account`; deploy both functions. Live unauthenticated
requests must fail. Complete the real consent flow after registering the callback:
a successful mocked exchange is not proof Microsoft has authorized this app.
If Xbox rejects the application, obtain the appropriate Xbox service access through
Microsoft; do not substitute another application's credentials or bypass restrictions.

References:
- https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication
- https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/s2s-calls/live-title-service-calls-xbox-live
