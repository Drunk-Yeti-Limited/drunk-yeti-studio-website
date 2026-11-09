begin;
do $$ declare a uuid:=gen_random_uuid();r jsonb;begin
 insert into auth.users(id,email,email_confirmed_at,is_anonymous,created_at) values(a,a||'@example.invalid',now(),false,now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 begin perform public.dy_studio_admin('access');raise exception 'nonadmin_allowed';exception when others then if sqlerrm<>'studio_admin_required' then raise;end if;end;
 insert into dy_private.newsletter_admins values(a);
 begin perform public.dy_studio_admin('access');raise exception 'role_missing_allowed';exception when others then if sqlerrm<>'studio_admin_required' then raise;end if;end;
 insert into dy_private.studio_roles values(a,'admin');
 r:=public.dy_studio_admin('access');if r->>'role'<>'admin' then raise exception 'admin_failed';end if;
 update dy_private.studio_roles set role='owner' where player_id=a;
 r:=public.dy_studio_admin('access');if r->>'role'<>'owner' then raise exception 'owner_failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','client_id','third-party')::text,true);
 begin perform public.dy_studio_admin('access');raise exception 'delegated_admin_allowed';exception when others then if sqlerrm not in ('studio_admin_required','app_scope_denied') then raise;end if;end;
 if has_table_privilege('authenticated','dy_private.studio_roles','insert') or has_table_privilege('authenticated','dy_private.studio_roles','select') or has_function_privilege('anon','public.dy_studio_admin(text,jsonb)','execute') then raise exception 'privilege_leak';end if;
end $$;
rollback;
