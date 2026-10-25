# Shared multiplayer foundation — contract v1

The account site now includes **Play together**, with Hex Fold and Schmuck
listed as coming soon, saved sharing preferences, and friends' shared activity.
Existing friend requests, acceptance, removal and blocking remain in Your people.
The database supports public matchmaking and private invited-friend lobbies.
No game executable has been changed and no card game is playable through this
account page. The catalog's two-player default is a staging value, not a claim
about either game's final rules or table size. Casino titles can be registered
when their permanent game IDs and supported modes are known.

## What is live, and what is gated

- The versioned manifest, authenticated snapshot and privacy preferences are live.
- Room allocation, invitations, expiring membership, heartbeat and numbered guest
  identities are implemented and tested with rolled-back database fixtures.
- Both games have `enabled=false`. Guest admission has `guests_enabled=false`;
  Supabase anonymous sign-in was not enabled. There are no playable queues yet.
- This uses the existing Supabase project and adds no paid multiplayer provider.
  Players are not charged for matchmaking. Hosting quotas and costs still apply.
- Database game locks prioritize correctness for the initial small rollout.
  Load-test and partition matchmaking by game/region/protocol before large scale;
  this is not a low-latency gameplay server or a promise of unlimited free hosting.

## Contract and integration

Public `dy_multiplayer_manifest(p_schema=1)` contains revision, games, protocol,
region lists, configured seat count, availability, guest readiness and timing.
The main `dy_account_manifest` advertises this contract under `multiplayer`.
Changes to multiplayer configuration advance the account manifest revision.
Clients should refresh discovery on startup, foreground and at least once per
minute while the multiplayer menu is open. Unknown JSON properties are ignored;
unknown schema/protocol versions must stop entry and offer an app update.
Supported configuration, titles and availability can change without shipping
new clients. New gameplay or UI capabilities still need client implementation.

| RPC | Purpose |
| --- | --- |
| `dy_multiplayer_snapshot()` | Own identity/lobby, consenting friends' activity, own invitations |
| `dy_multiplayer_privacy(p_presence,p_coins)` | Save account owner's sharing preferences |
| `dy_multiplayer_heartbeat(p_game)` | Update own activity and extend current membership |
| `dy_multiplayer_join(p_game,p_protocol,p_region,p_kind,p_room)` | Find/create a public room, create friend room, or accept an invitation |
| `dy_multiplayer_invite(p_target)` | Room owner invites an accepted, unblocked friend |
| `dy_multiplayer_leave()` | Leave own lobby; a ready match or owner's lobby closes |
| `dy_multiplayer_cleanup()` | Service-only cleanup; never exposed to game clients |

The JS `sdk/multiplayer-client.js` and Python `sdk/multiplayer_client.py` use
these RPCs. The host owns sign-in, PKCE, secure token storage and refresh. Native
apps need this integration once; the distro and desktop buddy binaries have not
been updated here. Enabled OAuth clients need `multiplayer` scope and their game
ID must match scoped game requests; friend features additionally need `social`.
Do not put service-role credentials in games or the distro.

```js
const mp = multiplayerClient(supabase);
const manifest = await mp.manifest();
// Only offer games whose available flag is true AND whose protocol this build supports.
await mp.join('hex-fold', 1, {region: 'global'});
const watcher = watchMultiplayer(mp, 'hex-fold', renderLobby, {onError: showError});
// On leaving the game/menu or signing out:
watcher.stop();
await mp.leave();
```

Poll lobby snapshots every 15 seconds; heartbeat every 30 seconds while active.
The JS watcher also refreshes discovery every minute and emits `onManifest`.
The example watcher suspends hidden browser tabs, and stopped requests cannot
render after logout. Mobile/native hosts must similarly handle backgrounding.
A member expires after 120 seconds without a heartbeat. Rooms expire after ten
minutes without renewal. Expired members invalidate a match; clients must rejoin.
A ready room means matched participants, not an active server game session.
Retries return the caller's existing compatible room. Users must leave before
switching games, regions, protocols or room kinds. Blocked players cannot match
or join each other's rooms; blocks also hide shared presence and invitations.

## Identity, privacy and economy

Numbered names are assigned by a database identity sequence (`Guest-10000000`,
etc.), never by a client-supplied identity. Once anonymous Auth is enabled,
`signInAnonymously` supplies a real anonymous session, not the public API key.
The backend reads `auth.users.is_anonymous`; spoofing user metadata or JWT claims
cannot promote a guest. Guests may only use multiplayer, not friends, saves,
profiles, purchases, redemptions or shared account progress.

Before enabling guests, integrate CAPTCHA in the actual game sign-in surface,
confirm Auth rate limits, and provide a scheduled Auth-API cleanup job for abandoned
anonymous users. The hosted Auth product does not automatically clean them up.
A guest can lose access when local session storage is erased. Signing into an
existing account does not merge guest records; do not promise automatic merges.

Activity and game coins are private by default. Coin visibility requires both
activity and coin consent, an accepted unblocked friendship, a fresh heartbeat,
and explicit `coin_sharing` enablement for that game. Shared coins come from the
server wallet, not a reported client amount. Shards, purchases, email and hidden
card/game state are never included. Game activity itself is self-reported and
must not serve as evidence for rewards or achievements.

No multiplayer API grants currency, awards wins, shuffles a deck, validates a
move, settles a pot or exposes a complete game state. Those belong in each game's
trusted server engine, with private player views and idempotent verified rewards.
Never use client-reported results to credit coins or Shards. Future casino coins
remain play-only; this foundation provides no cash-out or wagering settlement.

## Release and operations

For each game: wire the supported client protocol, implement/test its trusted
engine and disconnect/reconnect rules, set exact seat counts and regions, register
its OAuth scopes, then enable its catalog row. Use a new protocol number for
incompatible matchmaking changes. Keep payment activation independent.

Schedule `dy_multiplayer_cleanup()` with an existing trusted scheduler before
opening queues (for example every five minutes). It removes expired invites and
members, invalidates stale rooms, removes rooms older than the retention window,
and clears stale presence. No scheduler or Auth-user deletion job was enabled
because public queues and guest signup remain off.

`tests/multiplayer.sql` rolls back all fixture users and configuration changes.
It checks disabled games, protocol mismatch, room capacity, retry idempotency,
friend admission, blocks, consented coin sharing, stale presence/membership,
cleanup and guest isolation from payments/social features. `npm test` covers
safe rendering, privacy defaults, the JS client and account-switch clearing.
A concurrent load test and real two-device game session are still required
before a playable release.

Security review: private tables have RLS and no client table grants; privileged
RPCs use fixed search paths and derive the caller from Auth. The public manifest
intentionally returns only non-personal catalog/configuration. Supabase advisors
report these deliberate privileged RPCs and policy-free private tables; review
against [the function exposure guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
The pre-existing [leaked password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
remains disabled and was not changed by this work.
