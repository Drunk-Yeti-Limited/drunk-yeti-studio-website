# itch.io account connection

Create an OAuth application under the Drunk Yeti itch.io publisher account. Use this exact redirect URI.

```
https://rgafawpucqdhjrzodayl.supabase.co/functions/v1/itch-account
```

Set the application's public client ID as the Supabase Edge Function variable `ITCH_OAUTH_CLIENT_ID`. The account page enables the buttons when the function reports that the ID is configured. The callback exchanges a one-use code with PKCE after checking the signed-in Drunk Yeti account and the browser's state. OAuth tokens are used during the exchange and are never saved.

The Snowlight restore button checks itch.io game 5254505 for the authorized user and records the resulting license in the existing Drunk Yeti product-access system. The same itch.io account can restore that title to one Drunk Yeti account. Disconnecting removes the profile connection. A verified purchase stays with the account that restored it. An itch.io customer who bought as a guest can attach the purchase to their itch.io account before restoring.

To verify production, connect and disconnect a test account, reconnect it with **Restore Snowlight purchase**, and check Snowlight's existing `dy_app_access('snowlight')` request from an owning account and an account with no purchase. Also verify that an already-restored purchase cannot be restored to a second account.

# Releases

Add published projects and their actual Butler channels to `itch-releases.json`. The daily website refresh saves the latest public version for each channel and queues new versions and devlog entries in `news-drafts.json`. The first successful channel check establishes a baseline. A project without an RSS feed can still report Butler builds. Review drafts and publish with `python scripts/publish-news.py <slug>`.

A game's release workflow can call `.github/workflows/publish-itch.yml` in this repository after its build uploads a GitHub Actions artifact. Pass the existing itch.io project slug, target channel, version, artifact name, and the caller repository's `BUTLER_API_KEY` Actions secret. For browser games, set the project type and first upload's browser-playable flag in the itch.io dashboard.
