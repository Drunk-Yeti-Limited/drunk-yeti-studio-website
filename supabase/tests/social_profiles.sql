-- Transaction-only fixtures: creates no durable accounts or social data.
begin;
set local statement_timeout = '15s';
select set_config('test.social_owner', gen_random_uuid()::text, true);
select set_config('test.social_friend', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, is_anonymous)
values (current_setting('test.social_owner')::uuid,'authenticated','authenticated',false),
       (current_setting('test.social_friend')::uuid,'authenticated','authenticated',false);
insert into public.dy_profiles(player_id,handle,display_name,discoverable,share_achievements)
select id,'qa_'||substr(replace(id::text,'-',''),1,16),'Social privacy fixture',true,false
from auth.users where id in (current_setting('test.social_owner')::uuid,current_setting('test.social_friend')::uuid);

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.social_owner'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.dy_social_profiles(player_id,platform,handle)
values (auth.uid(),'twitter','test_owner');
do $$ begin
 if not exists(select 1 from public.dy_social_profiles where player_id=auth.uid() and not share_with_friends) then raise exception 'FAIL private default/owner read'; end if;
 begin
   update public.dy_social_profiles set player_id=current_setting('test.social_friend')::uuid where player_id=auth.uid();
   raise exception 'FAIL owner reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.dy_social_profiles(player_id,platform,handle) values(current_setting('test.social_friend')::uuid,'github','stolen');
   raise exception 'FAIL cross-account insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.social_friend'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.dy_social_profiles where player_id=current_setting('test.social_owner')::uuid) then raise exception 'FAIL private data exposed'; end if;
end $$;
reset role;
insert into public.dy_relations(low_id,high_id,requested_by,status)
values (least(current_setting('test.social_owner')::uuid,current_setting('test.social_friend')::uuid),greatest(current_setting('test.social_owner')::uuid,current_setting('test.social_friend')::uuid),current_setting('test.social_owner')::uuid,'pending');
update public.dy_social_profiles set share_with_friends=true where player_id=current_setting('test.social_owner')::uuid;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.dy_social_profiles where player_id=current_setting('test.social_owner')::uuid) then raise exception 'FAIL pending friend sees handle'; end if;
end $$;
select public.dy_friend_action(current_setting('test.social_owner')::uuid,'accept');
do $$ begin
 if not exists(select 1 from public.dy_social_profiles where player_id=current_setting('test.social_owner')::uuid and handle='test_owner') then raise exception 'FAIL accepted friend cannot see shared handle'; end if;
 update public.dy_social_profiles set handle='stolen' where player_id=current_setting('test.social_owner')::uuid;
 if found then raise exception 'FAIL friend can modify owner handle'; end if;
 delete from public.dy_social_profiles where player_id=current_setting('test.social_owner')::uuid;
 if found then raise exception 'FAIL friend can remove owner handle'; end if;
end $$;
select public.dy_friend_action(current_setting('test.social_owner')::uuid,'block');
do $$ begin
 if exists(select 1 from public.dy_social_profiles where player_id=current_setting('test.social_owner')::uuid) then raise exception 'FAIL blocked friend sees handle'; end if;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.social_owner'),'role','authenticated','client_id','unregistered-social-test-client')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.dy_social_profiles where player_id=auth.uid()) then raise exception 'FAIL unregistered app sees handles'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.social_owner'),'role','authenticated')::text,true);
set local role authenticated;
update public.dy_social_profiles set handle='updated',share_with_friends=false where player_id=auth.uid();
do $$ begin
 if not exists(select 1 from public.dy_social_profiles where player_id=auth.uid() and handle='updated' and not share_with_friends) then raise exception 'FAIL owner update'; end if;
 delete from public.dy_social_profiles where player_id=auth.uid();
 if not found then raise exception 'FAIL owner delete'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform 1 from public.dy_social_profiles;
  raise exception 'FAIL anonymous access';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: private default, owner CRUD, cross-account protection, pending/accepted/blocked friend privacy, scoped app denial, anonymous denial; all fixtures rolled back' as result;
