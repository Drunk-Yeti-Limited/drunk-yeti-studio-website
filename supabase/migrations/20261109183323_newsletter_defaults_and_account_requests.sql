-- Enrollment is not evidence of affirmative marketing consent.
alter table dy_private.newsletter_preferences add column enrollment_source text not null default 'explicit_preference';
alter table dy_private.newsletter_preferences add column affirmative_consent_at timestamptz;
update dy_private.newsletter_preferences set affirmative_consent_at=subscribed_at where subscribed;

create function dy_private.newsletter_new_account() returns trigger language plpgsql security definer set search_path='' as $$
declare opted boolean; source text; begin
 if coalesce(new.is_anonymous,false) or coalesce(new.email,'')='' then return new;end if;
 if exists(select 1 from public.dy_account_requests where player_id=new.id) then return new;end if;
 opted:=coalesce(new.raw_user_meta_data->'newsletter_subscribed','true'::jsonb)<>'false'::jsonb;
 source:=case when new.raw_user_meta_data ? 'newsletter_subscribed' then 'signup_default_choice' else 'account_default' end;
 insert into dy_private.newsletter_preferences(player_id,subscribed,consent_email,consent_version,subscribed_at,unsubscribed_at,enrollment_source)
 values(new.id,opted,lower(new.email),'monthly-studio-news-default-v2',case when opted then now() end,case when not opted then now() end,source)
 on conflict(player_id) do nothing;
 return new;
end $$;
revoke all on function dy_private.newsletter_new_account() from public,anon,authenticated;
create trigger dy_newsletter_new_account after insert or update of is_anonymous,email on auth.users for each row execute function dy_private.newsletter_new_account();

-- Preserve every existing preference, including prior unsubscribe decisions.
insert into dy_private.newsletter_preferences(player_id,subscribed,consent_email,consent_version,subscribed_at,enrollment_source)
select id,true,lower(email),'monthly-studio-news-default-v2',now(),'existing_account_default' from auth.users u
where not coalesce(is_anonymous,false) and coalesce(email,'')<>'' and not exists(select 1 from public.dy_account_requests r where r.player_id=u.id)
on conflict(player_id) do nothing;

create or replace function public.dy_newsletter_preference() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('profile');e text;confirmed boolean;p dy_private.newsletter_preferences%rowtype;begin
 select lower(email),email_confirmed_at is not null into e,confirmed from auth.users where id=u;
 select * into p from dy_private.newsletter_preferences where player_id=u;
 return jsonb_build_object('subscribed',coalesce(p.subscribed and p.consent_email=e,false),'email',e,'email_confirmed',confirmed,'frequency','monthly','enrollment_source',p.enrollment_source);
end $$;
create or replace function public.dy_newsletter_set(p_subscribed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('profile');e text;confirmed boolean;begin
 if auth.jwt()->>'client_id' is not null then raise exception 'account_website_required';end if;
 if p_subscribed is null then raise exception 'preference_required';end if;
 select lower(email),email_confirmed_at is not null into e,confirmed from auth.users where id=u;
 if coalesce(e,'')='' or (p_subscribed and not confirmed) then raise exception 'confirmed_email_required';end if;
 insert into dy_private.newsletter_preferences(player_id,subscribed,consent_email,subscribed_at,unsubscribed_at,enrollment_source,affirmative_consent_at)
 values(u,p_subscribed,e,case when p_subscribed then now() end,case when not p_subscribed then now() end,'explicit_preference',case when p_subscribed then now() end)
 on conflict(player_id) do update set subscribed=excluded.subscribed,consent_email=excluded.consent_email,
 subscribed_at=case when excluded.subscribed then now() else dy_private.newsletter_preferences.subscribed_at end,
 unsubscribed_at=case when not excluded.subscribed then now() else dy_private.newsletter_preferences.unsubscribed_at end,
 enrollment_source='explicit_preference',affirmative_consent_at=excluded.affirmative_consent_at,updated_at=now();
 return public.dy_newsletter_preference();
end $$;
-- Apply a new OAuth account's displayed signup choice without fabricating affirmative consent.
create function public.dy_newsletter_signup_choice(p_subscribed boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('profile');begin
 if auth.jwt()->>'client_id' is not null or p_subscribed is null then raise exception 'invalid_signup_choice';end if;
 update dy_private.newsletter_preferences p set subscribed=p_subscribed,enrollment_source='signup_default_choice',
 unsubscribed_at=case when not p_subscribed then now() end,affirmative_consent_at=null,updated_at=now()
 where player_id=u and p.enrollment_source='account_default' and exists(select 1 from auth.users a where a.id=u and a.created_at>now()-interval '30 minutes');
end $$;
revoke all on function public.dy_newsletter_signup_choice(boolean) from public,anon;
grant execute on function public.dy_newsletter_signup_choice(boolean) to authenticated;

-- Mailing services requiring affirmative opt-in must use this audience, not the default enrollment list.
create function dy_private.newsletter_confirmed_audience() returns table(player_id uuid,email text,consented_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select a.player_id,a.email,p.affirmative_consent_at from dy_private.newsletter_audience() a
 join dy_private.newsletter_preferences p using(player_id) where p.affirmative_consent_at is not null
$$;
revoke all on function dy_private.newsletter_confirmed_audience() from public,anon,authenticated;

-- Requests are queued for studio review, not falsely reported as completed deletion.
create function public.dy_deletion_request_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.dy_account_requests%rowtype;begin
 if u is null then raise exception 'authentication_required';end if;
 if auth.jwt()->>'client_id' is not null or not exists(select 1 from auth.users where id=u and not coalesce(is_anonymous,false)) then raise exception 'account_website_required';end if;
 select * into r from public.dy_account_requests where player_id=u;
 return jsonb_build_object('requested',r.player_id is not null,'requested_at',r.requested_at,'status',r.status);
end $$;
create or replace function public.dy_request_deletion() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
 perform public.dy_deletion_request_status();
 insert into public.dy_account_requests(player_id,kind) values(u,'delete') on conflict do nothing;
 update dy_private.newsletter_preferences set subscribed=false,unsubscribed_at=now(),affirmative_consent_at=null,updated_at=now() where player_id=u;
end $$;
revoke all on function public.dy_request_deletion(),public.dy_deletion_request_status() from public,anon;
grant execute on function public.dy_request_deletion(),public.dy_deletion_request_status() to authenticated;
