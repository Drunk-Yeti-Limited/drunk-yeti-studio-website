create table dy_private.newsletter_admins(player_id uuid primary key references auth.users(id) on delete cascade);
insert into dy_private.newsletter_admins select id from auth.users where lower(email)='mlambertbusiness@gmail.com' and email_confirmed_at is not null;
create table dy_private.newsletter_delivery_config(id boolean primary key default true check(id),enabled boolean not null default false,sender_email text not null default 'newsletter@drunkyetistudio.com',sender_name text not null default 'Drunk Yeti Studio',reply_to text not null default 'drunkyetilimited@gmail.com',postal_address text not null default '',folder_id bigint, daily_limit integer not null default 300 check(daily_limit between 1 and 300));
insert into dy_private.newsletter_delivery_config(id) values(true);
create table dy_private.newsletter_campaigns(id uuid primary key,subject text not null check(length(subject) between 1 and 150),body text not null check(length(body) between 1 and 40000),status text not null default 'draft' check(status in ('draft','queued','paused','complete')),created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),queued_at timestamptz);
create table dy_private.newsletter_jobs(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references dy_private.newsletter_campaigns(id) on delete cascade,status text not null default 'preparing' check(status in ('preparing','dispatching','submitted','review','skipped','retry')),lease uuid not null default gen_random_uuid(),lease_until timestamptz not null default now()+interval '15 minutes',reserved_at timestamptz not null default now(),reserved_count integer not null check(reserved_count between 0 and 50),provider_id bigint,provider_status text,error_code text,not_before timestamptz not null default now());
create table dy_private.newsletter_recipients(campaign_id uuid not null references dy_private.newsletter_campaigns(id) on delete cascade,player_id uuid not null references auth.users(id) on delete cascade,email text not null,job_id uuid references dy_private.newsletter_jobs(id),primary key(campaign_id,player_id),unique(campaign_id,email));
create index newsletter_pending on dy_private.newsletter_recipients(campaign_id) where job_id is null;
create index newsletter_job_budget on dy_private.newsletter_jobs(reserved_at);
alter table dy_private.newsletter_admins enable row level security;
alter table dy_private.newsletter_delivery_config enable row level security;
alter table dy_private.newsletter_campaigns enable row level security;
alter table dy_private.newsletter_jobs enable row level security;
alter table dy_private.newsletter_recipients enable row level security;
revoke all on dy_private.newsletter_admins,dy_private.newsletter_delivery_config,dy_private.newsletter_campaigns,dy_private.newsletter_jobs,dy_private.newsletter_recipients from public,anon,authenticated;

create function public.dy_newsletter_admin(p_action text default 'list',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_manage');cid uuid;cfg dy_private.newsletter_delivery_config%rowtype;begin
 if auth.jwt()->>'client_id' is not null or not exists(select 1 from dy_private.newsletter_admins where player_id=u) then raise exception 'studio_admin_required';end if;
 select * into cfg from dy_private.newsletter_delivery_config where id;
 if p_action='save' then
 cid:=(p_payload->>'id')::uuid;
 insert into dy_private.newsletter_campaigns(id,subject,body,created_by) values(cid,trim(p_payload->>'subject'),p_payload->>'body',u)
 on conflict(id) do update set subject=excluded.subject,body=excluded.body where newsletter_campaigns.status='draft';
 if not found then raise exception 'campaign_locked';end if;
 elsif p_action='queue' then
 if not cfg.enabled or cfg.folder_id is null or cfg.postal_address='' then raise exception 'sender_setup_required';end if;
 cid:=(p_payload->>'id')::uuid;
 perform 1 from dy_private.newsletter_campaigns where id=cid for update;
 if not found then raise exception 'campaign_missing';end if;
 if exists(select 1 from dy_private.newsletter_campaigns where id=cid and status='draft') then
 insert into dy_private.newsletter_recipients(campaign_id,player_id,email) select cid,player_id,email from dy_private.newsletter_confirmed_audience() on conflict do nothing;
 if not exists(select 1 from dy_private.newsletter_recipients where campaign_id=cid) then raise exception 'no_confirmed_subscribers';end if;
 update dy_private.newsletter_campaigns set status='queued',queued_at=now() where id=cid;
 end if;
 elsif p_action='pause' then
 update dy_private.newsletter_campaigns set status='paused' where id=(p_payload->>'id')::uuid and status='queued';
 elsif p_action='resume' then
 if not cfg.enabled then raise exception 'sender_setup_required';end if;
 update dy_private.newsletter_campaigns set status='queued' where id=(p_payload->>'id')::uuid and status='paused';
 elsif p_action<>'list' then raise exception 'unknown_action';end if;
 return jsonb_build_object('enabled',cfg.enabled,'sender_email',cfg.sender_email,'daily_limit',cfg.daily_limit,'eligible',(select count(*) from dy_private.newsletter_confirmed_audience()),'campaigns',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('recipients',(select count(*) from dy_private.newsletter_recipients where campaign_id=c.id),'submitted',(select coalesce(sum(reserved_count),0) from dy_private.newsletter_jobs where campaign_id=c.id and status='submitted'),'review',(select count(*) from dy_private.newsletter_jobs where campaign_id=c.id and status='review'),'skipped',(select coalesce(sum(reserved_count),0) from dy_private.newsletter_jobs where campaign_id=c.id and status='skipped'))) from (select * from dy_private.newsletter_campaigns order by created_at desc limit 50)c),'[]'::jsonb));
end $$;
revoke all on function public.dy_newsletter_admin(text,jsonb) from public,anon;
grant execute on function public.dy_newsletter_admin(text,jsonb) to authenticated;

-- Service-role-only queue protocol. The browser cannot obtain recipients, leases, or configuration.
create function public.dy_newsletter_worker(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg dy_private.newsletter_delivery_config%rowtype;j dy_private.newsletter_jobs%rowtype;c dy_private.newsletter_campaigns%rowtype;n integer;emails jsonb;begin
 if p_action='claim' then
 perform pg_advisory_xact_lock(hashtext('dy_newsletter_worker'));
 select * into cfg from dy_private.newsletter_delivery_config where id;
 if not cfg.enabled then return jsonb_build_object('disabled',true);end if;
 update dy_private.newsletter_jobs set status='skipped' where status='retry' and not_before<=now();
 -- Never retry an ambiguous send automatically.
 update dy_private.newsletter_jobs set status='review',error_code='dispatch_outcome_unknown' where status='dispatching' and lease_until<now();
 update dy_private.newsletter_recipients set job_id=null where job_id in(select id from dy_private.newsletter_jobs where status='preparing' and lease_until<now());
 update dy_private.newsletter_jobs set status='skipped',reserved_count=0,error_code='preparation_lease_expired' where status='preparing' and lease_until<now();
 if exists(select 1 from dy_private.newsletter_jobs where status in ('preparing','dispatching','review')) then return jsonb_build_object('waiting',true);end if;
 if exists(select 1 from dy_private.newsletter_jobs where status='retry' and not_before>now()) then return jsonb_build_object('waiting',true);end if;
 select least(50,cfg.daily_limit-coalesce(sum(reserved_count),0))::integer into n from dy_private.newsletter_jobs where status in ('preparing','dispatching','submitted','review') and reserved_at>now()-interval '25 hours';
 if n<=0 then return jsonb_build_object('daily_limit',true);end if;
 select * into c from dy_private.newsletter_campaigns q where status='queued' and exists(select 1 from dy_private.newsletter_recipients r where r.campaign_id=q.id and job_id is null) order by queued_at limit 1;
 if not found then
 update dy_private.newsletter_campaigns q set status='complete' where status='queued' and not exists(select 1 from dy_private.newsletter_recipients r where r.campaign_id=q.id and job_id is null) and not exists(select 1 from dy_private.newsletter_jobs x where x.campaign_id=q.id and x.status in ('preparing','dispatching','review','retry'));
 return jsonb_build_object('idle',true);end if;
 insert into dy_private.newsletter_jobs(campaign_id,reserved_count) values(c.id,0) returning * into j;
 update dy_private.newsletter_recipients set job_id=j.id where (campaign_id,player_id) in(select campaign_id,player_id from dy_private.newsletter_recipients where campaign_id=c.id and job_id is null order by player_id limit n);
 select count(*) into n from dy_private.newsletter_recipients where job_id=j.id;
 update dy_private.newsletter_jobs set reserved_count=n where id=j.id;
 select coalesce(jsonb_agg(r.email),'[]') into emails from dy_private.newsletter_recipients r join dy_private.newsletter_confirmed_audience() a on a.player_id=r.player_id and lower(a.email)=lower(r.email) where r.job_id=j.id;
 return jsonb_build_object('job',to_jsonb(j),'campaign',to_jsonb(c),'config',to_jsonb(cfg),'emails',emails);
 end if;
 select * into j from dy_private.newsletter_jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid for update;
 if not found then raise exception 'invalid_lease';end if;
 if p_action='dispatch' then
 if j.status<>'preparing' or j.lease_until<now() or not exists(select 1 from dy_private.newsletter_campaigns where id=j.campaign_id and status='queued') or not exists(select 1 from dy_private.newsletter_delivery_config where id and enabled) then raise exception 'dispatch_not_allowed';end if;
 select coalesce(jsonb_agg(r.email),'[]') into emails from dy_private.newsletter_recipients r join dy_private.newsletter_confirmed_audience() a on a.player_id=r.player_id and lower(a.email)=lower(r.email) where r.job_id=j.id;
 if not coalesce(p_payload->'emails','[]') <@ emails then raise exception 'audience_changed';end if;
 update dy_private.newsletter_jobs set status='dispatching',reserved_count=jsonb_array_length(p_payload->'emails'),provider_id=(p_payload->>'provider_id')::bigint,reserved_at=now() where id=j.id;
 elsif p_action='submitted' then
 if j.status<>'dispatching' then raise exception 'not_dispatching';end if;
 update dy_private.newsletter_jobs set status='submitted',provider_status='accepted' where id=j.id;
 elsif p_action='skip' then
 if j.status<>'preparing' then raise exception 'not_preparing';end if;
 update dy_private.newsletter_jobs set status='skipped',error_code='no_eligible_recipients' where id=j.id;
 elsif p_action='retry' then
 if j.status not in ('preparing','dispatching') then raise exception 'not_retryable';end if;
 update dy_private.newsletter_recipients set job_id=null where job_id=j.id;
 update dy_private.newsletter_jobs set status='retry',reserved_count=0,error_code=left(p_payload->>'reason',80),not_before=now()+case when p_payload->>'reason'='credits_exhausted' then interval '25 hours' else interval '30 minutes' end where id=j.id;
 elsif p_action='review' then
 update dy_private.newsletter_jobs set status='review',error_code=left(p_payload->>'reason',80) where id=j.id;
 else raise exception 'unknown_action';end if;
 -- Expired retry entries are audit history; they must not block completion forever.
 update dy_private.newsletter_jobs set status='skipped' where status='retry' and not_before<=now();
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.dy_newsletter_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.dy_newsletter_worker(text,jsonb) to service_role;
