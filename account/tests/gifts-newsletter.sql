-- Administrator integration test; fixtures and entitlement changes are rolled back.
begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();e text;g jsonb;r jsonb;t timestamptz;request_id uuid:=gen_random_uuid();product text:='qa-gift-'||substr(gen_random_uuid()::text,1,8);begin
 e:=u::text||'@example.invalid';
 insert into auth.users(id,aud,role,email,email_confirmed_at,is_anonymous) values(u,'authenticated','authenticated',e,now(),false),(v,'authenticated','authenticated',v::text||'@example.invalid',now(),false);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 if has_function_privilege('authenticated','dy_private.grant_frostpass(text,integer,text)','execute') or has_function_privilege('anon','public.dy_newsletter_set(boolean)','execute') or has_table_privilege('authenticated','dy_private.newsletter_preferences','select') then raise exception 'privilege_leak';end if;
 if (public.dy_subscription_status()->>'active')::boolean then raise exception 'default_active';end if;
 g:=dy_private.grant_frostpass(e,3,'qa:'||u);
 t:=(g->>'ends_at')::timestamptz;
 if t<>(g->>'starts_at')::timestamptz+interval '3 months' then raise exception 'calendar_duration';end if;
 r:=dy_private.grant_frostpass(e,3,'qa:'||u);if r->>'id'<>g->>'id' or r->>'replayed'<>'true' then raise exception 'idempotency_failed';end if;
 r:=dy_private.grant_frostpass(e,12,'qa2:'||u);if (r->>'starts_at')::timestamptz<>t then raise exception 'gift_not_stacked';end if;
 insert into dy_private.access_products(id,title,kind,included,ready) values(product,'QA Gift','game',true,true);
 if not (public.dy_app_access(product)->>'full_access')::boolean or public.dy_subscription_status()->>'source'<>'gift' then raise exception 'existing_access_contract_failed';end if;
 if (public.dy_app_access(product)->>'valid_until')::timestamptz>now()+interval '15 minutes' then raise exception 'cache_unbounded';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 if (public.dy_subscription_status()->>'active')::boolean then raise exception 'gift_cross_account';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform dy_private.revoke_frostpass('qa:'||u,'QA rollback');
 if (public.dy_subscription_status()->>'active')::boolean then raise exception 'future_gift_active';end if;
 update dy_private.frostpass_gifts set starts_at=now()-interval '4 months',ends_at=now() where player_id=u and revoked_at is null;
 if (public.dy_subscription_status()->>'active')::boolean then raise exception 'expired_gift_active';end if;
 insert into dy_private.subscription_requests(id,player_id,stripe_price,livemode) values(request_id,u,'price_qa',true);
 insert into dy_private.subscriptions(stripe_id,player_id,request_id,customer_id,price_id,livemode,status,paid,period_end,verified_at,fetched_at)
 values('qa:'||u,u,request_id,'cus_qa','price_qa',true,'active',true,now()+interval '7 days',now(),now());
 if not (public.dy_subscription_status()->>'active')::boolean or public.dy_subscription_status()->>'source'<>'subscription' then raise exception 'paid_access_changed';end if;
 r:=dy_private.grant_frostpass(e,12,'qa3:'||u);
 if (r->>'starts_at')::timestamptz<>now()+interval '7 days' then raise exception 'paid_time_not_preserved';end if;
 insert into dy_private.payment_holds(player_id,reason) values(u,'QA');
 if (public.dy_subscription_status()->>'active')::boolean then raise exception 'hold_bypassed';end if;
 delete from dy_private.payment_holds where player_id=u;

 if (public.dy_newsletter_preference()->>'subscribed')::boolean then raise exception 'default_marketing_optin';end if;
 perform public.dy_newsletter_set(true);
 if not exists(select 1 from dy_private.newsletter_audience() where player_id=u and email=e) then raise exception 'optin_missing';end if;
 update auth.users set email='changed-'||e where id=u;
 if exists(select 1 from dy_private.newsletter_audience() where player_id=u) then raise exception 'email_change_without_consent';end if;
 perform public.dy_newsletter_set(true);perform public.dy_newsletter_set(false);
 if exists(select 1 from dy_private.newsletter_audience() where player_id=u) then raise exception 'unsubscribe_failed';end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.dy_newsletter_preference();raise exception 'anonymous_read_allowed';exception when others then if sqlerrm<>'authentication_required' then raise;end if;end;
end $$;
rollback;
