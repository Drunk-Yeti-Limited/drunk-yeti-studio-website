begin;
do $$
declare owner uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();r jsonb;j jsonb;begin
 insert into auth.users(id,email,email_confirmed_at,is_anonymous,created_at) values(owner,owner||'@example.invalid',now(),false,now()),(a,a||'@example.invalid',now(),false,now()),(b,b||'@example.invalid',now(),false,now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 begin perform public.dy_newsletter_admin();raise exception 'nonadmin_allowed';exception when others then if sqlerrm<>'studio_admin_required' then raise;end if;end;
 insert into dy_private.newsletter_admins values(owner);
 perform public.dy_newsletter_admin('save',jsonb_build_object('id',c,'subject','QA','body','QA only'));
 begin perform public.dy_newsletter_admin('queue',jsonb_build_object('id',c));raise exception 'disabled_queue_allowed';exception when others then if sqlerrm<>'sender_setup_required' then raise;end if;end;
 update dy_private.newsletter_delivery_config set enabled=true,folder_id=1,postal_address='QA',daily_limit=1;
 begin perform public.dy_newsletter_admin('queue',jsonb_build_object('id',c));raise exception 'default_enrollment_sent';exception when others then if sqlerrm<>'no_confirmed_subscribers' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);perform public.dy_newsletter_set(true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);perform public.dy_newsletter_set(true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 perform public.dy_newsletter_admin('queue',jsonb_build_object('id',c));perform public.dy_newsletter_admin('queue',jsonb_build_object('id',c));
 if (select count(*) from dy_private.newsletter_recipients where campaign_id=c)<>2 then raise exception 'queue_dedup_failed';end if;
 r:=public.dy_newsletter_worker('claim');j:=r->'job';
 if jsonb_array_length(r->'emails')<>1 then raise exception 'daily_budget_ignored';end if;
 if public.dy_newsletter_worker('claim')->>'waiting'<>'true' then raise exception 'concurrent_claim_allowed';end if;
 perform public.dy_newsletter_worker('dispatch',jsonb_build_object('id',j->>'id','lease',j->>'lease','provider_id',123,'emails',r->'emails'));
 perform public.dy_newsletter_worker('submitted',j);
 if public.dy_newsletter_worker('claim')->>'daily_limit'<>'true' then raise exception 'budget_exceeded';end if;
 update dy_private.newsletter_jobs set reserved_at=now()-interval '26 hours' where id=(j->>'id')::uuid;
 r:=public.dy_newsletter_worker('claim');j:=r->'job';
 update dy_private.newsletter_preferences set subscribed=false where consent_email=r->'emails'->>0;
 begin perform public.dy_newsletter_worker('dispatch',jsonb_build_object('id',j->>'id','lease',j->>'lease','provider_id',124,'emails',r->'emails'));raise exception 'unsubscribe_ignored';exception when others then if sqlerrm<>'audience_changed' then raise;end if;end;
 if has_function_privilege('authenticated','public.dy_newsletter_worker(text,jsonb)','execute') or has_table_privilege('authenticated','dy_private.newsletter_admins','insert') then raise exception 'worker_permission_leak';end if;
end $$;
rollback;
