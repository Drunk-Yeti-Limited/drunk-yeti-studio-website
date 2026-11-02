begin;
do $$
declare u uuid:=gen_random_uuid();req uuid:=gen_random_uuid();o jsonb;q jsonb;catalog jsonb;sid text:='cs_test_'||replace(gen_random_uuid()::text,'-','');pi text:='pi_'||replace(gen_random_uuid()::text,'-','');qty integer;at_time timestamptz;begin
 if dy_private.shard_sale_at('2026-11-27 12:00 America/Denver')->>'percent'<>'20' then raise exception 'black_friday';end if;
 if dy_private.shard_sale_at('2027-11-26 12:00 America/Denver')->>'percent'<>'20' then raise exception 'next_year_black_friday';end if;
 if dy_private.shard_sale_at('2026-11-20 00:00 America/Denver') is null or dy_private.shard_sale_at('2026-12-01 00:00 America/Denver') is not null then raise exception 'sale_boundaries';end if;
 if dy_private.shard_sale_at('2027-01-03 23:59 America/Denver') is null or dy_private.shard_sale_at('2027-01-04 00:00 America/Denver') is not null then raise exception 'winter_rollover';end if;
 if dy_private.shard_sale_at('2026-11-10 12:00 America/Denver') is not null then raise exception 'off_sale';end if;
 foreach qty in array array[100,101,549,550,551,1199,1200,1201,2499,2500,2501,5499,5500,5501,11999,12000,12001,24999,25000,25001,49999] loop
 foreach at_time in array array['2026-11-10 12:00Z'::timestamptz,'2026-11-27 12:00Z'::timestamptz] loop
 if (dy_private.shard_quote_at(qty+1,at_time)->>'amount_cents')::int<(dy_private.shard_quote_at(qty,at_time)->>'amount_cents')::int then raise exception 'price_cliff';end if;
 end loop;end loop;
 if dy_private.shard_quote_at(550,'2026-11-10 12:00Z')->>'amount_cents'<>'499' or dy_private.shard_quote_at(1200,'2026-11-10 12:00Z')->>'amount_cents'<>'999' or dy_private.shard_quote_at(50000,'2026-11-27 12:00Z')->>'amount_cents'<>'22000' then raise exception 'pack_price';end if;
 begin perform public.dy_shard_quote(99);raise exception 'accepted_invalid';exception when others then if sqlerrm<>'quantity_must_be_100_to_50000' then raise;end if;end;
 begin perform public.dy_shard_quote(50001);raise exception 'accepted_invalid';exception when others then if sqlerrm<>'quantity_must_be_100_to_50000' then raise;end if;end;
 insert into auth.users(id,aud,role,email) values(u,'authenticated','authenticated',u::text||'@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 update dy_private.payment_config set mode='test',test_players=array[u];update dy_private.shard_packs set enabled=true;
 catalog:=public.dy_payment_catalog();if jsonb_array_length(catalog->'packs')<>8 then raise exception 'missing_packs';end if;
 if public.dy_shard_sale() is not null then raise exception 'test_sale_advertised';end if;
 q:=public.dy_shard_quote(3721);
 o:=public.dy_checkout_prepare_v2('shards-custom',1,req,3721,(q->>'amount_cents')::int);
 if (o->>'shards')::int<>3721 or o->>'amount_cents'<>q->>'amount_cents' then raise exception 'quote_mismatch';end if;
 if public.dy_checkout_prepare_v2('shards-custom',1,req,3721,(q->>'amount_cents')::int)->>'id'<>o->>'id' then raise exception 'idempotency';end if;
 begin perform public.dy_checkout_prepare_v2('shards-custom',1,req,3722,(q->>'amount_cents')::int);raise exception 'accepted_reuse';exception when others then if sqlerrm<>'request_reused' then raise;end if;end;
 begin perform public.dy_checkout_prepare_v2('shards-custom',1,gen_random_uuid(),3721,50);raise exception 'accepted_tampering';exception when others then if sqlerrm<>'price_changed_refresh_quote' then raise;end if;end;
 begin perform public.dy_checkout_fulfill((o->>'id')::uuid,sid,pi,50,50,'usd',false);raise exception 'accepted_underpayment';exception when others then if sqlerrm<>'payment_mismatch' then raise;end if;end;
 perform public.dy_checkout_fulfill((o->>'id')::uuid,sid,pi,(q->>'amount_cents')::int,(q->>'amount_cents')::int,'usd',false);
 if public.dy_checkout_fulfill((o->>'id')::uuid,sid,pi,(q->>'amount_cents')::int,(q->>'amount_cents')::int,'usd',false)->>'replayed'<>'true' then raise exception 'duplicate_fulfillment';end if;
 if exists(select 1 from dy_private.balances where player_id=u and currency_id='yeti-shards-web') then raise exception 'test_credits';end if;
 if has_function_privilege('anon','public.dy_checkout_prepare_v2(text,integer,uuid,integer,integer)','execute') then raise exception 'anonymous_checkout';end if;
end $$;
rollback;
