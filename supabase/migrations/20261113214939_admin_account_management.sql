-- Service-only entry points: the Edge Function verifies JWT identity first.
create or replace function public.dy_admin_user_prepare(p_actor uuid,p_session uuid,p_target uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare my_role text;target_role text;target_email text;reason text:=trim(coalesce(p_payload->>'reason',''));aid uuid;h text;nm text;begin
 if not exists(select 1 from auth.sessions s join auth.users a on a.id=s.user_id where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after>now()) and (a.banned_until is null or a.banned_until<=now())) then raise exception 'live_session_required';end if;
 select role into my_role from dy_private.studio_roles where player_id=p_actor;
 if my_role not in ('admin','owner') or my_role is null or not exists(select 1 from dy_private.newsletter_admins where player_id=p_actor) then raise exception 'studio_admin_required';end if;
 if p_action not in ('profile','reset_password','set_password','suspend','restore','revoke_sessions','delete') then raise exception 'unknown_action';end if;
 select email into target_email from auth.users where id=p_target and deleted_at is null for update;
 if not found then raise exception 'account_not_found';end if;
 select role into target_role from dy_private.studio_roles where player_id=p_target;
 if p_target=p_actor or target_role='owner' or (target_role='admin' and my_role<>'owner') then raise exception 'protected_account';end if;
 if p_action='set_password' and my_role<>'owner' then raise exception 'owner_required';end if;
 if length(reason) not between 3 and 500 then raise exception 'reason_required';end if;
 if exists(select 1 from dy_private.studio_audit where detail->>'target_id'=p_target::text and detail->>'status'='pending' and created_at>now()-interval '2 minutes') then raise exception 'account_action_pending';end if;
 if p_action='reset_password' and exists(select 1 from dy_private.studio_audit where action='user_reset_password' and detail->>'target_id'=p_target::text and created_at>now()-interval '1 minute') then raise exception 'reset_cooldown';end if;
 if p_action='delete' then
  if coalesce(p_payload->>'confirmation','')<>target_email or target_email is null then raise exception 'confirmation_required';end if;
  -- Do not cascade erase paid records or silently leave paid subscriptions active.
  if exists(select 1 from dy_private.subscriptions where player_id=p_target) or exists(select 1 from dy_private.checkout_orders where player_id=p_target)
   or exists(select 1 from ari_private.mobile_receipts where player_id=p_target) or exists(select 1 from dy_private.hexfold_play_receipts where player_id=p_target)
   or exists(select 1 from house_private.mobile_purchases where player_id=p_target) or exists(select 1 from ortega_private.purchases where player_id=p_target)
   then raise exception 'billing_review_required';end if;
 end if;
 if p_action='profile' then
  h:=trim(coalesce(p_payload->>'handle',''));nm:=trim(coalesce(p_payload->>'display_name',''));
  if h !~ '^[a-z][a-z0-9_]{2,23}$' or length(nm) not between 1 and 48 then raise exception 'profile_invalid';end if;
  begin
   update public.dy_profiles set handle=h,display_name=nm,updated_at=now() where player_id=p_target;
   if not found then raise exception 'account_not_found';end if;
  exception when unique_violation then raise exception 'username_taken';end;
 end if;
 -- Revoke refresh sessions before auth deletion/password changes. Existing access
 -- tokens can persist until expiry; dy_require also rejects banned/deleted users.
 if p_action in ('delete','set_password','suspend','revoke_sessions') then
  delete from auth.sessions where user_id=p_target;
  delete from auth.refresh_tokens where user_id=p_target::text;
 end if;
 insert into dy_private.studio_audit(actor,action,detail) values(p_actor,'user_'||p_action,jsonb_build_object('target_id',p_target,'reason',reason,'status',case when p_action in ('profile','revoke_sessions') then 'completed' else 'pending' end)) returning id into aid;
 return jsonb_build_object('audit_id',aid,'email',target_email,'role',my_role);
end $$;
revoke all on function public.dy_admin_user_prepare(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.dy_admin_user_prepare(uuid,uuid,uuid,text,jsonb) to service_role;
create or replace function public.dy_admin_user_finish(p_actor uuid,p_audit uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$begin
 update dy_private.studio_audit set detail=jsonb_set(detail,'{status}',to_jsonb(case when p_success then 'completed' else 'failed' end)) where id=p_audit and actor=p_actor and action like 'user_%';
end $$;
revoke all on function public.dy_admin_user_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.dy_admin_user_finish(uuid,uuid,boolean) to service_role;
-- Extend the existing account gate without changing guest or OAuth scope rules.
create or replace function public.dy_require(p_scope text,p_game text default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();cid text:=auth.jwt()->>'client_id';app public.dy_apps%rowtype;guest boolean;banned timestamptz;begin
 if u is null then raise exception 'authentication_required';end if;
 select is_anonymous,banned_until into guest,banned from auth.users where id=u;
 if not found then raise exception 'account_deleted';end if;
 if banned>now() then raise exception 'account_suspended';end if;
 if guest and p_scope is distinct from 'multiplayer' then raise exception 'permanent_account_required';end if;
 if exists(select 1 from public.dy_account_requests where player_id=u) then raise exception 'account_deletion_pending';end if;
 if cid is not null then
 select * into app from public.dy_apps where oauth_client_id=cid and enabled;
 if not found or not p_scope=any(app.scopes) or (p_game is not null and app.id!=p_game) then raise exception 'app_scope_denied';end if;
 end if;return u;
end $$;
