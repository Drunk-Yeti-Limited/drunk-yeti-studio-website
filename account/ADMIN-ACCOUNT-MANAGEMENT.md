# Account management rollout

Status: deployed on 2026-11-14 UTC. Migration applied, studio-user-admin v1 active, and PR #5 merged. The Pages deployment completed successfully and the live admin bundle matched the tested release. Live checks returned 401 for anonymous requests, 403 for untrusted origins, and 204 for allowed-origin preflight. Both management RPCs are executable only by service_role. Authenticated management behavior is covered by local tests; no real user was changed during release verification.

## Release order

1. Apply `supabase/migrations/20261113214939_admin_account_management.sql` to `rgafawpucqdhjrzodayl`.
2. Deploy `studio-user-admin` with `index.ts` and `_shared/admin-users.mjs`. Disable gateway JWT verification for the publishable-key client; the handler verifies every bearer token through Supabase Auth and checks the live session and current database role before every action.
3. Verify anonymous and ordinary-account requests fail. Run the account tests and SQL assertions. Check advisors.
4. Merge the admin frontend after backend activation.

## Controls

- Edit username and display name with the existing profile constraints.
- Send password recovery email to the account's saved email with the fixed account callback.
- Set a new password directly (owner only, 12–128 characters).
- Suspend and restore sign-in, revoke refresh sessions, and permanently delete an account.
- Every action requires a reason. Deletion requires typing the exact account email.
- Owner accounts and the current actor are protected. Admins cannot operate on other staff; owners can manage admins.
- Deletion is blocked when purchase/subscription records require billing review. It does not cancel subscriptions or issue refunds.
- The audit records target ID, action, reason, and completion status. It never records passwords or recovery links.
- Auth deletion may fail if Storage objects are still owned by the user; the UI reports failure for review.
- Session revocation removes refresh sessions. Existing access tokens may remain usable until expiry on direct-RLS endpoints; the shared account RPC gate also rejects banned/deleted accounts. Suspension is not a claim of instantaneous revocation of all JWTs everywhere.

## Validation

`npm test --prefix account` includes endpoint and dialog tests. The endpoint tests cover origin checks, verified identity, session binding, failed authorization, action allowlisting, fixed recovery callback, provider failure and secret-free audit payloads.

`PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node account/tests/admin-users-sql.mjs` runs the exact migration against an isolated PostgreSQL fixture. Validated with PGlite 0.3.14: service-only grants, actor/session matching, owner/staff guards, username validation/update, exact-email deletion confirmation, billing holds, session revocation, pending-operation protection and suspension gate.

No real user's account or password was changed by these tests.
