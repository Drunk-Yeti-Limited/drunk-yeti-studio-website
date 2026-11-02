# Shard checkout — pricing and operations

Current packs, custom amounts and annual sales are documented at the end.

## Historical sandbox rollout (October 2026)

The Buy Shards account tab previews the owner-selected USD packs:

| Shards | Price before applicable tax |
| --- | --- |
| 100 | $0.99 |
| 550 | $4.99 |
| 1,200 | $9.99 |

At the initial rollout, real payments were off and draft packs were disabled.
Current payment mode must be read from the backend.
Stripe is connected to `Drunk Yeti Limited sandbox` (`acct_1UU6CrAQdqm1Hdmq`),
not a live account. The sandbox webhook `we_1UUWRwAQdqm1HdmqqAKLCMvB` is registered
at `https://rgafawpucqdhjrzodayl.supabase.co/functions/v1/shard-webhook`.
Its signing secret must be stored in Supabase before deliveries can be processed.
No Stripe key or signing secret is committed in this repository.

## Runtime and trust boundaries

- Stripe-hosted Checkout; no card input or card data storage on our website.
- SDK pinned to Stripe Node 22.6.0 and API `2026-08-26.dahlia`.
- Dynamic payment methods; completed and asynchronous-success events both check
  `payment_status=paid` on a session retrieved from Stripe.
- `shard-checkout` authenticates the user's bearer token with Supabase Auth and
  calls the scoped prepare RPC. Browser requests must use the studio origin;
  origin checks are defense in depth, not identity verification.
- The client sends a pack ID, expected version and request UUID. The database
  snapshots the price, quantity, recipient and mode. Client amounts are ignored.
- Stripe's idempotency key is the order ID. Retries reuse the same order/session;
  requests older than 20 minutes require a fresh checkout request.
- `shard-webhook` verifies Stripe's raw-body signature with its official SDK and
  checks test/live mode, payment amount/currency, session identity and order.
  A success-page URL never grants Shards. Failed DB processing returns 500 so
  Stripe retries; fulfilled session IDs cannot grant twice.
- Both functions use `verify_jwt=false` because authentication happens inside the
  handlers (Supabase Auth for checkout, Stripe signature for webhook). This does
  not permit anonymous purchases or unsigned webhook fulfillment.
- Test fulfillment records `test_complete` but never changes a spendable wallet.
  Live fulfillment credits `yeti-shards-web`, separately from earned Shards.
  Purchased Shards are currently title-bound to `yeti-account`, cannot fund
  casino exchanges, and have no cash-out or transferable monetary value.
- Refund/dispute notifications create an audited review record and a spending
  hold. They do not issue refunds or silently claw back consumed unlocks.
  Staff must reconcile the payment, purchased balance and consumed unlocks before
  clearing a hold. Dispute outcomes are reviewed manually in this first version.

## Finish sandbox activation

The connected Stripe plugin can manage the sandbox, but it does not supply the
runtime credential to Supabase. Store secrets through the Supabase dashboard or
an authenticated secrets workflow; do not paste keys into chat or source files.

1. Create a **restricted sandbox API key** for this service. Grant only permissions
   required by Checkout Session create/read, inline Price/Product creation, Charge
   read and PaymentIntent read. Check denied API requests to refine permissions;
   do not grant payouts, transfers, customer deletion or broad unrelated access.
2. Set Supabase Edge Function secrets:
   - `STRIPE_SECRET_KEY`: the restricted `rk_test_…` key (the variable name is
     retained for compatibility; restricted keys are preferred).
   - `STRIPE_WEBHOOK_SECRET`: signing secret for the registered sandbox webhook.
   - `YETI_PAYMENTS_MODE`: `test`.
   - Leave `STRIPE_AUTOMATIC_TAX` unset/false until tax registrations are verified.
3. In `dy_private.payment_config`, set mode `test` and explicitly allowlist the
   internal test user's UUID in `test_players`. Enable the three draft pack rows.
   Keep `features.cash_purchases=false`; test mode never needs the live switch.
4. Sign into the studio account as that tester. Complete a Stripe sandbox checkout
   using Stripe's published test data. Verify `test_complete` in purchase history,
   successful webhook delivery, and **no spendable credit** in the real wallet.
5. Test decline, cancellation, retries, asynchronous completion, webhook retries,
   refund/dispute review and return-page reload. Never use a real card in tests.

The webhook subscribes only to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `charge.refunded`, and
`charge.dispute.created`. It does not subscribe to unrelated Stripe events.
Checkout can be paused independently of webhook processing so already-paid
orders still finish. Do not rotate from sandbox to live keys until the sandbox
queue is drained; use separate endpoints/projects for overlapping environments.

## Before live launch

Finish a real sandbox end-to-end test, confirm the processor supports the exact
business model, decide usable spending offers, publish purchase/refund/support
terms, and configure relevant tax registrations. Do not market these packs as
available until there is something supported to spend them on. Google Play and
Apple payment rules still apply to native apps and cross-title use.

A live launch requires a live restricted key, a separate live webhook and signing
secret, payment mode `live`, enabled packs and the `cash_purchases` backend switch.
No live account, live product, live charge, or tax registration was created here.
The automatic-tax option must only be enabled after an active registration has
been confirmed; setting a flag alone does not establish tax collection duties.

## Tests and operations

`npm test` includes actual Stripe SDK signature verification, missing/incorrect
signatures, mode isolation, client-price tampering, unsigned/unpaid requests,
retryable processing failures, refund routing and safe UI rendering.
`tests/payments.sql` uses generated fixtures and rolls back every mutation; it
checks disabled gates, tester allowlisting, order reuse, underpayment rejection,
exactly-once credits, refund holds, privacy and absence of test-wallet credits.
These are automated integration tests, not a completed Stripe hosted checkout.

To investigate an order, correlate its UUID with `metadata.yeti_order_id` and the
immutable `stripe-checkout:<session ID>` ledger entry. Do not log keys, card data,
raw webhook payloads or bearer tokens. Monitor 4xx/5xx webhook deliveries in
Stripe Workbench. Add durable webhook queuing before high-volume launches.

Docs:
- https://docs.stripe.com/payments/checkout-sessions
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/keys/restricted-api-keys
- https://stripe.com/legal/restricted-businesses

## Volume pricing and recurring holiday sales (November 2026)

Current live payment gates and existing orders are preserved. The earlier sandbox
rollout notes above are historical; the backend is authoritative for current mode.

| Shards | Regular USD price, before applicable tax |
| --- | --- |
| 100 | $0.99 |
| 550 | $4.99 |
| 1,200 | $9.99 |
| 2,500 | $19.99 |
| 5,500 | $39.99 |
| 12,000 | $79.99 |
| 25,000 | $149.99 |
| 50,000 | $274.99 |

Custom purchases allow any whole quantity from 100 to 50,000. Price is linearly
interpolated between adjacent pack totals, rounded UP to cents, then seasonal
discounts apply and round UP again. Adding Shards never reduces the total. Exact
pack quantities match preset prices. Volume savings compare with the 100-Shard
base rate. Discounts apply to Shard purchases, not Frostpass or avatar prices.

Recurring annual windows, America/Denver, inclusive start/exclusive end:
- Spring: March 20–April 3, extra 10% off.
- Summer: June 20–July 6, extra 10% off.
- Halloween: October 24–November 2, extra 10% off.
- Black Friday/Cyber Monday: Friday one week before Black Friday through the
  Tuesday after Cyber Monday, extra 20% off. Calculated for each calendar year.
- Winter/New Year: December 20–January 4, extra 10% off.

The database's `dy_shard_quote` returns current prices. `dy_checkout_prepare_v2`
verifies quantity and quoted cents before snapshotting an order with pricing/sale
details. Client-supplied totals cannot set prices. Idempotent retries retain the
original order and reject mismatched quantities/prices. Existing webhook amount
matching and exactly-once fulfillment remain unchanged; legacy clients retain
the original RPC with server-calculated discounts.

The homepage's `sales.js` calls the public read-only `dy_shard_sale` RPC. It shows
a banner only during a sale with live checkout enabled. It starts hidden, hides
on lookup failure or expiry, and rechecks every minute while visible. No Python
job or extra cron service is needed for sale boundaries. Daily storefront
refreshes continue unchanged. Custom quotes use the backend calculation instead
of duplicating pricing logic in the browser.
