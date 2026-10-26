-- Yeti Frostpass: sale remains disabled until price, portal and webhook setup is complete.
create table dy_private.subscription_config (
 id boolean primary key default true check(id), title text not null default 'Yeti Frostpass',
 mode text not null default 'off' check(mode in ('off','test','live')),
 stripe_price text, amount_cents integer not null default 999 check(amount_cents>0), currency text not null default 'usd',
 monthly_shards integer not null default 1000 check(monthly_shards>0),
 billing_interval text not null default 'month' check(billing_interval='month'), portal_configuration text,
 checkout_enabled boolean not null default false, webhooks_ready boolean not null default false
);
insert into dy_private.subscription_config default values;
create table dy_private.access_products (
 id text primary key check(id ~ '^[a-z0-9-]{1,64}$'),title text not null,
 kind text not null check(kind in ('maker','game','app')),included boolean not null default true,
 ready boolean not null default false
);
insert into dy_private.access_products(id,title,kind) values
 ('platform-maker','Platform Maker','maker'),('top-down-maker','Top-Down Maker','maker'),
 ('fighter-maker','Fighter Maker','maker'),('party-maker','Party Maker','maker'),
 ('rpg-maker','RPG Maker','maker'),('sports-maker','Sports Maker','maker'),
 ('house-of-wilds','House of Wilds','game'),('sixfold','Sixfold','game'),('schmuck','Schmuck','game'),
 ('yeti-brawl','Yeti Brawl','game'),('cross-world-overdrive','Cross World Overdrive','game');
create table dy_private.subscription_requests (
 id uuid primary key default gen_random_uuid(),player_id uuid not null references auth.users(id) on delete cascade,
 stripe_price text not null,livemode boolean not null,session_id text unique,
 amount_cents integer not null default 999,currency text not null default 'usd',monthly_shards integer not null default 1000,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '1 hour'
);
create index subscription_requests_player on dy_private.subscription_requests(player_id,created_at desc);
create table dy_private.subscriptions (
 stripe_id text primary key,player_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null unique references dy_private.subscription_requests(id),customer_id text not null,
 price_id text not null,livemode boolean not null,status text not null,
 paid boolean not null default false,period_end timestamptz,cancel_at_period_end boolean not null default false,
 verified_at timestamptz not null,fetched_at timestamptz not null,
 check(status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'))
);
create index subscriptions_player on dy_private.subscriptions(player_id);
create index subscriptions_customer on dy_private.subscriptions(customer_id);
do $$ declare t text;begin foreach t in array array['subscription_config','access_products','subscription_requests','subscriptions'] loop
 execute format('alter table dy_private.%I enable row level security',t);
 execute format('revoke all on dy_private.%I from public,anon,authenticated',t);
 end loop;end $$;
create trigger subscription_config_revision after insert or update or delete on dy_private.subscription_config for each statement execute function dy_private.bump_revision();
create trigger access_catalog_revision after insert or update or delete on dy_private.access_products for each statement execute function dy_private.bump_revision();
create trigger subscription_account_revision after insert or update or delete on dy_private.subscriptions for each row execute function dy_private.bump_account_version();

create function public.dy_subscription_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');c dy_private.subscription_config%rowtype;begin
 select * into c from dy_private.subscription_config where id;
 return jsonb_build_object('schema_version',1,'title',c.title,'mode',c.mode,'amount_cents',c.amount_cents,'currency',c.currency,'interval',c.billing_interval,'monthly_shards',c.monthly_shards,
 'available',c.checkout_enabled and c.webhooks_ready and c.mode in ('test','live') and c.stripe_price is not null and c.portal_configuration is not null and c.amount_cents is not null and c.billing_interval is not null and exists(select 1 from dy_private.access_products where included and ready),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'kind',kind,'ready',ready) order by kind,title),'[]') from dy_private.access_products where included));
end $$;
create function public.dy_subscription_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');s dy_private.subscriptions%rowtype;ok boolean;begin
 select * into s from dy_private.subscriptions where player_id=u order by livemode desc,(status='active' and paid and period_end>now()) desc,verified_at desc limit 1;
 ok:=coalesce(s.livemode and s.status='active' and s.paid and s.period_end>now() and s.verified_at>now()-interval '15 minutes',false)
 and not exists(select 1 from dy_private.payment_holds where player_id=u);
 return jsonb_build_object('schema_version',1,'active',ok,'status',coalesce(s.status,'none'),'paid',coalesce(s.paid,false),'test',coalesce(not s.livemode,false),
 'period_end',s.period_end,'cancel_at_period_end',coalesce(s.cancel_at_period_end,false),'verified_at',s.verified_at,
 'valid_until',case when ok then least(s.period_end,s.verified_at+interval '15 minutes') else now() end,'refresh_after_seconds',300,'can_manage',s.stripe_id is not null);
end $$;
create function public.dy_app_access(p_product text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read',p_product);p dy_private.access_products%rowtype;s jsonb;permanent boolean;full_access boolean;begin
 select * into p from dy_private.access_products where id=p_product;
 if not found then return jsonb_build_object('schema_version',1,'product_id',p_product,'full_access',false,'reason','unknown_product','valid_until',now(),'refresh_after_seconds',300);end if;
 s:=public.dy_subscription_status();
 permanent:=dy_private.owns_item(u,'yeti-account','full-access:'||p.id);
 full_access:=p.ready and (permanent or (p.included and (s->>'active')::boolean));
 return jsonb_build_object('schema_version',1,'product_id',p.id,'full_access',full_access,
 'reason',case when not p.ready then 'integration_pending' when permanent then 'permanent_purchase' when full_access then 'subscription' else 'subscription_inactive' end,
 'valid_until',case when full_access and permanent then now()+interval '15 minutes' when full_access then (s->>'valid_until')::timestamptz else now() end,'refresh_after_seconds',300);
end $$;
create function public.dy_subscription_prepare() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('economy');c dy_private.subscription_config%rowtype;r dy_private.subscription_requests%rowtype;begin
 perform pg_advisory_xact_lock(hashtextextended('subscription-player:'||u::text,0));
 if exists(select 1 from dy_private.payment_holds where player_id=u) then raise exception 'payment_review_required';end if;
 if not (public.dy_subscription_catalog()->>'available')::boolean then raise exception 'subscriptions_not_ready';end if;
 select * into c from dy_private.subscription_config where id;
 if exists(select 1 from dy_private.subscriptions where player_id=u and livemode=(c.mode='live') and status not in ('canceled','incomplete_expired')) then raise exception 'manage_existing_subscription';end if;
 perform public.dy_rate('subscribe',10);
 select * into r from dy_private.subscription_requests q where player_id=u and livemode=(c.mode='live') and expires_at>now() and not exists(select 1 from dy_private.subscriptions s where s.request_id=q.id) order by created_at desc limit 1;
 if not found then insert into dy_private.subscription_requests(player_id,stripe_price,livemode,amount_cents,currency,monthly_shards) values(u,c.stripe_price,c.mode='live',c.amount_cents,c.currency,c.monthly_shards) returning * into r;end if;
 if r.stripe_price!=c.stripe_price then raise exception 'checkout_configuration_changed';end if;
 return to_jsonb(r)||jsonb_build_object('amount_cents',c.amount_cents,'currency',c.currency,'interval',c.billing_interval);
end $$;
create function public.dy_subscription_bind(p_request uuid,p_session text) returns void language plpgsql security definer set search_path='' as $$
begin
 update dy_private.subscription_requests set session_id=p_session where id=p_request and (session_id is null or session_id=p_session);
 if not found then raise exception 'subscription_session_conflict';end if;
end $$;
-- A paid invoice and billing period can each grant the benefit at most once.
create table dy_private.subscription_benefits (
 invoice_id text primary key,subscription_id text not null references dy_private.subscriptions(stripe_id),
 player_id uuid not null references auth.users(id) on delete cascade,
 period_start timestamptz not null,period_end timestamptz not null,shards integer not null,
 livemode boolean not null,created_at timestamptz not null default now(),
 unique(subscription_id,period_start),check(period_end>period_start)
);
create index subscription_benefits_player on dy_private.subscription_benefits(player_id,created_at desc);
alter table dy_private.subscription_benefits enable row level security;
revoke all on dy_private.subscription_benefits from public,anon,authenticated;

create function public.dy_subscription_sync_context(p_player uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('subscriptions',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from dy_private.subscriptions s where player_id=p_player),
 'pending',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from dy_private.subscription_requests r where player_id=p_player and session_id is not null and not exists(select 1 from dy_private.subscriptions s where s.request_id=r.id)),
 'benefit_invoices',(select coalesce(jsonb_agg(invoice_id),'[]') from dy_private.subscription_benefits where player_id=p_player),
 'portal_configuration',(select portal_configuration from dy_private.subscription_config where id));
$$;
create function public.dy_subscription_sync(p_request uuid,p_subscription text,p_customer text,p_price text,p_live boolean,p_status text,p_paid boolean,p_end timestamptz,p_cancel boolean,p_fetched timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare r dy_private.subscription_requests%rowtype;begin
 select * into r from dy_private.subscription_requests where id=p_request for update;
 if p_fetched is null or p_status is null or p_subscription is null or p_customer is null then raise exception 'subscription_verification_mismatch';end if;
 if not found or r.stripe_price is distinct from p_price or r.livemode is distinct from p_live or p_fetched>now()+interval '1 minute' or p_fetched<now()-interval '10 minutes' then raise exception 'subscription_verification_mismatch';end if;
 if p_subscription not like 'sub_%' or p_customer not like 'cus_%' then raise exception 'invalid_subscription';end if;
 if exists(select 1 from dy_private.subscriptions where stripe_id=p_subscription and (request_id!=r.id or customer_id!=p_customer)) then raise exception 'subscription_owner_mismatch';end if;
 insert into dy_private.subscriptions(stripe_id,player_id,request_id,customer_id,price_id,livemode,status,paid,period_end,cancel_at_period_end,verified_at,fetched_at)
 values(p_subscription,r.player_id,r.id,p_customer,p_price,p_live,p_status,p_paid,p_end,p_cancel,now(),p_fetched)
 on conflict(stripe_id) do update set status=excluded.status,paid=excluded.paid,period_end=excluded.period_end,cancel_at_period_end=excluded.cancel_at_period_end,verified_at=now(),fetched_at=excluded.fetched_at
 where dy_private.subscriptions.request_id=excluded.request_id and dy_private.subscriptions.customer_id=excluded.customer_id and dy_private.subscriptions.fetched_at<=excluded.fetched_at;
end $$;
revoke all on function public.dy_subscription_catalog(),public.dy_subscription_status(),public.dy_app_access(text),public.dy_subscription_prepare(),public.dy_subscription_bind(uuid,text),public.dy_subscription_sync_context(uuid),public.dy_subscription_sync(uuid,text,text,text,boolean,text,boolean,timestamptz,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.dy_subscription_catalog(),public.dy_subscription_status(),public.dy_app_access(text),public.dy_subscription_prepare() to authenticated;
grant execute on function public.dy_subscription_bind(uuid,text),public.dy_subscription_sync_context(uuid),public.dy_subscription_sync(uuid,text,text,text,boolean,text,boolean,timestamptz,boolean,timestamptz) to service_role;
update dy_private.account_config set document=jsonb_set(document,'{subscription}', '{"id":"yeti-frostpass","title":"Yeti Frostpass","status":"preparing","refresh_after_seconds":300,"access_contract":1}'::jsonb) where id;

create function public.dy_subscription_benefit(p_subscription text,p_invoice text,p_customer text,p_price text,p_live boolean,p_paid boolean,p_amount integer,p_currency text,p_reason text,p_start timestamptz,p_end timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s dy_private.subscriptions%rowtype;r dy_private.subscription_requests%rowtype;b dy_private.subscription_benefits%rowtype;begin
 select * into s from dy_private.subscriptions where stripe_id=p_subscription;
 if not found then raise exception 'subscription_missing';end if;
 select * into r from dy_private.subscription_requests where id=s.request_id;
 if p_paid is distinct from true or p_live is distinct from s.livemode or p_customer is distinct from s.customer_id or p_price is distinct from r.stripe_price or p_amount is null or p_amount<r.amount_cents or p_currency is distinct from r.currency
 or p_reason is null or p_reason not in ('subscription_create','subscription_cycle') or p_invoice is null or p_invoice not like 'in_%'
 or p_start is null or p_end is null or p_end<=p_start or p_end-p_start<interval '27 days' or p_end-p_start>interval '32 days' then raise exception 'invalid_subscription_invoice';end if;
 perform pg_advisory_xact_lock(hashtextextended('economy-player:'||s.player_id::text,0));
 select * into b from dy_private.subscription_benefits where invoice_id=p_invoice;
 if found then
 if b.subscription_id!=p_subscription or b.period_start!=p_start or b.period_end!=p_end then raise exception 'invoice_reused';end if;
 return jsonb_build_object('replayed',true,'shards',b.shards,'test',not b.livemode);end if;
 if exists(select 1 from dy_private.subscription_benefits where subscription_id=p_subscription and period_start=p_start) then return jsonb_build_object('replayed',true,'period_already_granted',true);end if;
 if exists(select 1 from dy_private.payment_holds where player_id=s.player_id) then raise exception 'payment_review_required';end if;
 if s.livemode then perform public.dy_currency_event(s.player_id,'yeti-shards-web','frostpass-invoice:'||p_invoice,r.monthly_shards,'purchase');end if;
 insert into dy_private.subscription_benefits(invoice_id,subscription_id,player_id,period_start,period_end,shards,livemode) values(p_invoice,p_subscription,s.player_id,p_start,p_end,r.monthly_shards,s.livemode);
 return jsonb_build_object('replayed',false,'shards',case when s.livemode then r.monthly_shards else 0 end,'test',not s.livemode);
end $$;
create function public.dy_subscription_hold(p_customer text,p_live boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 if p_live is distinct from true then return;end if;
 for u in select distinct player_id from dy_private.subscriptions where customer_id=p_customer and livemode=p_live loop
 perform pg_advisory_xact_lock(hashtextextended('economy-player:'||u::text,0));
 insert into dy_private.payment_holds(player_id,reason) values(u,'frostpass:'||p_reason) on conflict(player_id) do update set reason=excluded.reason;
 end loop;
end $$;
revoke all on function public.dy_subscription_benefit(text,text,text,text,boolean,boolean,integer,text,text,timestamptz,timestamptz),public.dy_subscription_hold(text,boolean,text) from public,anon,authenticated;
grant execute on function public.dy_subscription_benefit(text,text,text,text,boolean,boolean,integer,text,text,timestamptz,timestamptz),public.dy_subscription_hold(text,boolean,text) to service_role;

-- Account export includes membership and grant receipts, never hosted session URLs.
alter function public.dy_export_account() rename to dy_export_account_before_frostpass;
create function public.dy_export_account() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_export');begin
 return public.dy_export_account_before_frostpass()||jsonb_build_object(
 'subscriptions',(select coalesce(jsonb_agg(to_jsonb(s)-'customer_id'),'[]') from dy_private.subscriptions s where player_id=u),
 'subscription_benefits',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from dy_private.subscription_benefits b where player_id=u));
end $$;
revoke all on function public.dy_export_account(),public.dy_export_account_before_frostpass() from public,anon,authenticated;
grant execute on function public.dy_export_account() to authenticated;
