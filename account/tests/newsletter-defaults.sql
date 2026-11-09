begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();g uuid:=gen_random_uuid();begin
 insert into auth.users(id,aud,role,email,email_confirmed_at,is_anonymous,created_at,raw_user_meta_data) values
 (u,'authenticated','authenticated',u||'@example.invalid',now(),false,now(),'{}'),
 (v,'authenticated','authenticated',v||'@example.invalid',now(),false,now(),'{"newsletter_subscribed":false}'),
 (g,'authenticated','authenticated',g||'@example.invalid',null,true,now(),'{}');
 if not exists(select 1 from dy_private.newsletter_preferences where player_id=u and subscribed and enrollment_source='account_default' and affirmative_consent_at is null) then raise exception 'default_missing';end if;
 if not exists(select 1 from dy_private.newsletter_preferences where player_id=v and not subscribed) then raise exception 'unchecked_ignored';end if;
 if exists(select 1 from dy_private.newsletter_preferences where player_id=g) then raise exception 'guest_enrolled';end if;
 if exists(select 1 from dy_private.newsletter_confirmed_audience() where player_id=u) then raise exception 'false_consent_claim';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform public.dy_newsletter_signup_choice(false);
 if (public.dy_newsletter_preference()->>'subscribed')::boolean then raise exception 'oauth_uncheck_ignored';end if;
 perform public.dy_newsletter_set(true);
 if not exists(select 1 from dy_private.newsletter_confirmed_audience() where player_id=u) then raise exception 'explicit_consent_missing';end if;
 perform public.dy_newsletter_set(false);
 update auth.users set email=u||'-new@example.invalid' where id=u;
 if (select subscribed from dy_private.newsletter_preferences where player_id=u) then raise exception 'unsubscribe_overwritten';end if;
 update auth.users set is_anonymous=false,email_confirmed_at=now() where id=g;
 if not exists(select 1 from dy_private.newsletter_preferences where player_id=g and subscribed) then raise exception 'guest_upgrade_missing';end if;
 perform public.dy_request_deletion();perform public.dy_request_deletion();
 if not (public.dy_deletion_request_status()->>'requested')::boolean then raise exception 'request_missing';end if;
 if exists(select 1 from dy_private.newsletter_audience() where player_id=u) then raise exception 'deleted_newsletter';end if;
 if exists(select 1 from public.dy_account_requests where player_id=v) then raise exception 'request_wrong_owner';end if;
 if has_function_privilege('anon','public.dy_request_deletion()','execute') or has_function_privilege('anon','public.dy_deletion_request_status()','execute') or has_table_privilege('authenticated','dy_private.newsletter_preferences','update') then raise exception 'privilege_leak';end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.dy_deletion_request_status();raise exception 'anonymous_allowed';exception when others then if sqlerrm<>'authentication_required' then raise;end if;end;
end $$;
rollback;
