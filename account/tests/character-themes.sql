-- Run after character_themes migration, within a transaction; always roll back.
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();r jsonb;q uuid:=gen_random_uuid();before_rev text;
begin
 insert into auth.users(id,aud,role,email) values(u,'authenticated','authenticated',u::text||'@example.invalid'),(v,'authenticated','authenticated',v::text||'@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 begin perform public.dy_profile_set_with_avatar('t_'||substr(u::text,1,8),'Test','dark-yeti');raise exception 'locked_allowed';exception when others then if sqlerrm!='avatar_not_available' then raise;end if;end;
 begin perform public.dy_redeem_offer('dark-yeti-web',1,q);raise exception 'unfunded_allowed';exception when others then if sqlerrm!='insufficient_or_invalid_balance' then raise;end if;end;
 if exists(select 1 from public.dy_entitlements where player_id=u) then raise exception 'failed_purchase_granted';end if;
 perform public.dy_currency_event(u,'yeti-shards-web','theme-test:'||u,100,'purchase');
 before_rev:=public.dy_account_revision()->>'data_revision';
 r:=public.dy_redeem_offer('dark-yeti-web',1,q);
 if r->>'balance'!='0' or not dy_private.owns_item(u,'yeti-account','avatar:dark-yeti') then raise exception 'purchase_failed';end if;
 if public.dy_account_revision()->>'data_revision'=before_rev then raise exception 'revision_failed';end if;
 if public.dy_redeem_offer('dark-yeti-web',1,q)->>'replayed'!='true' then raise exception 'retry_failed';end if;
 begin perform public.dy_redeem_offer('dark-yeti-earned',1,gen_random_uuid());raise exception 'duplicate_allowed';exception when others then if sqlerrm!='already_owned' then raise;end if;end;
 perform public.dy_profile_set_with_avatar('t_'||substr(u::text,1,8),'Test','dark-yeti');
 perform public.dy_currency_event(u,'yeti-shards','theme-earned:'||u,100,'earned');
 perform public.dy_redeem_offer('blush-yeti-earned',1,gen_random_uuid());
 perform public.dy_profile_set_with_avatar('t_'||substr(u::text,1,8),'Test','blush-yeti');
 if (select count(*) from public.dy_entitlements where player_id=u)!=2 then raise exception 'entitlements_failed';end if;
 if (select count(*) from dy_private.orders where player_id=u)!=2 then raise exception 'duplicate_order';end if;
 if (select count(*) from dy_private.ledger where player_id=u and reason='redemption')!=2 then raise exception 'duplicate_debit';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 if jsonb_array_length(public.dy_account_snapshot()->'unlocks')!=0 then raise exception 'cross_user_leak';end if;
 begin perform public.dy_profile_set_with_avatar('t_'||substr(v::text,1,8),'Other','blush-yeti');raise exception 'other_user_allowed';exception when others then if sqlerrm!='avatar_not_available' then raise;end if;end;
 if (select count(*) from dy_private.avatar_catalog where free and enabled)!=7 then raise exception 'starter_avatars_changed';end if;
 if jsonb_array_length(public.dy_account_manifest()->'character_themes')!=2 then raise exception 'manifest_missing';end if;
end $$;
