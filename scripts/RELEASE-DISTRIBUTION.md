# Studio release distribution

The website refresh verifies store listings, updates studio news and RSS, and writes drafts to `preview/release-social/`. GitHub Actions lists drafts for newly discovered releases in the refresh job summary. Publish only after the canonical studio news link and storefront are live.

Run `python scripts/release_social.py` to rebuild all packages without posting. Use `--slug SLUG` for one release. Each package includes the canonical link, store links, channel attribution tags, captions, image and alt text, and video availability. For approved releases with a video, set the news entry’s optional `video` field to its public HTTPS URL. Missing footage is flagged in the video-channel drafts. Store announcements are included when the release explicitly links to the corresponding storefront. Keep source repositories out of public release links.

## Publish and record

- **Metricool:** Use the existing studio connection for Bluesky, Instagram, Threads, Facebook, Pinterest and YouTube. Review channel limits, any media required and content rules. Use Pinterest board `252342454060670383` (Drunk Yeti Studio). For Instagram and Shorts, add a verified profile or channel link where the platform makes it clickable. Keep a copy of the planner URL or the resulting post.
- **Mastodon:** The studio profile is [@drunkyetistudio@mastodon.social](https://mastodon.social/@drunkyetistudio). In Settings → Development, create a dedicated app token with account-identity and status-write access (on supported versions use `profile`; use `read:accounts` if that is how the instance authorizes identity). Put the token in the runner’s secret environment as `MASTODON_RELEASE_TOKEN`. The sender checks the account before publishing. Update the Mastodon profile’s website field to the studio URL for reciprocal profile verification.
- **Discord:** In the intended release channel, use Edit Channel → Integrations → Webhooks and create an incoming webhook. Set its URL as `DISCORD_RELEASE_WEBHOOK` in the runner’s secret environment. The sender waits for Discord to return a message ID and suppresses mass mentions.
- **Patreon:** Schedule a public monthly Yeti Workshop post at [Drunk Yeti on Patreon](https://www.patreon.com/DrunkYeti). Use member-only posts for test build invitations or soundtrack previews once those are ready. If member access becomes a product feature, use Patreon OAuth plus signed v2 membership webhooks and reconcile active memberships before granting perks. Patreon’s editor handles publishing.
- **itch.io and Steam:** Pair actual builds with a devlog or Steamworks announcement. Use Butler for itch.io build uploads from a trusted runner with a secret Butler credential. Add itch.io OAuth ownership linking only for titles you own and with a defined player perk. Use GitHub release events with a GitHub App limited to the repositories that should feed the workflow. Keep publishing credentials out of site source and social drafts.
- **Newsletter:** Roll recent releases into the studio's usual subscriber update. Use the tracked links to compare referral visits and store clicks across channels. Treat attributed visits and storefront install counts as separate measures.

Preview a reviewed post without sending:

```sh
python scripts/send_release.py games-drunkyeti-schmuck-android-launch mastodon
```

Use `--send` only for the intended release and channel, once the destination credential is configured. The direct sender stores successful receipts under `preview/release-social/` and removes recorded channels from subsequent drafts. Keep that directory between runs. Before retrying after a timeout, check the destination for a post. For another publisher, record a verified delivery with `python scripts/release_social.py --slug SLUG --mark-sent CHANNEL`. The local ledger is intentionally outside the published site. CI drafts require review and do not publish to social accounts.

## Check live destinations

The Discord webhook URL is a posting credential. If it was shared in a message,
replace the webhook in the intended release channel, then delete the old one.

Mastodon's application settings also show **Your access token** for the signed-in
account. Use that user token with `write:statuses` and `profile` (or
`read:accounts`). The client ID and client secret identify the OAuth app.
Posting as the studio requires a user token obtained from the app settings
or a user-authorized OAuth grant.

For a local Bash session, enter each value at a hidden prompt and export it:

```bash
read -rsp 'New Discord webhook URL: ' DISCORD_RELEASE_WEBHOOK; printf '\n'
export DISCORD_RELEASE_WEBHOOK
read -rsp 'Mastodon user access token: ' MASTODON_RELEASE_TOKEN; printf '\n'
export MASTODON_RELEASE_TOKEN
```

Run the following read-only checks against a published release slug. They verify
the Discord destination and Mastodon account without sending a post. A successful
identity check does not prove the Mastodon token has posting scope.

```bash
python scripts/send_release.py games-drunkyeti-schmuck-android-launch discord --check
python scripts/send_release.py games-drunkyeti-schmuck-android-launch mastodon --check
```

For a CI runner, map the values from that runner's secret store to the same
environment variables in the publishing step. The site's daily refresh does not
run that step.
