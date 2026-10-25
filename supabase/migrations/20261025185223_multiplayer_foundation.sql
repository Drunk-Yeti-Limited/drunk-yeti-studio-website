begin;
-- Anonymous identities may use multiplayer only. Check the authoritative Auth row,
-- not user-editable metadata or a stale anonymous claim after account upgrades.
create or replace function public.dy_require(p_scope text,p_game text default null) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); cid text:=auth.jwt()->>'client_id'; app public.dy_apps%rowtype; guest boolean;
begin
 if u is null then raise exception 'authentication_required'; end if;
 select is_anonymous into guest from auth.users where id=u;
 if not found then raise exception 'account_deleted'; end if;
 if guest and p_scope is distinct from 'multiplayer' then raise exception 'permanent_account_required'; end if;
 if exists(select 1 from public.dy_account_requests where player_id=u) then raise exception 'account_deletion_pending'; end if;
 if cid is not null then
  select * into app from public.dy_apps where oauth_client_id=cid and enabled;
  if not found or not p_scope=any(app.scopes) or (p_game is not null and app.id!=p_game) then raise exception 'app_scope_denied'; end if;
 end if;
 return u;
end $$;
create table dy_private.mp_games (
 id text primary key check(id ~ '^[a-z0-9-]{1,64}$'), title text not null,
 enabled boolean not null default false, protocol integer not null default 1 check(protocol>0),
 seats integer not null default 2 check(seats between 2 and 12),
 regions text[] not null default array['global'], coin_sharing boolean not null default false
);
insert into dy_private.mp_games(id,title) values ('hex-fold','Hex Fold'),('schmuck','Schmuck');
create table dy_private.mp_settings(id boolean primary key default true check(id),guests_enabled boolean not null default false);
insert into dy_private.mp_settings default values;
create table dy_private.mp_people (
 player_id uuid primary key references auth.users(id) on delete cascade,
 guest_number bigint generated always as identity (start with 10000000) unique,
 share_presence boolean not null default false, share_coins boolean not null default false,
 game_id text references dy_private.mp_games(id), last_seen timestamptz
);
create table dy_private.mp_rooms (
 id uuid primary key default gen_random_uuid(), game_id text not null references dy_private.mp_games(id),
 protocol integer not null, region text not null, capacity integer not null check(capacity between 2 and 12),
 kind text not null check(kind in ('public','friends')), owner_id uuid references auth.users(id) on delete cascade,
 status text not null default 'waiting' check(status in ('waiting','ready','closed')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes'
);
create index mp_rooms_match on dy_private.mp_rooms(game_id,protocol,region,created_at) where status='waiting' and kind='public';
create index mp_rooms_owner on dy_private.mp_rooms(owner_id);
create table dy_private.mp_members (
 player_id uuid primary key references auth.users(id) on delete cascade,
 room_id uuid not null references dy_private.mp_rooms(id) on delete cascade,
 joined_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '120 seconds'
);
create index mp_members_room on dy_private.mp_members(room_id);
create table dy_private.mp_invites (
 room_id uuid not null references dy_private.mp_rooms(id) on delete cascade,
 target_id uuid not null references auth.users(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '120 seconds', primary key(room_id,target_id)
);
create index mp_invites_target on dy_private.mp_invites(target_id);
create index mp_invites_sender on dy_private.mp_invites(sender_id);
do $$ declare t text;begin
 foreach t in array array['mp_games','mp_settings','mp_people','mp_rooms','mp_members','mp_invites'] loop
 execute format('alter table dy_private.%I enable row level security',t);
 execute format('revoke all on dy_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
revoke all on sequence dy_private.mp_people_guest_number_seq from public,anon,authenticated;
create trigger mp_games_revision after insert or update or delete on dy_private.mp_games for each statement execute function dy_private.bump_revision();
create trigger mp_settings_revision after insert or update or delete on dy_private.mp_settings for each statement execute function dy_private.bump_revision();
update dy_private.account_config set document=jsonb_set(document,'{multiplayer}',
 '{"schema_version":1,"manifest_rpc":"dy_multiplayer_manifest","snapshot_rpc":"dy_multiplayer_snapshot","free_to_play":true,"gameplay_ready":false}'::jsonb);

create function dy_private.mp_identity(p_game text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('multiplayer',p_game);begin
 if (select is_anonymous from auth.users where id=u) and not (select guests_enabled from dy_private.mp_settings where id) then raise exception 'guests_not_ready';end if;
 insert into dy_private.mp_people(player_id) values(u) on conflict do nothing; return u;
end $$;
create function dy_private.mp_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dy_relations where low_id=least(a,b) and high_id=greatest(a,b) and status='accepted')
 and not exists(select 1 from public.dy_blocks where (player_id=a and target_id=b) or (player_id=b and target_id=a));
$$;
create function public.dy_multiplayer_manifest(p_schema integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_schema!=1 or p_schema is null then raise exception 'unsupported_schema';end if;
 return jsonb_build_object('schema_version',1,'revision',(select revision::text from dy_private.account_config where id),
 'free_to_play',true,'guests_enabled',(select guests_enabled from dy_private.mp_settings where id),
 'heartbeat_seconds',30,'presence_ttl_seconds',120,'poll_seconds',15,
 'games',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'available',enabled,'protocol',protocol,'seats',seats,'regions',regions) order by id) from dy_private.mp_games),'[]'::jsonb));
end $$;
create function public.dy_multiplayer_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=dy_private.mp_identity();result jsonb;begin
 select jsonb_build_object('schema_version',1,'identity',jsonb_build_object('id',u,'guest',a.is_anonymous,
 'name',case when a.is_anonymous then 'Guest-'||p.guest_number else coalesce(pr.display_name,'Yeti player') end,'avatar_id',case when a.is_anonymous then 'yeti' else coalesce(pr.avatar_id,'yeti') end),
 'privacy',jsonb_build_object('share_presence',p.share_presence,'share_coins',p.share_coins)) into result
 from dy_private.mp_people p join auth.users a on a.id=p.player_id left join public.dy_profiles pr on pr.player_id=p.player_id where p.player_id=u;
 return result||jsonb_build_object('room',(
 select jsonb_build_object('id',r.id,'game_id',r.game_id,'protocol',r.protocol,'region',r.region,'kind',r.kind,'status',r.status,'capacity',r.capacity,'expires_at',r.expires_at,
 'members',(select jsonb_agg(jsonb_build_object('id',m.player_id,'name',case when a.is_anonymous then 'Guest-'||p.guest_number else coalesce(pr.display_name,'Yeti player') end,'avatar_id',case when a.is_anonymous then 'yeti' else coalesce(pr.avatar_id,'yeti') end) order by m.joined_at,m.player_id)
 from dy_private.mp_members m join auth.users a on a.id=m.player_id join dy_private.mp_people p on p.player_id=m.player_id left join public.dy_profiles pr on pr.player_id=m.player_id where m.room_id=r.id and m.expires_at>now()))
 from dy_private.mp_members mine join dy_private.mp_rooms r on r.id=mine.room_id where mine.player_id=u and mine.expires_at>now() and r.expires_at>now() and r.status!='closed' and public.dy_can_access('multiplayer',r.game_id)
 and not exists(select 1 from dy_private.mp_members stale where stale.room_id=r.id and stale.expires_at<=now())
 and not exists(select 1 from dy_private.mp_members peer join public.dy_blocks b on (b.player_id=u and b.target_id=peer.player_id) or (b.target_id=u and b.player_id=peer.player_id) where peer.room_id=r.id)),
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',p.player_id,'name',pr.display_name,'avatar_id',pr.avatar_id,'game_id',p.game_id,
 'coins',case when p.share_coins and g.coin_sharing then (select balance::text from public.dy_wallets where player_id=p.player_id and game_id=p.game_id) else null end) order by pr.display_name)
 from dy_private.mp_people p join public.dy_profiles pr on pr.player_id=p.player_id left join dy_private.mp_games g on g.id=p.game_id
 where public.dy_can_access('social') and p.share_presence and p.last_seen>now()-interval '120 seconds' and dy_private.mp_friends(u,p.player_id)),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('room_id',i.room_id,'game_id',r.game_id,'sender_id',i.sender_id,'expires_at',i.expires_at))
 from dy_private.mp_invites i join dy_private.mp_rooms r on r.id=i.room_id where public.dy_can_access('social') and i.target_id=u and i.expires_at>now() and r.expires_at>now() and r.status='waiting' and dy_private.mp_friends(u,i.sender_id)),'[]'::jsonb));
end $$;
create function public.dy_multiplayer_privacy(p_presence boolean,p_coins boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('social');begin
 perform dy_private.mp_identity();
 if p_presence is null or p_coins is null then raise exception 'invalid_privacy';end if;
 update dy_private.mp_people set share_presence=p_presence,share_coins=p_coins where player_id=u;
 return public.dy_multiplayer_snapshot();
end $$;
create function public.dy_multiplayer_heartbeat(p_game text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=dy_private.mp_identity(p_game);r dy_private.mp_rooms%rowtype;begin
 if p_game is not null and not exists(select 1 from dy_private.mp_games where id=p_game and enabled) then raise exception 'game_not_ready';end if;
 perform pg_advisory_xact_lock(hashtextextended('mp-player:'||u,0));
 select r0.* into r from dy_private.mp_members m join dy_private.mp_rooms r0 on r0.id=m.room_id where m.player_id=u and m.expires_at>now();
 if found then
  perform public.dy_require('multiplayer',r.game_id);
  perform pg_advisory_xact_lock(hashtextextended('mp-game:'||r.game_id,0));
  if r.status!='closed' and r.expires_at>now() then
   if exists(select 1 from dy_private.mp_members m where m.room_id=r.id and (m.expires_at<=now() or exists(select 1 from public.dy_blocks b where (b.player_id=u and b.target_id=m.player_id) or (b.target_id=u and b.player_id=m.player_id)))) then
    update dy_private.mp_rooms set status='closed' where id=r.id;
   else
    update dy_private.mp_members set expires_at=now()+interval '120 seconds' where player_id=u;
    update dy_private.mp_rooms set expires_at=now()+interval '10 minutes' where id=r.id;
   end if;
  end if;
 end if;
 update dy_private.mp_people set game_id=p_game,last_seen=now() where player_id=u and (last_seen is null or last_seen<now()-interval '20 seconds' or game_id is distinct from p_game);
 return public.dy_multiplayer_snapshot();
end $$;
-- One active room per identity. All admission/leave operations take player then
-- game locks; compatible room allocation is serialized inside the database.
create function public.dy_multiplayer_join(p_game text,p_protocol integer,p_region text default 'global',p_kind text default 'public',p_room uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=dy_private.mp_identity(p_game);g dy_private.mp_games%rowtype;r dy_private.mp_rooms%rowtype;oldroom dy_private.mp_rooms%rowtype;begin
 select * into g from dy_private.mp_games where id=p_game and enabled;
 if not found then raise exception 'game_not_ready';end if;
 if p_protocol is distinct from g.protocol or p_region is null or not p_region=any(g.regions) or p_kind is null or p_kind not in ('public','friends') then raise exception 'incompatible_client';end if;
 if p_kind='friends' then perform public.dy_require('social');end if;
 perform pg_advisory_xact_lock(hashtextextended('mp-player:'||u,0));
 perform pg_advisory_xact_lock(hashtextextended('mp-game:'||p_game,0));
 -- A disconnected participant invalidates a ready match; no replacement seats.
 update dy_private.mp_rooms rr set status='closed' where rr.game_id=p_game and rr.status!='closed' and
 (rr.expires_at<=now() or exists(select 1 from dy_private.mp_members m where m.room_id=rr.id and m.expires_at<=now()));
 select r0.* into oldroom from dy_private.mp_members m join dy_private.mp_rooms r0 on r0.id=m.room_id where m.player_id=u and m.expires_at>now() and r0.expires_at>now() and r0.status!='closed';
 if found then
  if oldroom.game_id!=p_game or oldroom.kind!=p_kind or oldroom.protocol!=p_protocol or oldroom.region!=p_region or (p_room is not null and oldroom.id!=p_room) then raise exception 'leave_current_room_first';end if;
  return public.dy_multiplayer_snapshot();
 end if;
 delete from dy_private.mp_members where player_id=u;
 if p_room is not null then
  select * into r from dy_private.mp_rooms where id=p_room and game_id=p_game and protocol=p_protocol and region=p_region and kind='friends' and status='waiting' and expires_at>now();
  if not found or p_kind!='friends' or not exists(select 1 from dy_private.mp_invites where room_id=p_room and target_id=u and expires_at>now() and dy_private.mp_friends(u,sender_id)) then raise exception 'invitation_required';end if;
 elsif p_kind='public' then
  select rr.* into r from dy_private.mp_rooms rr where rr.game_id=p_game and rr.protocol=p_protocol and rr.region=p_region and rr.kind='public' and rr.status='waiting' and rr.expires_at>now()
  and (select count(*) from dy_private.mp_members where room_id=rr.id)<rr.capacity
  and not exists(select 1 from dy_private.mp_members m join public.dy_blocks b on (b.player_id=u and b.target_id=m.player_id) or (b.target_id=u and b.player_id=m.player_id) where m.room_id=rr.id)
  order by rr.created_at,rr.id limit 1;
 end if;
 if r.id is null then
  if (select count(*) from dy_private.mp_rooms where owner_id=u and created_at>now()-interval '1 minute')>=5 then raise exception 'too_many_rooms';end if;
  insert into dy_private.mp_rooms(game_id,protocol,region,capacity,kind,owner_id) values(p_game,p_protocol,p_region,g.seats,p_kind,u) returning * into r;
 end if;
 if (select count(*) from dy_private.mp_members where room_id=r.id)>=r.capacity then raise exception 'room_full';end if;
 if exists(select 1 from dy_private.mp_members m join public.dy_blocks b on (b.player_id=u and b.target_id=m.player_id) or (b.target_id=u and b.player_id=m.player_id) where m.room_id=r.id) then raise exception 'room_unavailable';end if;
 insert into dy_private.mp_members(player_id,room_id) values(u,r.id);
 delete from dy_private.mp_invites where room_id=r.id and target_id=u;
 if (select count(*) from dy_private.mp_members where room_id=r.id)=r.capacity then update dy_private.mp_rooms set status='ready' where id=r.id;end if;
 update dy_private.mp_people set game_id=p_game,last_seen=now() where player_id=u;
 return public.dy_multiplayer_snapshot();
end $$;
create function public.dy_multiplayer_leave() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=dy_private.mp_identity();r dy_private.mp_rooms%rowtype;begin
 perform pg_advisory_xact_lock(hashtextextended('mp-player:'||u,0));
 select r0.* into r from dy_private.mp_members m join dy_private.mp_rooms r0 on r0.id=m.room_id where m.player_id=u;
 if found then
  perform public.dy_require('multiplayer',r.game_id);
  perform pg_advisory_xact_lock(hashtextextended('mp-game:'||r.game_id,0));
  if r.status='ready' or r.owner_id=u then update dy_private.mp_rooms set status='closed' where id=r.id;end if;
  delete from dy_private.mp_members where player_id=u;
 end if;
 update dy_private.mp_people set game_id=null,last_seen=null where player_id=u;
end $$;
create function public.dy_multiplayer_invite(p_target uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('social');r dy_private.mp_rooms%rowtype;begin
 perform dy_private.mp_identity();
 perform pg_advisory_xact_lock(hashtextextended('mp-player:'||u,0));
 select r0.* into r from dy_private.mp_members m join dy_private.mp_rooms r0 on r0.id=m.room_id where m.player_id=u and m.expires_at>now();
 if not found then raise exception 'room_unavailable';end if;
 perform public.dy_require('multiplayer',r.game_id);
 perform pg_advisory_xact_lock(hashtextextended('mp-game:'||r.game_id,0));
 select * into r from dy_private.mp_rooms where id=r.id;
 if r.owner_id!=u or r.kind!='friends' or r.status!='waiting' or r.expires_at<=now() or not dy_private.mp_friends(u,p_target) then raise exception 'invitation_unavailable';end if;
 if (select count(*) from dy_private.mp_invites where room_id=r.id and expires_at>now())>=20 then raise exception 'too_many_invites';end if;
 insert into dy_private.mp_invites(room_id,target_id,sender_id) values(r.id,p_target,u) on conflict(room_id,target_id) do update set expires_at=excluded.expires_at;
end $$;
-- Called by trusted maintenance only; leaves Auth user deletion to the Auth API.
create function public.dy_multiplayer_cleanup() returns void language plpgsql security definer set search_path='' as $$
declare g text;begin
 for g in select id from dy_private.mp_games order by id loop
  perform pg_advisory_xact_lock(hashtextextended('mp-game:'||g,0));
  update dy_private.mp_rooms r set status='closed' where r.game_id=g and r.status!='closed' and
   (r.expires_at<=now() or exists(select 1 from dy_private.mp_members m where m.room_id=r.id and m.expires_at<=now()));
  delete from dy_private.mp_members m using dy_private.mp_rooms r where r.id=m.room_id and r.game_id=g and (r.status='closed' or m.expires_at<=now());
  delete from dy_private.mp_rooms where game_id=g and expires_at<now()-interval '1 day';
 end loop;
 delete from dy_private.mp_invites where expires_at<=now();
 update dy_private.mp_people set game_id=null,last_seen=null where last_seen<now()-interval '1 day';
end $$;
revoke all on function dy_private.mp_identity(text),dy_private.mp_friends(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dy_multiplayer_manifest(integer),public.dy_multiplayer_snapshot(),public.dy_multiplayer_privacy(boolean,boolean),public.dy_multiplayer_heartbeat(text),public.dy_multiplayer_join(text,integer,text,text,uuid),public.dy_multiplayer_leave(),public.dy_multiplayer_invite(uuid),public.dy_multiplayer_cleanup() from public,anon,authenticated;
grant execute on function public.dy_multiplayer_manifest(integer) to anon,authenticated;
grant execute on function public.dy_multiplayer_snapshot(),public.dy_multiplayer_privacy(boolean,boolean),public.dy_multiplayer_heartbeat(text),public.dy_multiplayer_join(text,integer,text,text,uuid),public.dy_multiplayer_leave(),public.dy_multiplayer_invite(uuid) to authenticated;
grant execute on function public.dy_multiplayer_cleanup() to service_role;
commit;
