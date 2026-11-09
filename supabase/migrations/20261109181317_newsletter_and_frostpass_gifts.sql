-- Timed promotional access shares the existing Frostpass access contract.
create table dy_private.frostpass_gifts (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references auth.users(id) on delete cascade,
 reference text not null unique check(length(reference) between 3 and 160),
 months integer not null check(months between 1 and 36),
 starts_at timestamptz not null, ends_at timestamptz not null,
 created_at timestamptz not null default now(), created_by text not null default current_user,
 revoked_at timestamptz, revoke_reason text,
 check(ends_at>starts_at)
);
create index frostpass_gifts_player on dy_private.frostpass_gifts(player_id,ends_at);
alter table dy_private.frostpass_gifts enable row level security;
revoke all on dy_private.frostpass_gifts from public,anon,authenticated;
create trigger frostpass_gift_revision after insert or update or delete on dy_private.frostpass_gifts for each row execute function dy_private.bump_account_version();

-- Admin SQL only; private schema is not a Data API endpoint. Reference is an idempotency key.
create function dy_private.grant_frostpass(p_email text,p_months integer,p_reference text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid; g dy_private.frostpass_gifts%rowtype; start_time timestamptz; begin
 if p_months is null or p_months not between 1 and 36 or p_reference is null or length(trim(p_reference)) not between 3 and 160 then raise exception 'invalid_gift';end if;
 select id into u from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if u is null then raise exception 'verified_account_not_found';end if;
 if exists(select 1 from public.dy_account_requests where player_id=u) then raise exception 'account_deletion_pending';end if;
 perform pg_advisory_xact_lock(hashtextextended('frostpass-gift:'||u::text,0));
 select * into g from dy_private.frostpass_gifts where reference=trim(p_reference);
 if found then
  if g.player_id<>u or g.months<>p_months then raise exception 'gift_reference_conflict';end if;
  return jsonb_build_object('id',g.id,'starts_at',g.starts_at,'ends_at',g.ends_at,'replayed',true,'revoked',g.revoked_at is not null);
 end if;
 -- Queue behind existing gifts and already-paid time; never change Stripe billing.
 select greatest(now(),coalesce((select max(ends_at) from dy_private.frostpass_gifts where player_id=u and revoked_at is null and ends_at>now()),now()),coalesce((select max(period_end) from dy_private.subscriptions where player_id=u and livemode and paid and status='active' and period_end>now()),now())) into start_time;
 insert into dy_private.frostpass_gifts(player_id,reference,months,starts_at,ends_at)
 values(u,trim(p_reference),p_months,start_time,start_time+make_interval(months=>p_months)) returning * into g;
 return jsonb_build_object('id',g.id,'starts_at',g.starts_at,'ends_at',g.ends_at,'replayed',false);
end $$;
create function dy_private.revoke_frostpass(p_reference text,p_reason text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required';end if;
 update dy_private.frostpass_gifts set revoked_at=now(),revoke_reason=left(p_reason,500) where reference=p_reference and revoked_at is null;
 return found;
end $$;
revoke all on function dy_private.grant_frostpass(text,integer,text),dy_private.revoke_frostpass(text,text) from public,anon,authenticated;

create or replace function public.dy_subscription_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');s dy_private.subscriptions%rowtype;g dy_private.frostpass_gifts%rowtype;
 billing_ok boolean;gift_ok boolean;held boolean;expiry timestamptz;begin
 select * into s from dy_private.subscriptions where player_id=u order by livemode desc,(status='active' and paid and period_end>now()) desc,verified_at desc limit 1;
 select * into g from dy_private.frostpass_gifts where player_id=u and revoked_at is null and ends_at>now() order by (starts_at<=now()) desc,starts_at asc limit 1;
 held:=exists(select 1 from dy_private.payment_holds where player_id=u);
 billing_ok:=coalesce(s.livemode and s.status='active' and s.paid and s.period_end>now() and s.verified_at>now()-interval '15 minutes',false) and not held;
 gift_ok:=coalesce(g.starts_at<=now() and g.ends_at>now(),false) and not held;
 expiry:=greatest(case when billing_ok then least(s.period_end,s.verified_at+interval '15 minutes') else now() end,case when gift_ok then least(g.ends_at,now()+interval '15 minutes') else now() end);
 return jsonb_build_object('schema_version',1,'active',billing_ok or gift_ok,'status',case when gift_ok and not billing_ok then 'active' else coalesce(s.status,'none') end,
 'paid',coalesce(s.paid,false),'test',coalesce(not s.livemode,false) and not gift_ok,
 'source',case when billing_ok and gift_ok then 'subscription_and_gift' when billing_ok then 'subscription' when gift_ok then 'gift' else 'none' end,
 'period_end',case when gift_ok and not billing_ok then g.ends_at else s.period_end end,
 'cancel_at_period_end',case when gift_ok and not billing_ok then true else coalesce(s.cancel_at_period_end,false) end,
 'gift_starts_at',g.starts_at,'gift_ends_at',g.ends_at,'gift_active',gift_ok,
 'verified_at',case when gift_ok then now() else s.verified_at end,'valid_until',expiry,'refresh_after_seconds',300,'can_manage',s.stripe_id is not null);
end $$;
revoke all on function public.dy_subscription_status() from public,anon;
grant execute on function public.dy_subscription_status() to authenticated;

-- Email lives in auth.users. Newsletter enrollment is separate and never inferred from registration.
create table dy_private.newsletter_preferences (
 player_id uuid primary key references auth.users(id) on delete cascade,
 subscribed boolean not null default false, consent_email text not null,
 consent_version text not null default 'monthly-studio-news-v1',
 subscribed_at timestamptz,unsubscribed_at timestamptz,updated_at timestamptz not null default now()
);
alter table dy_private.newsletter_preferences enable row level security;
revoke all on dy_private.newsletter_preferences from public,anon,authenticated;
create function public.dy_newsletter_preference() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('profile');e text;confirmed boolean;p dy_private.newsletter_preferences%rowtype;begin
 select lower(email),email_confirmed_at is not null into e,confirmed from auth.users where id=u;
 select * into p from dy_private.newsletter_preferences where player_id=u;
 return jsonb_build_object('subscribed',coalesce(p.subscribed and p.consent_email=e and confirmed,false),'email',e,'email_confirmed',confirmed,'frequency','monthly');
end $$;
create function public.dy_newsletter_set(p_subscribed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('profile');e text;confirmed boolean;begin
 if auth.jwt()->>'client_id' is not null then raise exception 'account_website_required';end if;
 if p_subscribed is null then raise exception 'preference_required';end if;
 select lower(email),email_confirmed_at is not null into e,confirmed from auth.users where id=u;
 if coalesce(e,'')='' or (p_subscribed and not confirmed) then raise exception 'confirmed_email_required';end if;
 insert into dy_private.newsletter_preferences(player_id,subscribed,consent_email,subscribed_at,unsubscribed_at)
 values(u,p_subscribed,e,case when p_subscribed then now() end,case when not p_subscribed then now() end)
 on conflict(player_id) do update set subscribed=excluded.subscribed,consent_email=excluded.consent_email,
 subscribed_at=case when excluded.subscribed then now() else dy_private.newsletter_preferences.subscribed_at end,
 unsubscribed_at=case when not excluded.subscribed then now() else dy_private.newsletter_preferences.unsubscribed_at end,updated_at=now();
 return public.dy_newsletter_preference();
end $$;
revoke all on function public.dy_newsletter_preference(),public.dy_newsletter_set(boolean) from public,anon;
grant execute on function public.dy_newsletter_preference(),public.dy_newsletter_set(boolean) to authenticated;

-- Run only as an administrator for a campaign audience; read fresh at send time.
create function dy_private.newsletter_audience() returns table(player_id uuid,email text,consented_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select u.id,u.email,p.subscribed_at from dy_private.newsletter_preferences p join auth.users u on u.id=p.player_id
 where p.subscribed and p.consent_email=lower(u.email) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and not exists(select 1 from public.dy_account_requests r where r.player_id=u.id)
$$;
revoke all on function dy_private.newsletter_audience() from public,anon,authenticated;
