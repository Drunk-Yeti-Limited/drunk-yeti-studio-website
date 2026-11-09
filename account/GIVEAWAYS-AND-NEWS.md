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

Signup emails reside in Supabase Authentication (`auth.users`). New non-guest accounts default to newsletter enrollment, including accounts created directly by existing games. A signup can send `options.data.newsletter_subscribed: false` to decline. The website displays a checked, optional checkbox, passes the chosen boolean for email signup, and applies a new OAuth account's choice after return. Existing accounts retain saved choices on sign-in.

Existing non-guest accounts without preferences were enrolled by the November 9 migration. Prior preferences and unsubscribes are preserved. Guest accounts and pending-deletion accounts are excluded. No email is delivered before email verification. An email address change does not silently transfer enrollment to the new address.

Account → Profile manages enrollment. `/unsubscribe/` lets a signed-in owner unsubscribe. `/delete-account/` submits a deletion request for studio review, stops newsletter enrollment and restricts connected account access. These pages are not completed automatic account erasure or anonymous email-unsubscribe endpoints. The studio must review `public.dy_account_requests`, handle billing, and complete deletion using the existing administrative process. Never delete based only on an email address entered by someone else.

### Mailing audience and consent

Automatic enrollment is **not affirmative consent**. `enrollment_source` distinguishes automatic existing-account enrollment, account defaults, displayed signup choices, and explicit profile preference changes. `affirmative_consent_at` is not manufactured for default enrollment.

Administrators can review the complete confirmed-email enrollment list with:

```sql
select * from dy_private.newsletter_audience();
```

For mailing services requiring affirmative consent, use:

```sql
select * from dy_private.newsletter_confirmed_audience();
```

Read fresh for each send; apply the provider's unsubscribe/bounce suppression list too. Do not import default-enrolled accounts as consented contacts. Brevo explicitly rejects prechecked newsletter checkboxes; Sender requires proof of opt-in. Provider-approved consent, sender/domain verification, campaigns, unsubscribe links, and bidirectional unsubscribe/bounce synchronization are still needed before sending. **No email service is connected, and no newsletters have been sent or scheduled.**

### Native game signup screens

The shared database default works now without game updates. A visible checkbox in a native game requires a new game build. Label it “Sign me up for the monthly Drunk Yeti newsletter”, start checked, and pass the user's boolean in Supabase signup metadata:

```js
await supabase.auth.signUp({
  email, password,
  options: {data: {newsletter_subscribed: checkbox.checked}}
});
```

Do not repeatedly apply the signup default at login. Link game settings to `https://www.drunkyetistudio.com/unsubscribe/` and `https://www.drunkyetistudio.com/delete-account/`. Browser-based game signup that uses the shared account website receives the updated UI without rebuilding.

## Verification

- Full account Node test suite and bundle build.
- `account/tests/gifts-newsletter.sql`: real database integration tests in a rollback transaction. Covers calendar durations, duplicate awards, stacking, existing app-access contract, recipient isolation, expiry, revocation, paid membership preservation, payment holds, private permissions, newsletter default enrollment/explicit preference/unsubscribe, changed-email suppression, and anonymous denial.
- `account/tests/newsletter.mjs`: UI consent, account-switch isolation and gift expiration messaging.
- No real prizes were granted and no real users were subscribed during tests.

- `account/tests/newsletter-defaults.sql`: enrollment defaults, unchecked signup, guest upgrade, consent distinction, OAuth choice, unsubscribe persistence, own-account deletion request, duplicate requests and anonymous denial.
