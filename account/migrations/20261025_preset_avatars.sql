-- Shared static artwork; profiles store only an allowlisted identifier.
alter table public.dy_profiles add column avatar_id text not null default 'yeti'
 constraint dy_profiles_avatar_id_check check (avatar_id in ('yeti','raccoon','fox','beaver','seagull','otter','owl'));

-- Preserve existing clients and their selected avatar. Explicit columns are
-- required now that profiles have an additional column.
create or replace function public.dy_profile_set(p_handle text,p_name text,p_discoverable boolean default false,p_share boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=public.dy_require('profile'); p public.dy_profiles%rowtype;
begin
 perform public.dy_rate('profile',10);
 insert into public.dy_profiles(player_id,handle,display_name,discoverable,share_achievements,updated_at)
 values(u,lower(trim(p_handle)),trim(p_name),p_discoverable,p_share,now())
 on conflict(player_id) do update set handle=excluded.handle,display_name=excluded.display_name,discoverable=excluded.discoverable,share_achievements=excluded.share_achievements,updated_at=now() returning * into p;
 return to_jsonb(p);
end $$;

create function public.dy_profile_set_with_avatar(p_handle text,p_name text,p_avatar text,p_discoverable boolean default false,p_share boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=public.dy_require('profile'); p public.dy_profiles%rowtype;
begin
 if p_avatar is null or p_avatar not in ('yeti','raccoon','fox','beaver','seagull','otter','owl') then
  raise exception 'invalid_avatar';
 end if;
 -- Reuse the existing scope checks, rate limit and profile validation.
 -- Both writes are in the same transaction; failure rolls everything back.
 perform public.dy_profile_set(p_handle,p_name,p_discoverable,p_share);
 update public.dy_profiles set avatar_id=p_avatar where player_id=u returning * into p;
 return to_jsonb(p);
end $$;
revoke all on function public.dy_profile_set_with_avatar(text,text,text,boolean,boolean) from public,anon;
grant execute on function public.dy_profile_set_with_avatar(text,text,text,boolean,boolean) to authenticated;
