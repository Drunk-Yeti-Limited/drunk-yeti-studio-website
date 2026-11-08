create table public.dy_connected_profiles (
 player_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('google','discord','github')),
 provider_subject text not null check(length(provider_subject) between 1 and 255),
 display_name text not null check(length(display_name)<=128),
 username text not null default '' check(length(username)<=128),
 avatar_url text,
 synced_at timestamptz not null default now(),
 primary key(player_id,provider)
);
alter table public.dy_connected_profiles enable row level security;
revoke all on public.dy_connected_profiles from public,anon,authenticated;
grant select,delete on public.dy_connected_profiles to authenticated;
grant all on public.dy_connected_profiles to service_role;
create policy connected_profile_read on public.dy_connected_profiles for select to authenticated
 using(player_id=(select auth.uid()) and (select public.dy_can_access('profile')));
create policy connected_profile_remove on public.dy_connected_profiles for delete to authenticated
 using(player_id=(select auth.uid()) and (select public.dy_can_access('profile')));
comment on table public.dy_connected_profiles is 'Private snapshots fetched from provider APIs; no provider access or refresh tokens are stored. Only server-verified linked subjects may be written.';
