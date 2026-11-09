# Studio admin

Visit https://www.drunkyetistudio.com/admin/ and sign in with the existing studio owner account. The Profile page displays an admin link after the server verifies the private allowlist. Neither a frontend email check nor user-editable metadata grants admin rights.

## Give a Frostpass

1. Find the player under Accounts, then choose **Choose for gift**, or enter their verified account email.
2. Choose 3 months, 1 year, 1 month or 6 months.
3. Enter a unique award reference, e.g. `facebook-holiday-2026-winner-01`.
4. Review the recipient and duration, then confirm. The result shows the exact start and expiry dates.

A retry with the same reference and recipient/duration returns the original award. Gifts stack behind existing gift and already-paid time. Stripe billing is not cancelled; promotional gifts do not grant the paid-invoice monthly Shards. Existing game Frostpass checks consume this entitlement without game changes. Revocations require a reason and preserve history. The audit records the authenticated administrator's UUID.

The panel also provides account search (50 per page), gift history (50 per page), newsletter audience counts, the newsletter editor, deletion-request review (latest 100), recent audit actions (latest 100), and links to source, deployments, Supabase and Brevo. It is not a general-purpose database editor, content CMS or automatic account purge tool.

## Optional SMS

Account → Profile contains an unchecked-by-default SMS preference and international phone field. Explicit opt-in records consent time/version. Opting out removes the stored phone number. Users can only manage their own preference; private tables are not exposed. Admin views display opt-in status, not phone numbers.

**SMS sending is disabled.** Brevo SMS requires paid credits; no credits are purchased and no texts are sent. Preferences do not constitute verified number ownership. Before activation: implement phone verification, sender registration, provider suppression / STOP processing, rate and spend limits, and an SMS delivery integration. Email and SMS preferences are independent.

Newsletter email activation remains separate: saved Brevo key and verified sender exist, but mailing-address approval, worker secret / schedule and end-to-end testing are still pending. No messages are sent by opening this panel.

## Validation

Run `account/tests/studio-admin-sms.sql` as a rollback-only SQL test. It covers non-admin and third-party-client rejection, private table/anon permissions, default-off SMS, number validation, account isolation, unsubscribe clearing, gift idempotency, admin audit identity, and existing Frostpass access before/after revocation.
