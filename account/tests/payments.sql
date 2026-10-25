begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();req uuid:=gen_random_uuid();o jsonb;live_order jsonb;r jsonb;sid text:='cs_test_'||replace(gen_random_uuid()::text,'-','');pi text:='pi_'||replace(gen_random_uuid()::text,'-','');begin
 insert into auth.users(id,aud,role,email) values(u,'authenticated','authenticated',u::text||'@example.invalid'),(v,'authenticated','authenticated',v::text||'@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 if public.dy_payment_catalog()->>'available'!='false' then raise exception 'live_by_default';end if;
 begin perform public.dy_checkout_prepare('shards-100',1,req);raise exception 'disabled_checkout';exception when others then if sqlerrm!='payments_not_ready' then raise;end if;end;
 if has_function_privilege('authenticated','public.dy_checkout_fulfill(uuid,text,text,integer,integer,text,boolean)','execute') or has_function_privilege('anon','public.dy_checkout_prepare(text,integer,uuid)','execute') then raise exception 'privilege_leak';end if;
 update dy_private.payment_config set mode='test',test_players=array[u];update dy_private.shard_packs set enabled=true;
 o:=public.dy_checkout_prepare('shards-100',1,req);
 if o->>'id'!=public.dy_checkout_prepare('shards-100',1,req)->>'id' then raise exception 'duplicate_order';end if;
 begin perform public.dy_checkout_prepare('shards-550',1,req);raise exception 'request_reuse';exception when others then if sqlerrm!='request_reused' then raise;end if;end;
 begin perform public.dy_checkout_fulfill((o->>'id')::uuid,sid,pi,1,1,'usd',false);raise exception 'underpayment';exception when others then if sqlerrm!='payment_mismatch' then raise;end if;end;
 r:=public.dy_checkout_fulfill((o->>'id')::uuid,sid,pi,99,99,'usd',false);
 if r->>'status'!='test_complete' or exists(select 1 from dy_private.balances where player_id=u and currency_id='yeti-shards-web') then raise exception 'test_credited_real_currency';end if;
 if public.dy_checkout_fulfill((o->>'id')::uuid,sid,pi,99,99,'usd',false)->>'replayed'!='true' then raise exception 'test_replay_failed';end if;
 -- Exercise the live transaction entirely inside this rolled-back fixture.
 update dy_private.payment_config set mode='live';update dy_private.account_config set document=jsonb_set(document,'{features,cash_purchases}','true');
 live_order:=public.dy_checkout_prepare('shards-100',1,gen_random_uuid());sid:='cs_live_'||replace(gen_random_uuid()::text,'-','');pi:='pi_'||replace(gen_random_uuid()::text,'-','');
 perform public.dy_checkout_fulfill((live_order->>'id')::uuid,sid,pi,99,110,'usd',true);
 perform public.dy_checkout_fulfill((live_order->>'id')::uuid,sid,pi,99,110,'usd',true);
 if (select balance from dy_private.balances where player_id=u and currency_id='yeti-shards-web')!=100 then raise exception 'double_credit';end if;
 perform public.dy_payment_review((live_order->>'id')::uuid,'evt_testreview',pi,true,'refund');
 begin perform public.dy_redeem_offer('anything',1,gen_random_uuid());raise exception 'hold_bypassed';exception when others then if sqlerrm!='payment_review_required' then raise;end if;end;
 r:=public.dy_checkout_fulfill((live_order->>'id')::uuid,sid,pi,99,110,'usd',true);if r->>'status'!='review' then raise exception 'refunded_order_recredited';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 if jsonb_array_length(public.dy_payment_catalog()->'orders')!=0 then raise exception 'history_leak';end if;
 update dy_private.payment_config set mode='test';
 begin perform public.dy_checkout_prepare('shards-100',1,gen_random_uuid());raise exception 'test_allowlist_bypass';exception when others then if sqlerrm!='payments_not_ready' then raise;end if;end;
end $$;
rollback;
