# Yeti Frostpass — implementation and launch checklist

Approved offer: **US$9.99/month**, with **1,000 purchased web Shards** after each
successful initial monthly payment and renewal. Shards roll over and are retained
after cancellation. Character purchases remain permanent. Full application access
is temporary and distinct from Shards, casino coins and permanent licenses.

## Current deployment

The database, account UI, Edge Function and SDK integration contract are implemented.
Checkout stays disabled until the Stripe product/price, portal configuration,
webhook event subscriptions, restricted-key permissions, sandbox lifecycle tests,
and at least one participating app's actual full/demo gate are verified. No app
binary is patched by this website release. Seeded apps are explicitly **planned**.
A public itch.io Frostpass phrase is a discovery label, not an authorization rule.

## Billing setup

1. Create a recurring monthly USD Price for 999 cents, quantity 1, no trial, under
   Yeti Frostpass; set lookup key `yeti-frostpass-monthly-v1`. Monthly benefit is 1000.
2. Create a Billing Portal configuration with invoice history and payment method
   updates enabled; cancellation at period end; price/quantity updates disabled.
3. Keep the existing Shard webhook URL and signing secret. Add these events while
   retaining existing checkout/refund/dispute events:
   `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`,
   `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`,
   `invoice.voided`, `invoice.marked_uncollectible`.
4. Runtime restricted key needs Checkout Sessions write, Products/Prices read,
   Subscriptions read, Invoices read, Customers read, Billing Portal Sessions write,
   plus the existing payment/refund read permissions. Keep live and sandbox keys
   separate. Never put secrets in SQL, website code, logs or this document.
5. Store the verified price ID and portal configuration in
   `dy_private.subscription_config`. Set mode, webhooks_ready and checkout_enabled
   only after the sandbox lifecycle checks and a supported app are ready. All
   public checkout prices/benefits come from server records; the browser never
   supplies an amount, customer ID or ownership metadata.
6. Tax collection is not automatically enabled. The existing
   STRIPE_AUTOMATIC_TAX flag must only be enabled after registrations are verified.

`subscription-account` authenticates the Supabase JWT, validates RPC scope, and
supports `status`, `access`, `checkout`, `portal` actions. Billing actions are web
only with an exact site origin; native apps can check access with their own scoped
OAuth session. OAuth apps require `account_read`; billing requires `economy`.
New app registrations remain disabled until their client identity is configured.

Checkout requests use a per-player advisory lock and a stable server-generated ID
as the Stripe idempotency key. Retry an open session rather than creating another.
Existing nonterminal memberships must be managed instead of purchased twice.
Stripe metadata points to a server-stored checkout request, never an email match.

The shared signed webhook retrieves current Stripe objects. Subscription access
requires live mode, active status, a paid matching latest invoice and an unexpired
billing period; trials, paused collection, past-due and canceled subscriptions do
not grant access. Cancellation scheduled at period end preserves the paid period.
Stale concurrent fetches cannot overwrite a newer database snapshot. Out-of-order
notifications retrieve current state. Retryable failures return HTTP 500.

Monthly Shards are granted from verified paid invoices for subscription_create or
subscription_cycle only. Match customer, price, currency, amount, mode, quantity
and a monthly non-prorated line period. A receipt is unique both by invoice and by
subscription/billing-period start. Credit and receipt commit atomically under the
player's economy lock. Sandbox receipts never credit spendable Shards or grant live
app access. Reconciliation scans paid invoice history and fills missing benefits.
No scheduled giveaway or client timer grants currency. Refund/dispute events for
known live subscription customers put the account on payment review; they do not
silently remove already-owned avatars. Resolve holds administratively after review.

## App/game integration

Use the stable product ID from `dy_private.access_products`.

```js
import {frostpassClient, watchFrostpass} from './sdk/frostpass-client.js';
const membership = frostpassClient(supabase);
const watcher = watchFrostpass(membership, 'platform-maker', (full, result) => {
  // Preserve saves/projects; safely switch the app's premium features/demo gates.
  setFullAccess(full || independentlyVerifiedPermanentLicense);
});
await watcher.refresh(); // login/startup
// On logout/account switch: watcher.stop(); discard all cached access.
```

Python: `FrostpassClient(get_access_token).access(product_id)` then
`has_full_access(response, product_id)`. Run network calls off the GUI thread.
Check at login/startup, foreground and every 5 minutes. Successful decisions
expire no later than 15 minutes after server verification and never later than
the paid period. Network failure or stale data means no subscription authorization;
never delete or corrupt the user's projects/saves when reverting to demo/lite.
There is no indefinite offline license in this release. Clients can be modified,
so authoritative premium backend operations must call `dy_app_access` themselves.
Do not trust a caller's cached JSON or `active` boolean.

`full_access` requires the product to be marked ready and either an active
subscription (included=true) or a verified permanent entitlement
`yeti-account / full-access:<product-id>`. Existing app/store licenses must retain
their own verification path; they are not automatically imported into this table.
Do not sell a permanent entitlement using a subscription receipt.

A new title can be enrolled in the database without rebuilding existing clients,
once that title implements this access contract. A backend change cannot add new
renderers, code or licensing checks to an unmodified binary. Mark `ready=true`
only after verifying the corresponding release actually enforces the check.

## Validation

- `npm --prefix account test`: real Stripe signature verification with fixtures,
  origin/auth/scope and price gates, UI states, stale lease rejection, logout race,
  plus existing Shard checkout and character purchase regression tests.
- `account/tests/frostpass.sql`: run inside BEGIN/ROLLBACK using fixture users;
  initial/renewal credits, duplicate invoices and periods, no unpaid/test credits,
  cancellation/expiration/stale verification, cross-user isolation, privilege gates.
- Sandbox end-to-end checkout, renewal/test-clock, failed renewal, cancellation,
  portal, refunds and replay still require connected Stripe sandbox configuration.
- No real customer is subscribed or charged by deployment or tests.
