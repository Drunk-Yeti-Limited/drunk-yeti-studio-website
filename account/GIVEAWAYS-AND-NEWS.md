# Frostpass gifts and monthly studio news

## Award a pass

Use the Supabase SQL Editor as an administrator. The recipient must first create and verify a Drunk Yeti account. Use the account's email address. These functions are in the private schema and cannot be called by players through the public API.

Three months:

```sql
select dy_private.grant_frostpass('winner@example.com', 3, 'facebook-2026-12-winner-1');
```

One calendar year:

```sql
select dy_private.grant_frostpass('winner@example.com', 12, 'facebook-2026-12-winner-2');
```

Replace the email and award reference. Use a unique, stable reference for each prize. Re-running the same award returns the original grant without extending it twice. The returned timestamps show the exact access dates. Additional gifts queue behind prior unrevoked gifts and already-paid subscription time. Grants accept 1–36 calendar months.

```sql
select id, player_id, reference, months, starts_at, ends_at, revoked_at
from dy_private.frostpass_gifts order by created_at desc;
```

To revoke an award while retaining its audit record:

```sql
select dy_private.revoke_frostpass('facebook-2026-12-winner-1', 'Award issued to wrong account');
```

Dates are checked by `dy_subscription_status()` on each request. `dy_app_access()` and the existing subscription Edge Function/SDK continue to use that same contract. No cron job or manual expiration is required. Cached grants are valid for at most 15 minutes and never past the pass's end. This works for games already using the existing server status/access contract; it cannot fix a game that caches an unexpiring boolean or has never integrated Frostpass.

Gift access does not modify Stripe billing, pause an existing subscription, issue paid-invoice Shards, or create permanent purchases. A winner with a recurring subscription must cancel that subscription separately if they do not want it to renew during the gift period. Existing permanent purchases remain independent. Payment/account restrictions remain enforced.

## Signup emails and newsletters

Signup email addresses already reside in Supabase Authentication (`auth.users`). Marketing enrollment is separate: Account → Profile → Monthly studio news. The checkbox is off by default, requires a confirmed email, and records consent version and timestamps. Users can unsubscribe there. If the account email changes, the new address is excluded until the user opts in again.

The administrator's current eligible mailing audience is:

```sql
select * from dy_private.newsletter_audience();
```

Use this opt-in audience, not the complete Auth user list, for monthly newsletters. It excludes unconfirmed, anonymous, unsubscribed and deletion-pending accounts. Do not publish or expose this list. Read it fresh for each send and apply the email service's suppression list too.

**Sending is not configured.** No newsletters have been sent or scheduled. A mailing service, verified sender/domain, campaign content, and an unsubscribe link plus bounce/unsubscribe synchronization must be configured before delivery. Account settings currently manage consent only. Do not use Supabase's authentication-mail channel for bulk campaigns.

## Verification

- Full account Node test suite and bundle build.
- `account/tests/gifts-newsletter.sql`: real database integration tests in a rollback transaction. Covers calendar durations, duplicate awards, stacking, existing app-access contract, recipient isolation, expiry, revocation, paid membership preservation, payment holds, private permissions, newsletter default/opt-in/unsubscribe, changed-email suppression, and anonymous denial.
- `account/tests/newsletter.mjs`: UI consent, account-switch isolation and gift expiration messaging.
- No real prizes were granted and no real users were subscribed during tests.
