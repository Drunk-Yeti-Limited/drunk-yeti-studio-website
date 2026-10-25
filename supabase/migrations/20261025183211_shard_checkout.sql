-- Disabled by default. No Stripe keys, products, or actual charges are created.
create table dy_private.payment_config(id boolean primary key default true check(id),mode text not null default 'off' check(mode in ('off','test','live')),test_players uuid[] not null default '{}');
insert into dy_private.payment_config default values;
create table dy_private.shard_packs(id text primary key,version integer not null default 1 check(version>0),title text not null,shards integer not null check(shards between 1 and 1000000),amount_cents integer not null check(amount_cents between 50 and 100000),currency text not null default 'usd' check(currency='usd'),enabled boolean not null default false,sort_order integer not null);
insert into dy_private.shard_packs(id,title,shards,amount_cents,sort_order) values('shards-100','100 Yeti Shards',100,99,1),('shards-550','550 Yeti Shards',550,499,2),('shards-1200','1,200 Yeti Shards',1200,999,3);
insert into dy_private.currencies(id,title,kind,game_id,source_platform,enabled) values('yeti-shards-web','Purchased Yeti Shards','purchased','yeti-account','web',true);
create table dy_private.checkout_orders(
 id uuid primary key default gen_random_uuid(),player_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 pack_id text not null references dy_private.shard_packs(id),pack_version integer not null,title text not null,shards integer not null,amount_cents integer not null,currency text not null,livemode boolean not null,
 status text not null default 'created' check(status in ('created','open','fulfilled','test_complete','review')),
 stripe_session text unique,payment_intent text unique,checkout_url text,amount_total integer,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(player_id,request_id)
);
create index checkout_orders_pack on dy_private.checkout_orders(pack_id);
create index checkout_orders_player_time on dy_private.checkout_orders(player_id,created_at desc);
create table dy_private.payment_reviews(event_id text primary key,order_id uuid not null references dy_private.checkout_orders(id) on delete cascade,kind text not null,created_at timestamptz not null default now());
create index payment_reviews_order on dy_private.payment_reviews(order_id);
create table dy_private.payment_holds(player_id uuid primary key references auth.users(id) on delete cascade,reason text not null,created_at timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['payment_config','shard_packs','checkout_orders','payment_reviews','payment_holds'] loop
 execute format('alter table dy_private.%I enable row level security',t);execute format('revoke all on dy_private.%I from public,anon,authenticated',t);
 end loop;end $$;
create trigger payment_catalog_revision after insert or update or delete on dy_private.shard_packs for each statement execute function dy_private.bump_revision();
create trigger payment_settings_revision after insert or update or delete on dy_private.payment_config for each statement execute function dy_private.bump_revision();
create trigger payment_order_revision after insert or update or delete on dy_private.checkout_orders for each row execute function dy_private.bump_account_version();

create function public.dy_payment_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');c dy_private.payment_config%rowtype;allowed boolean;begin
 select * into c from dy_private.payment_config where id;
 allowed:=(c.mode='test' and u=any(c.test_players)) or (c.mode='live' and coalesce((select (document->'features'->>'cash_purchases')::boolean from dy_private.account_config where id),false));
 return jsonb_build_object('schema_version',1,'mode',case when allowed then c.mode else 'preview' end,'available',allowed and not exists(select 1 from dy_private.payment_holds where player_id=u),
 'packs',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'title',p.title,'shards',p.shards::text,'amount_cents',p.amount_cents,'currency',p.currency,'available',allowed and p.enabled) order by p.sort_order),'[]') from dy_private.shard_packs p),
 'orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select id,title,shards::text,amount_cents,currency,livemode,status,created_at from dy_private.checkout_orders where player_id=u order by created_at desc limit 20)x));
end $$;
create function public.dy_checkout_prepare(p_pack text,p_version integer,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('economy');c dy_private.payment_config%rowtype;p dy_private.shard_packs%rowtype;o dy_private.checkout_orders%rowtype;begin
 if p_request is null then raise exception 'request_required';end if;
 if exists(select 1 from dy_private.payment_holds where player_id=u) then raise exception 'payment_review_required';end if;
 select * into c from dy_private.payment_config where id;
 if c.mode='off' or (c.mode='test' and not u=any(c.test_players)) or (c.mode='live' and not coalesce((select (document->'features'->>'cash_purchases')::boolean from dy_private.account_config where id),false)) then raise exception 'payments_not_ready';end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||u::text||':'||p_request::text,0));
 select * into o from dy_private.checkout_orders where player_id=u and request_id=p_request;
 if found then
 if o.pack_id!=p_pack or o.pack_version is distinct from p_version or o.livemode!=(c.mode='live') then raise exception 'request_reused';end if;
 if o.created_at<now()-interval '20 minutes' then raise exception 'checkout_expired_use_new_request';end if;
 return to_jsonb(o);end if;
 select * into p from dy_private.shard_packs where id=p_pack and enabled;
 if not found or p.version is distinct from p_version then raise exception 'pack_changed';end if;
 perform public.dy_rate('checkout',10);
 insert into dy_private.checkout_orders(player_id,request_id,pack_id,pack_version,title,shards,amount_cents,currency,livemode)
 values(u,p_request,p.id,p.version,p.title,p.shards,p.amount_cents,p.currency,c.mode='live') returning * into o;
 return to_jsonb(o);
end $$;
create function public.dy_checkout_bind(p_order uuid,p_session text,p_url text) returns void language plpgsql security definer set search_path='' as $$
declare o dy_private.checkout_orders%rowtype;begin
 if p_session !~ '^cs_(test_|live_)?[A-Za-z0-9]+$' or p_url !~ '^https://checkout[.]stripe[.]com/' then raise exception 'invalid_checkout';end if;
 select * into o from dy_private.checkout_orders where id=p_order for update;if not found then raise exception 'unknown_order';end if;
 if o.stripe_session is not null and o.stripe_session!=p_session then raise exception 'session_mismatch';end if;
 update dy_private.checkout_orders set stripe_session=p_session,checkout_url=p_url,status=case when status='created' then 'open' else status end,updated_at=now() where id=p_order;
end $$;
-- Called only after verifying Stripe's signature AND retrieving the paid session.
create function public.dy_checkout_fulfill(p_order uuid,p_session text,p_intent text,p_subtotal integer,p_total integer,p_currency text,p_live boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare o dy_private.checkout_orders%rowtype;begin
 select * into o from dy_private.checkout_orders where id=p_order for update;if not found then raise exception 'unknown_order';end if;
 if p_live is distinct from o.livemode or p_currency is distinct from o.currency or p_subtotal is distinct from o.amount_cents or p_total is null or p_total<p_subtotal or p_session is null or p_intent is null or p_intent !~ '^pi_[A-Za-z0-9]+$' then raise exception 'payment_mismatch';end if;
 if (o.stripe_session is not null and o.stripe_session!=p_session) or (o.payment_intent is not null and o.payment_intent!=p_intent) then raise exception 'session_mismatch';end if;
 if o.status='review' then return jsonb_build_object('status','review');end if;
 if o.status in ('fulfilled','test_complete') then return jsonb_build_object('status',o.status,'replayed',true);end if;
 update dy_private.checkout_orders set stripe_session=p_session,payment_intent=p_intent,amount_total=p_total where id=p_order;
 if o.livemode then
 perform public.dy_currency_event(o.player_id,'yeti-shards-web','stripe-checkout:'||p_session,o.shards,'purchase');
 end if;
 update dy_private.checkout_orders set status=case when o.livemode then 'fulfilled' else 'test_complete' end,updated_at=now() where id=p_order;
 return jsonb_build_object('status',case when o.livemode then 'fulfilled' else 'test_complete' end,'replayed',false);
end $$;
-- Refunds/disputes create an audited hold; money is never refunded by this RPC.
-- Staff reconciles consumed Shards before clearing the hold. No automatic debt.
create function public.dy_payment_review(p_order uuid,p_event text,p_intent text,p_live boolean,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare o dy_private.checkout_orders%rowtype;begin
 if p_kind not in ('refund','dispute') or p_event is null or p_event !~ '^evt_[A-Za-z0-9]+$' then raise exception 'invalid_review';end if;
 select * into o from dy_private.checkout_orders where id=p_order for update;if not found then raise exception 'unknown_order';end if;
 if o.livemode is distinct from p_live or (o.payment_intent is not null and o.payment_intent!=p_intent) then raise exception 'payment_mismatch';end if;
 insert into dy_private.payment_reviews(event_id,order_id,kind) values(p_event,p_order,p_kind) on conflict do nothing;
 update dy_private.checkout_orders set status='review',payment_intent=p_intent,updated_at=now() where id=p_order;
 if o.livemode then perform pg_advisory_xact_lock(hashtextextended('economy-player:'||o.player_id::text,0));insert into dy_private.payment_holds(player_id,reason) values(o.player_id,p_kind) on conflict(player_id) do update set reason=excluded.reason;end if;
end $$;
alter function public.dy_redeem_offer(text,integer,uuid) rename to dy_redeem_offer_before_payments;
create function public.dy_redeem_offer(p_offer text,p_version integer,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('economy');begin
 perform pg_advisory_xact_lock(hashtextextended('economy-player:'||u::text,0));
 if exists(select 1 from dy_private.payment_holds where player_id=u) then raise exception 'payment_review_required';end if;
 return public.dy_redeem_offer_before_payments(p_offer,p_version,p_request);
end $$;
alter function public.dy_export_account() rename to dy_export_account_before_payments;
create function public.dy_export_account() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_export');begin
 return public.dy_export_account_before_payments()||jsonb_build_object('purchases',(select coalesce(jsonb_agg(to_jsonb(o)-'checkout_url'),'[]') from dy_private.checkout_orders o where player_id=u));
end $$;
revoke all on function public.dy_payment_catalog(),public.dy_checkout_prepare(text,integer,uuid),public.dy_checkout_bind(uuid,text,text),public.dy_checkout_fulfill(uuid,text,text,integer,integer,text,boolean),public.dy_payment_review(uuid,text,text,boolean,text),public.dy_redeem_offer(text,integer,uuid),public.dy_redeem_offer_before_payments(text,integer,uuid),public.dy_export_account(),public.dy_export_account_before_payments() from public,anon,authenticated;
grant execute on function public.dy_payment_catalog(),public.dy_checkout_prepare(text,integer,uuid),public.dy_redeem_offer(text,integer,uuid),public.dy_export_account() to authenticated;
grant execute on function public.dy_checkout_bind(uuid,text,text),public.dy_checkout_fulfill(uuid,text,text,integer,integer,text,boolean),public.dy_payment_review(uuid,text,text,boolean,text) to service_role;
