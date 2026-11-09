-- API-internal pending authorizations: no browser can read PKCE verifiers.
create table public.dy_xbox_pending (
 player_id uuid primary key references auth.users(id) on delete cascade,
 state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
 proof_hash text not null check (proof_hash ~ '^[a-f0-9]{64}$'),
 verifier text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
alter table public.dy_xbox_pending enable row level security;
revoke all on public.dy_xbox_pending from public,anon,authenticated;
grant all on public.dy_xbox_pending to service_role;
create table public.dy_xbox_connections (
 player_id uuid primary key references auth.users(id) on delete cascade,
 xuid text not null unique check (xuid ~ '^[0-9]{1,20}$'),
 gamertag text not null check (length(gamertag)<=64),
 connected_at timestamptz not null default now()
);
alter table public.dy_xbox_connections enable row level security;
revoke all on public.dy_xbox_connections from public,anon,authenticated;
grant all on public.dy_xbox_connections to service_role;
-- Both tables are accessed only by xbox-link after JWT validation and profile scope checks.
-- Keep one pending authorization per account; no Microsoft/Xbox access tokens are persisted.
