-- Privileged roles are server managed; clients cannot edit this table.
create table dy_private.studio_roles (
 player_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','admin'))
);
alter table dy_private.studio_roles enable row level security;
revoke all on dy_private.studio_roles from public,anon,authenticated;
insert into dy_private.studio_roles(player_id,role) select player_id,'admin' from dy_private.newsletter_admins;
-- Bootstrap only the exact verified account explicitly authorized by the studio owner.
do $$ declare target uuid;begin
 select id into strict target from auth.users where lower(email)='mlambertbusiness@gmail.com' and email_confirmed_at is not null;
 insert into dy_private.studio_roles values(target,'owner') on conflict(player_id) do update set role='owner';
 insert into dy_private.newsletter_admins values(target) on conflict do nothing;
 insert into dy_private.studio_audit(actor,action,detail) values(target,'owner_bootstrap',jsonb_build_object('reason','Explicit studio owner authorization'));
end $$;
create or replace function public.dy_studio_admin(p_action text default 'overview',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_manage');r jsonb;q text;off integer; my_role text; begin
 if auth.jwt()->>'client_id' is not null or not exists(select 1 from dy_private.newsletter_admins where player_id=u) then raise exception 'studio_admin_required';end if;
 select role into my_role from dy_private.studio_roles where player_id=u;
 if my_role is null then raise exception 'studio_admin_required';end if;
 if p_action='access' then return jsonb_build_object('role',my_role);end if;
 if p_action='grant_gift' then
 r:=dy_private.grant_frostpass(p_payload->>'email',(p_payload->>'months')::integer,p_payload->>'reference');
 if not (r->>'replayed')::boolean then
 update dy_private.frostpass_gifts set created_by=u::text where id=(r->>'id')::uuid;
 insert into dy_private.studio_audit(actor,action,detail) values(u,p_action,jsonb_build_object('gift_id',r->>'id','reference',p_payload->>'reference'));
 end if;return r;
 elsif p_action='revoke_gift' then
 if not exists(select 1 from dy_private.frostpass_gifts where reference=p_payload->>'reference') then raise exception 'gift_not_found';end if;
 r:=jsonb_build_object('revoked',dy_private.revoke_frostpass(p_payload->>'reference',p_payload->>'reason'));
 if (r->>'revoked')::boolean then insert into dy_private.studio_audit(actor,action,detail) values(u,p_action,jsonb_build_object('reference',p_payload->>'reference','reason',left(p_payload->>'reason',500)));end if;
 return r;
 elsif p_action='accounts' then
 q:=left(trim(coalesce(p_payload->>'query','')),120);off:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));
 return jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(a)) from (
 select a.id,a.email,(select role from dy_private.studio_roles where player_id=a.id) as studio_role,a.email_confirmed_at is not null as verified,a.created_at,p.handle,p.display_name,
 coalesce(n.subscribed,false) as newsletter_enrolled,n.affirmative_consent_at is not null as newsletter_confirmed,
 coalesce(s.subscribed,false) as sms_opt_in,
 exists(select 1 from public.dy_account_requests d where d.player_id=a.id) as deletion_pending,
 exists(select 1 from dy_private.frostpass_gifts g where g.player_id=a.id and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now()) as active_gift
 from auth.users a left join public.dy_profiles p on p.player_id=a.id left join dy_private.newsletter_preferences n on n.player_id=a.id left join dy_private.sms_preferences s on s.player_id=a.id
 where not coalesce(a.is_anonymous,false) and (q='' or position(lower(q) in lower(coalesce(a.email,'')||' '||coalesce(p.handle,'')||' '||coalesce(p.display_name,'')))>0)
 order by a.created_at desc,a.id limit 50 offset off)a),'[]'::jsonb),'offset',off);
 elsif p_action='gifts' then
 off:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));
 return coalesce((select jsonb_agg(to_jsonb(g)) from (select g.*,a.email from dy_private.frostpass_gifts g join auth.users a on a.id=g.player_id order by g.created_at desc,g.id limit 50 offset off)g),'[]'::jsonb);
 elsif p_action='audit' then
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select * from dy_private.studio_audit order by created_at desc limit 100)x),'[]'::jsonb);
 elsif p_action='requests' then
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select r.*,a.email from public.dy_account_requests r join auth.users a on a.id=r.player_id order by requested_at limit 100)x),'[]'::jsonb);
 elsif p_action='overview' then
 return jsonb_build_object('role',my_role,'accounts',(select count(*) from auth.users where not coalesce(is_anonymous,false)),
 'newsletter_enrolled',(select count(*) from dy_private.newsletter_preferences where subscribed),
 'newsletter_eligible',(select count(*) from dy_private.newsletter_confirmed_audience()),
 'sms_opt_in',(select count(*) from dy_private.sms_preferences where subscribed),'sms_enabled',false,
 'active_gifts',(select count(*) from dy_private.frostpass_gifts where revoked_at is null and starts_at<=now() and ends_at>now()),
 'pending_requests',(select count(*) from public.dy_account_requests),
 'newsletter_enabled',(select enabled from dy_private.newsletter_delivery_config where id),
 'campaigns',(select count(*) from dy_private.newsletter_campaigns),'jobs_needing_review',(select count(*) from dy_private.newsletter_jobs where status='review'));
 else raise exception 'unknown_action';end if;
end $$;
revoke all on function public.dy_studio_admin(text,jsonb) from public,anon;
grant execute on function public.dy_studio_admin(text,jsonb) to authenticated;
