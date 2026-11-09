# Newsletter studio

Editor: https://www.drunkyetistudio.com/newsletter-studio/

Sign in with the existing studio owner account. Only the private `newsletter_admins` allowlist can create, edit, queue, pause or resume campaigns. The browser never receives the API key or recipient email list. Drafts save to Supabase. Queued content is immutable; write a new draft for changes. Clicking Queue newsletter confirms delivery to the current eligible audience.

## Current activation state

The database and authenticated worker are installed. **Sending is disabled.** Brevo credentials, domain/sender validation, mailing address, worker schedule, and end-to-end delivery validation are still required. No test or newsletter messages have been sent. No existing account addresses have been uploaded to Brevo.

Default account enrollment remains as requested. This is NOT treated as affirmative consent. The delivery queue exclusively uses `dy_private.newsletter_confirmed_audience()`. Existing account imports and prechecked game defaults are excluded until explicit newsletter permission is recorded. Do not bypass Brevo's consent policy.

## Connect and activate

1. Sign into or create the studio's free Brevo account. Authenticate `drunkyetistudio.com` using the actual Brevo code/DKIM/DMARC records returned by that account; preserve existing mail DNS. Verify `newsletter@drunkyetistudio.com` as the sender. Replies go to `drunkyetilimited@gmail.com` unless changed.
2. Supply the studio's valid postal mailing address for the email footer. Create a dedicated Brevo contact folder and note its numeric ID.
3. Save `BREVO_API_KEY` and a strong random `NEWSLETTER_WORKER_SECRET` as Supabase Edge Function secrets. Never put either value in the website, Git repository or chat. Store the SAME worker secret in Supabase Vault named `newsletter_worker_secret` for the scheduler.
4. Administrator config (substitute the real folder ID and address):

```sql
update dy_private.newsletter_delivery_config
set folder_id = 123, postal_address = 'YOUR VERIFIED MAILING ADDRESS'
where id;
```

5. Complete a reviewed test campaign to an explicitly consenting studio test account, verify sender authentication, footer, native Brevo unsubscribe, local unsubscribe exclusion and quota behavior. Activate `enabled=true` only as part of this controlled test, and disable again if it fails. Never mark an unverified sender as ready.
6. Install `pg_cron` and `pg_net` using the Supabase dashboard, then schedule the worker every 15 minutes. The following assumes the secret already exists in Vault and the extensions are installed. The query never puts the secret into stored cron SQL:

```sql
select cron.schedule('drunk-yeti-newsletter-worker','*/15 * * * *', $job$
 select net.http_post(
   url := 'https://rgafawpucqdhjrzodayl.supabase.co/functions/v1/newsletter-worker',
   headers := jsonb_build_object('Content-Type','application/json',
     'x-newsletter-worker',(select decrypted_secret from vault.decrypted_secrets where name='newsletter_worker_secret' limit 1)),
   body := '{}'::jsonb, timeout_milliseconds := 120000
 );
$job$);
```

Use an adequate HTTP timeout supported by pg_net for the actual deployed runtime when activating; a timed-out HTTP invocation is not proof the worker stopped. Database leases prevent overlapping claims. Review `net._http_response` and Edge Function logs after activation; do not print secrets or recipient data.

## Delivery behavior

- Uses Brevo **marketing campaigns**, not the transactional-email channel.
- Snapshots the current confirmed-consent audience on queue. Users joining later receive future newsletters.
- Jobs contain up to 50 recipients, with a global cap of 300 reserved/submitted recipients per rolling **25 hours**. This conservative window avoids making assumptions about Brevo's daily reset timezone. A 1,000-recipient newsletter takes roughly four days; other Brevo activity or retry delays can extend this.
- Before dispatch, rechecks current local consent, verified email and deletion status. Reads each Brevo contact and skips blocklisted addresses; it never clears Brevo blocklisting or changes the contact email. Brevo also enforces its own suppression rules at delivery.
- Native Brevo unsubscribe link works without logging into Drunk Yeti. Account-page unsubscribe stops future batches through local checks. Already accepted batches may already be in flight.
- Provider unsubscribe is respected on subsequent checks. It is **not currently mirrored into the local profile checkbox**; a full two-way webhook integration remains outstanding. Never use the local checkbox alone to clear provider suppression.
- Accepted sends are persisted, not blindly retried. HTTP 402 waits 25 hours; HTTP 429 retries after 30 minutes. Unknown send outcomes and provider/account restrictions enter `review` and block further dispatch. Review the saved provider campaign ID in Brevo before any administrative recovery. Do not blindly reset a dispatched job.
- Submitted counts mean **accepted by Brevo**, not confirmed inbox delivery. Use Brevo campaign reports for delivered/bounce/open statistics. Expired preparation leases can retry safely because no send request was made; orphan empty lists/drafts may need periodic cleanup.
- Pause stops undispatched batches; it cannot recall an accepted email.

## Verification

`account/tests/newsletter-queue.sql` rolls back all fixtures and checks administrator isolation, disabled sender gating, default enrollment exclusion, duplicate queue prevention, concurrent claiming, daily limits, last-minute unsubscribe and worker ACLs. Run in isolation from production campaigns.

`account/tests/newsletter-worker.mjs` checks authentication, escaped content, provider suppression, marketing endpoint selection, quota/rate-limit retry behavior and ambiguous-send holds. Live provider delivery requires the activation test above.
