-- Lightweight change checks avoid downloading every achievement on every poll.
create table dy_private.account_versions(player_id uuid primary key references auth.users(id) on delete cascade,revision bigint not null default 1);
alter table dy_private.account_versions enable row level security;
revoke all on dy_private.account_versions from public,anon,authenticated;
create function dy_private.bump_account_version() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 if tg_op='DELETE' then u:=old.player_id;else u:=new.player_id;end if;
 if exists(select 1 from auth.users where id=u) then
 insert into dy_private.account_versions(player_id) values(u) on conflict(player_id) do update set revision=dy_private.account_versions.revision+1;
 end if;return null;
end $$;
do $$ declare t text;begin
 foreach t in array array['dy_profiles','dy_saves','dy_wallets','dy_achievements','dy_entitlements','dy_reward_grants','dy_platform_links'] loop
 execute format('create trigger account_revision after insert or update or delete on public.%I for each row execute function dy_private.bump_account_version()',t);
 end loop;
end $$;
create trigger account_revision after insert or update or delete on dy_private.balances for each row execute function dy_private.bump_account_version();
create trigger reward_manifest_revision after insert or update or delete on public.dy_reward_rules for each statement execute function dy_private.bump_revision();
create function public.dy_account_revision() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');begin
 return jsonb_build_object('schema_version',1,'manifest_revision',(select revision::text from dy_private.account_config where id),'data_revision',coalesce((select revision::text from dy_private.account_versions where player_id=u),'0'));
end $$;
revoke all on function dy_private.bump_account_version() from public,anon,authenticated;
revoke all on function public.dy_account_revision() from public,anon,authenticated;
grant execute on function public.dy_account_revision() to authenticated;
create or replace function public.dy_account_snapshot(p_schema integer default 1) returns jsonb
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
 return data||jsonb_build_object('data_revision',coalesce((select revision::text from dy_private.account_versions where player_id=u),'0'),'generated_at',now());
end $$;
