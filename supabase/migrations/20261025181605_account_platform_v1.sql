-- Account platform v1: additive contract, shared earned currency, verified grants.
-- Private schema is not exposed by PostgREST. Public RPCs are the only interface.
create schema if not exists dy_private;
revoke all on schema dy_private from public,anon,authenticated;
create table dy_private.account_config (
 id boolean primary key default true check(id), revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 document jsonb not null check(jsonb_typeof(document)='object')
);
insert into dy_private.account_config(document) values ('{
 "schema_version":1,"minimum_client_schema":1,"refresh_after_seconds":60,
 "account_url":"https://www.drunkyetistudio.com/account/",
 "sections":[
 {"id":"wallets","type":"wallets","title":"Your wallets"},
 {"id":"achievements","type":"achievements","title":"Your achievements"},
 {"id":"unlocks","type":"unlocks","title":"Your unlocks"},
 {"id":"store","type":"store","title":"Spend Yeti Shards"},
 {"id":"connections","type":"connections","title":"Connected accounts"}],
 "features":{"redemptions":false,"casino_exchange":false,"cash_purchases":false},
 "auth":{"email":true,"providers":[
 {"id":"google","name":"Google","ready_surfaces":[]},
 {"id":"apple","name":"Apple","ready_surfaces":[]},
 {"id":"facebook","name":"Facebook","ready_surfaces":[]}]},
 "connections":[{"id":"xbox","name":"Xbox","status":"planned"},{"id":"psn","name":"PlayStation","status":"planned"}]
}');
create table dy_private.avatar_catalog (
 id text primary key check(id ~ '^[a-z][a-z0-9_-]{0,63}$'), name text not null,
 image text not null check(image ~ '^https://www[.]drunkyetistudio[.]com/(assets|account/avatars)/[a-zA-Z0-9_.-]+[.](png|webp|jpg)$'),
 free boolean not null default false, enabled boolean not null default false, sort_order integer not null default 0
);
insert into dy_private.avatar_catalog(id,name,image,free,enabled,sort_order) values
 ('yeti','Drunk Yeti','https://www.drunkyetistudio.com/assets/logo.png',true,true,0),
 ('raccoon','Raccoon','https://www.drunkyetistudio.com/account/avatars/raccoon.png',true,true,1),
 ('fox','Fox','https://www.drunkyetistudio.com/account/avatars/fox.png',true,true,2),
 ('beaver','Beaver','https://www.drunkyetistudio.com/account/avatars/beaver.png',true,true,3),
 ('seagull','Seagull','https://www.drunkyetistudio.com/account/avatars/seagull.png',true,true,4),
 ('otter','Otter','https://www.drunkyetistudio.com/account/avatars/otter.png',true,true,5),
 ('owl','Owl','https://www.drunkyetistudio.com/account/avatars/owl.png',true,true,6);
insert into public.dy_games(id,enabled) values('yeti-account',true) on conflict do nothing;
alter table public.dy_profiles drop constraint dy_profiles_avatar_id_check;
alter table public.dy_profiles add constraint dy_profiles_avatar_catalog_fkey foreign key(avatar_id) references dy_private.avatar_catalog(id);

create table dy_private.currencies (
 id text primary key, title text not null, kind text not null check(kind in ('earned','purchased')),
 game_id text references public.dy_games(id), source_platform text not null default 'game', enabled boolean not null default false,
 check(kind!='purchased' or (game_id is not null and source_platform in ('apple','google','web','xbox','psn')))
);
insert into dy_private.currencies(id,title,kind,enabled) values('yeti-shards','Yeti Shards','earned',true);
create table dy_private.balances (
 player_id uuid references auth.users(id) on delete cascade, currency_id text references dy_private.currencies(id),
 balance bigint not null default 0 check(balance between 0 and 9007199254740991), primary key(player_id,currency_id)
);
create table dy_private.ledger (
 event_id text primary key check(length(event_id) between 1 and 200),
 player_id uuid not null references auth.users(id) on delete cascade, currency_id text not null references dy_private.currencies(id),
 delta bigint not null check(delta!=0), balance_after bigint not null check(balance_after between 0 and 9007199254740991),
 reason text not null check(reason in ('earned','purchase','refund','adjustment','redemption')),
 created_at timestamptz not null default now()
);
create index ledger_player_time on dy_private.ledger(player_id,created_at desc,event_id);
create table dy_private.offers (
 id text primary key, version integer not null default 1 check(version>0), title text not null,
 currency_id text not null references dy_private.currencies(id), cost bigint not null check(cost between 1 and 9007199254740991),
 kind text not null check(kind in ('unlock','casino_coins')), target_game text not null references public.dy_games(id),
 item_id text, coin_amount bigint, enabled boolean not null default false,
 check((kind='unlock' and item_id is not null and length(item_id) between 1 and 100 and coin_amount is null)
 or (kind='casino_coins' and item_id is null and coin_amount between 1 and 9007199254740991))
);
create index offers_currency on dy_private.offers(currency_id);
create index offers_target on dy_private.offers(target_game);
create table dy_private.orders (
 player_id uuid references auth.users(id) on delete cascade, request_id uuid, offer_id text not null references dy_private.offers(id),
 offer_version integer not null, receipt jsonb not null, created_at timestamptz not null default now(), primary key(player_id,request_id)
);
create index orders_offer on dy_private.orders(offer_id);
create table dy_private.shard_rewards (
 game_id text, achievement_id text, amount bigint not null check(amount between 1 and 1000000), enabled boolean not null default false,
 primary key(game_id,achievement_id), foreign key(game_id,achievement_id) references public.dy_achievement_defs(game_id,id)
);
-- All private tables deny direct user access, including if the schema is exposed later.
do $$ declare t text; begin
 foreach t in array array['account_config','avatar_catalog','currencies','balances','ledger','offers','orders','shard_rewards'] loop
 execute format('alter table dy_private.%I enable row level security',t);
 execute format('revoke all on dy_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create function dy_private.bump_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin update dy_private.account_config set revision=revision+1,updated_at=clock_timestamp() where id;return null;end $$;
create function dy_private.config_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1;new.updated_at:=clock_timestamp();return new;end $$;
create trigger config_revision before update of document on dy_private.account_config for each row execute function dy_private.config_revision();
do $$ declare t text; begin
 foreach t in array array['avatar_catalog','currencies','offers','shard_rewards'] loop
 execute format('create trigger manifest_revision after insert or update or delete on dy_private.%I for each statement execute function dy_private.bump_revision()',t);
 end loop;
end $$;
create trigger achievement_manifest_revision after insert or update or delete on public.dy_achievement_defs for each statement execute function dy_private.bump_revision();

create function public.dy_account_manifest(p_schema integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c dy_private.account_config%rowtype;begin
 if p_schema is distinct from 1 then raise exception 'unsupported_schema';end if;
 select * into c from dy_private.account_config where id;
 return c.document||jsonb_build_object('revision',c.revision::text,'updated_at',c.updated_at,
 'avatars',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'image',image,'free',free) order by sort_order,id),'[]') from dy_private.avatar_catalog where enabled));
end $$;

-- Internal ownership lookup includes both purchases and valid cross-game rewards.
create function dy_private.owns_item(u uuid,g text,i text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.dy_entitlements where player_id=u and game_id=g and item_id=i)
 or exists(select 1 from public.dy_reward_grants rg join public.dy_reward_rules r on r.id=rg.rule_id
 join public.dy_achievements a on a.player_id=u and a.game_id=r.source_game and a.achievement_id=r.achievement_id
 where rg.player_id=u and r.target_game=g and r.item_id=i and r.enabled and a.revoked_at is null);
$$;
create or replace function public.dy_profile_set_with_avatar(p_handle text,p_name text,p_avatar text,p_discoverable boolean default false,p_share boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('profile');p public.dy_profiles%rowtype;begin
 if not exists(select 1 from dy_private.avatar_catalog where id=p_avatar and enabled and (free or dy_private.owns_item(u,'yeti-account','avatar:'||id))) then raise exception 'avatar_not_available';end if;
 perform public.dy_profile_set(p_handle,p_name,p_discoverable,p_share);
 update public.dy_profiles set avatar_id=p_avatar where player_id=u returning * into p;return to_jsonb(p);
end $$;

-- Trusted server only: receipt validation/game event validation happens before this call.
-- Player lock serializes all balance changes and redemptions; event key rejects replays.
create function public.dy_currency_event(p_player uuid,p_currency text,p_event text,p_delta bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c dy_private.currencies%rowtype;e dy_private.ledger%rowtype;b bigint;begin
 if p_player is null or p_event is null or length(p_event) not between 1 and 200 or p_delta is null or p_delta=0 or p_reason is null then raise exception 'invalid_event';end if;
 if not exists(select 1 from auth.users where id=p_player) or exists(select 1 from public.dy_account_requests where player_id=p_player) then raise exception 'account_unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('economy-player:'||p_player::text,0));
 perform pg_advisory_xact_lock(hashtextextended('economy-event:'||p_event,0));
 select * into e from dy_private.ledger where event_id=p_event;
 if found then
 if e.player_id!=p_player or e.currency_id!=p_currency or e.delta!=p_delta or e.reason!=p_reason then raise exception 'event_reused';end if;
 return jsonb_build_object('balance',e.balance_after::text,'replayed',true);end if;
 select * into c from dy_private.currencies where id=p_currency and enabled;
 if not found then raise exception 'unknown_currency';end if;
 if c.kind='purchased' and p_reason='earned' or c.kind='earned' and p_reason='purchase' then raise exception 'currency_origin_mismatch';end if;
 insert into dy_private.balances(player_id,currency_id) values(p_player,p_currency) on conflict do nothing;
 select balance into b from dy_private.balances where player_id=p_player and currency_id=p_currency for update;
 b:=b+p_delta;if b<0 or b>9007199254740991 then raise exception 'insufficient_or_invalid_balance';end if;
 update dy_private.balances set balance=b where player_id=p_player and currency_id=p_currency;
 insert into dy_private.ledger(event_id,player_id,currency_id,delta,balance_after,reason) values(p_event,p_player,p_currency,p_delta,b,p_reason);
 return jsonb_build_object('balance',b::text,'replayed',false);
end $$;
create function dy_private.award_shards() returns trigger language plpgsql security definer set search_path='' as $$
declare amount bigint;begin
 select r.amount into amount from dy_private.shard_rewards r where r.game_id=new.game_id and r.achievement_id=new.achievement_id and r.enabled;
 if amount is not null and new.revoked_at is null then
 perform public.dy_currency_event(new.player_id,'yeti-shards','achievement:'||new.player_id::text||':'||new.game_id||':'||new.achievement_id,amount,'earned');
 end if;return new;
end $$;
create trigger verified_achievement_shards after insert on public.dy_achievements for each row execute function dy_private.award_shards();

create function public.dy_redeem_offer(p_offer text,p_version integer,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('economy');o dy_private.offers%rowtype;prior dy_private.orders%rowtype;c dy_private.currencies%rowtype;flags jsonb;result jsonb;begin
 if p_request is null then raise exception 'request_id_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('economy-player:'||u::text,0));
 select * into prior from dy_private.orders where player_id=u and request_id=p_request;
 if found then
 if prior.offer_id!=p_offer or prior.offer_version!=p_version then raise exception 'request_reused';end if;
 return prior.receipt||jsonb_build_object('replayed',true);end if;
 select document->'features' into flags from dy_private.account_config where id;
 if not coalesce((flags->>'redemptions')::boolean,false) then raise exception 'redemptions_not_ready';end if;
 select * into o from dy_private.offers where id=p_offer and enabled for share;
 if not found or o.version is distinct from p_version then raise exception 'offer_changed';end if;
 select * into c from dy_private.currencies where id=o.currency_id and enabled;
 if not found then raise exception 'unknown_currency';end if;
 -- Paid currency is title-bound. Purchased-to-casino conversion stays prohibited.
 if c.game_id is not null and c.game_id!=o.target_game then raise exception 'currency_title_restriction';end if;
 if o.kind='casino_coins' and (c.kind!='earned' or not coalesce((flags->>'casino_exchange')::boolean,false)) then raise exception 'exchange_not_ready';end if;
 if o.kind='unlock' and dy_private.owns_item(u,o.target_game,o.item_id) then raise exception 'already_owned';end if;
 perform public.dy_rate('redeem',20);
 result:=public.dy_currency_event(u,o.currency_id,'redeem:'||u::text||':'||p_request::text,-o.cost,'redemption');
 if o.kind='unlock' then
 insert into public.dy_entitlements(player_id,game_id,item_id) values(u,o.target_game,o.item_id) on conflict do nothing;
 else
 perform public.dy_apply_wallet_event(u,o.target_game,'shard-exchange:'||u::text||':'||p_request::text,o.coin_amount);
 end if;
 result:=jsonb_build_object('request_id',p_request,'offer_id',o.id,'offer_version',o.version,'kind',o.kind,'target_game',o.target_game,'item_id',o.item_id,'coin_amount',o.coin_amount::text,'spent',o.cost::text,'currency_id',o.currency_id,'balance',result->>'balance','replayed',false);
 insert into dy_private.orders(player_id,request_id,offer_id,offer_version,receipt) values(u,p_request,o.id,o.version,result);
 return result;
end $$;

create function public.dy_account_snapshot(p_schema integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');data jsonb;begin
 if p_schema is distinct from 1 then raise exception 'unsupported_schema';end if;
 data:=jsonb_build_object('schema_version',1,'player_id',u,'manifest_revision',(select revision::text from dy_private.account_config where id),
 'profile',coalesce((select to_jsonb(p)-'player_id' from public.dy_profiles p where player_id=u),jsonb_build_object('avatar_id','yeti')),
 'wallets',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'kind',c.kind,'game_id',c.game_id,'source_platform',c.source_platform,'balance',coalesce(b.balance,0)::text) order by c.id),'[]') from dy_private.currencies c left join dy_private.balances b on b.currency_id=c.id and b.player_id=u where c.enabled),
 'game_wallets',(select coalesce(jsonb_agg(jsonb_build_object('game_id',w.game_id,'title',coalesce(a.title,w.game_id),'balance',w.balance::text) order by w.game_id),'[]') from public.dy_wallets w left join public.dy_apps a on a.id=w.game_id where w.player_id=u),
 'achievements',(select coalesce(jsonb_agg(jsonb_build_object('game_id',a.game_id,'id',a.achievement_id,'title',d.title,'earned_at',a.earned_at) order by a.earned_at desc,a.game_id,a.achievement_id),'[]') from public.dy_achievements a join public.dy_achievement_defs d on d.game_id=a.game_id and d.id=a.achievement_id where a.player_id=u and a.revoked_at is null),
 'unlocks',(select coalesce(jsonb_agg(to_jsonb(x) order by x.game_id,x.item_id),'[]') from (
 select game_id,item_id from public.dy_entitlements where player_id=u union
 select r.target_game,r.item_id from public.dy_reward_grants rg join public.dy_reward_rules r on r.id=rg.rule_id join public.dy_achievements a on a.player_id=u and a.game_id=r.source_game and a.achievement_id=r.achievement_id where rg.player_id=u and r.enabled and a.revoked_at is null)x),
 'offers',(select coalesce(jsonb_agg(to_jsonb(o)-'enabled'||jsonb_build_object('cost',o.cost::text,'coin_amount',o.coin_amount::text,'owned',case when o.kind='unlock' then dy_private.owns_item(u,o.target_game,o.item_id) else false end) order by o.id),'[]') from dy_private.offers o where o.enabled),
 'connections',(select coalesce(jsonb_agg(jsonb_build_object('platform',platform,'verified_at',verified_at) order by platform),'[]') from public.dy_platform_links where player_id=u),
 'activity',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select currency_id,delta::text,balance_after::text,reason,created_at from dy_private.ledger where player_id=u order by created_at desc,event_id desc limit 50)x));
 return data||jsonb_build_object('data_revision',md5(data::text),'generated_at',now());
end $$;
-- Export new economy data too, without dropping the prior export contract.
alter function public.dy_export_account() rename to dy_export_account_legacy;
create function public.dy_export_account() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_export');begin
 return public.dy_export_account_legacy()||jsonb_build_object('currency_balances',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from dy_private.balances b where player_id=u),'currency_ledger',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from dy_private.ledger l where player_id=u),'orders',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from dy_private.orders o where player_id=u));
end $$;
revoke all on all functions in schema dy_private from public,anon,authenticated;
revoke all on function public.dy_account_manifest(integer),public.dy_account_snapshot(integer),public.dy_currency_event(uuid,text,text,bigint,text),public.dy_redeem_offer(text,integer,uuid),public.dy_export_account(),public.dy_export_account_legacy() from public,anon,authenticated;
grant execute on function public.dy_account_manifest(integer) to anon,authenticated;
grant execute on function public.dy_account_snapshot(integer),public.dy_redeem_offer(text,integer,uuid),public.dy_export_account() to authenticated;
grant execute on function public.dy_currency_event(uuid,text,text,bigint,text) to service_role;
