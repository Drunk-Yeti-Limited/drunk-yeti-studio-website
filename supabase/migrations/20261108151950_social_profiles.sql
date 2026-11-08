-- User-entered handles do not prove ownership and never grant platform entitlements.
create table public.dy_social_profiles (
  player_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('discord','github','steam','xbox','playstation','nintendo','instagram','facebook','twitch','youtube','tiktok','twitter','bluesky','linkedin','gitlab','epic')),
  handle text not null check (handle ~ '^[A-Za-z0-9][A-Za-z0-9_. #@-]{0,63}$'),
  share_with_friends boolean not null default false,
  primary key (player_id, platform),
  constraint social_nintendo_friend_code check (platform <> 'nintendo' or handle ~ '^SW-[0-9]{4}-[0-9]{4}-[0-9]{4}$')
);

alter table public.dy_social_profiles enable row level security;
revoke all on public.dy_social_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.dy_social_profiles to authenticated;
grant all on public.dy_social_profiles to service_role;

create policy social_profile_read on public.dy_social_profiles
for select to authenticated using (
  (player_id = (select auth.uid()) and (select public.dy_can_access('profile')))
  or (share_with_friends and case when (select public.dy_can_access('social')) then
    exists (
      select 1 from jsonb_array_elements((select public.dy_friends())) as friend
      where friend->>'player_id' = dy_social_profiles.player_id::text
        and friend->>'status' = 'accepted'
    ) else false end)
);
create policy social_profile_insert on public.dy_social_profiles
for insert to authenticated with check (
  player_id = (select auth.uid()) and (select public.dy_can_access('profile'))
);
create policy social_profile_update on public.dy_social_profiles
for update to authenticated using (
  player_id = (select auth.uid()) and (select public.dy_can_access('profile'))
) with check (
  player_id = (select auth.uid()) and (select public.dy_can_access('profile'))
);
create policy social_profile_delete on public.dy_social_profiles
for delete to authenticated using (
  player_id = (select auth.uid()) and (select public.dy_can_access('profile'))
);
comment on table public.dy_social_profiles is
  'Self-reported social and gaming handles; private by default; optional accepted-friend sharing. These are not verified Auth identities or platform links.';
