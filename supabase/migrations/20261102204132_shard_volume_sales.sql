-- Prices are USD cents. Preserve payment activation, old orders and webhook fulfillment.
insert into dy_private.shard_packs(id,title,shards,amount_cents,enabled,sort_order)
select v.id,v.title,v.shards,v.cents,(select bool_and(enabled) from dy_private.shard_packs),v.pos
from (values ('shards-2500','2,500 Yeti Shards',2500,1999,4),('shards-5500','5,500 Yeti Shards',5500,3999,5),('shards-12000','12,000 Yeti Shards',12000,7999,6),('shards-25000','25,000 Yeti Shards',25000,14999,7),('shards-50000','50,000 Yeti Shards',50000,27499,8),('shards-custom','Custom Yeti Shards',100,99,99)) v(id,title,shards,cents,pos)
on conflict(id) do nothing;
alter table dy_private.checkout_orders add column if not exists pricing jsonb;

create or replace function dy_private.shard_sale_at(p_at timestamptz) returns jsonb
language plpgsql immutable set search_path='' as $$
declare y integer:=extract(year from p_at at time zone 'America/Denver');r record;s timestamptz;e timestamptz;bf date;begin
-- Friday after the fourth Thursday of November; 11 days through Cyber Monday.
bf:=make_date(y,11,1)+((4-extract(dow from make_date(y,11,1))::integer+7)%7)+22;
for r in select * from (values
 ('Black Friday & Cyber Monday',20,bf-7,bf+4),
 ('Spring sale',10,make_date(y,3,20),make_date(y,4,3)),
 ('Summer sale',10,make_date(y,6,20),make_date(y,7,6)),
 ('Halloween sale',10,make_date(y,10,24),make_date(y,11,2)),
 ('Winter sale',10,make_date(y,12,20),make_date(y+1,1,4)),
 ('Winter sale',10,make_date(y-1,12,20),make_date(y,1,4))
 ) as sales(title,percent,starts,ends) loop
 s:=r.starts::timestamp at time zone 'America/Denver';e:=r.ends::timestamp at time zone 'America/Denver';
 if p_at>=s and p_at<e then return jsonb_build_object('title',r.title,'percent',r.percent,'starts_at',s,'ends_at',e);end if;
end loop;return null;end $$;

create or replace function dy_private.shard_quote_at(p_quantity integer,p_at timestamptz) returns jsonb
language plpgsql immutable set search_path='' as $$
declare qs integer[]:=array[100,550,1200,2500,5500,12000,25000,50000];cs integer[]:=array[99,499,999,1999,3999,7999,14999,27499];i integer;base integer;total integer;sale jsonb;begin
 if p_quantity is null or p_quantity<100 or p_quantity>50000 then raise exception 'quantity_must_be_100_to_50000';end if;
 base:=99;
 for i in 2..8 loop
 if p_quantity<=qs[i] then base:=cs[i-1]+ceil((p_quantity-qs[i-1])::numeric*(cs[i]-cs[i-1])/(qs[i]-qs[i-1]));exit;end if;
 end loop;
 sale:=dy_private.shard_sale_at(p_at);
 total:=ceil(base::numeric*(100-coalesce((sale->>'percent')::integer,0))/100);
 return jsonb_build_object('quantity',p_quantity,'regular_cents',base,'amount_cents',total,'currency','usd','sale',sale,'volume_savings_percent',floor(100*(1-base/(p_quantity*0.99))));
end $$;

create or replace function public.dy_shard_quote(p_quantity integer) returns jsonb
language sql stable security definer set search_path='' as $$ select dy_private.shard_quote_at(p_quantity,now()); $$;
create or replace function public.dy_shard_sale() returns jsonb
language sql stable security definer set search_path='' as $$
select case when c.mode='live' and coalesce((a.document->'features'->>'cash_purchases')::boolean,false) and exists(select 1 from dy_private.shard_packs where enabled) then dy_private.shard_sale_at(now()) else null end from dy_private.payment_config c cross join dy_private.account_config a where c.id and a.id;
$$;
create or replace function public.dy_checkout_prepare_v2(p_pack text,p_version integer,p_request uuid,p_quantity integer default null,p_expected_cents integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.dy_require('economy');c dy_private.payment_config%rowtype;p dy_private.shard_packs%rowtype;o dy_private.checkout_orders%rowtype;q integer;quote jsonb;begin
 if p_request is null then raise exception 'request_required';end if;
 if exists(select 1 from dy_private.payment_holds where player_id=u) then raise exception 'payment_review_required';end if;
 select * into c from dy_private.payment_config where id;
 if c.mode='off' or (c.mode='test' and not u=any(c.test_players)) or (c.mode='live' and not coalesce((select (document->'features'->>'cash_purchases')::boolean from dy_private.account_config where id),false)) then raise exception 'payments_not_ready';end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||u::text||':'||p_request::text,0));
 select * into o from dy_private.checkout_orders where player_id=u and request_id=p_request;
 if found then
 if o.pack_id!=p_pack or o.pack_version is distinct from p_version or o.livemode!=(c.mode='live') then raise exception 'request_reused';end if;
 if p_quantity is not null and o.shards<>p_quantity then raise exception 'request_reused';end if;
 if p_expected_cents is not null and o.amount_cents<>p_expected_cents then raise exception 'price_changed_new_request_required';end if;
 if o.created_at<now()-interval '20 minutes' then raise exception 'checkout_expired_use_new_request';end if;
 return to_jsonb(o);end if;
 select * into p from dy_private.shard_packs where id=p_pack and enabled;
 if not found or p.version is distinct from p_version then raise exception 'pack_changed';end if;
 q:=case when p.id='shards-custom' then p_quantity else p.shards end;
 if p.id<>'shards-custom' and p_quantity is not null and p_quantity<>p.shards then raise exception 'quantity_mismatch';end if;
 quote:=dy_private.shard_quote_at(q,now());
 if p_expected_cents is not null and p_expected_cents<>(quote->>'amount_cents')::integer then raise exception 'price_changed_refresh_quote';end if;
 perform public.dy_rate('checkout',10);
 insert into dy_private.checkout_orders(player_id,request_id,pack_id,pack_version,title,shards,amount_cents,currency,livemode,pricing)
 values(u,p_request,p.id,p.version,q::text||' Yeti Shards',q,(quote->>'amount_cents')::integer,p.currency,c.mode='live',quote) returning * into o;
 return to_jsonb(o);
end $$;
create or replace function public.dy_payment_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');c dy_private.payment_config%rowtype;allowed boolean;begin
 select * into c from dy_private.payment_config where id;
 allowed:=(c.mode='test' and u=any(c.test_players)) or (c.mode='live' and coalesce((select (document->'features'->>'cash_purchases')::boolean from dy_private.account_config where id),false));
 return jsonb_build_object('schema_version',2,'custom',jsonb_build_object('id','shards-custom','min',100,'max',50000,'version',1,'available',allowed and exists(select 1 from dy_private.shard_packs where id='shards-custom' and enabled)),'sale',dy_private.shard_sale_at(now()),'mode',case when allowed then c.mode else 'preview' end,'available',allowed and not exists(select 1 from dy_private.payment_holds where player_id=u),
 'packs',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'title',p.title,'shards',p.shards::text,'regular_cents',p.amount_cents,'amount_cents',(dy_private.shard_quote_at(p.shards,now())->>'amount_cents')::integer,'volume_savings_percent',(dy_private.shard_quote_at(p.shards,now())->>'volume_savings_percent')::integer,'currency',p.currency,'available',allowed and p.enabled) order by p.sort_order),'[]') from dy_private.shard_packs p where p.id<>'shards-custom'),
 'orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select id,title,shards::text,amount_cents,currency,livemode,status,created_at from dy_private.checkout_orders where player_id=u order by created_at desc limit 20)x));
end $$;

-- Legacy clients receive server-calculated sale prices too.
create or replace function public.dy_checkout_prepare(p_pack text,p_version integer,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select public.dy_checkout_prepare_v2(p_pack,p_version,p_request,null,null); $$;
revoke all on function dy_private.shard_sale_at(timestamptz),dy_private.shard_quote_at(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.dy_checkout_prepare_v2(text,integer,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.dy_checkout_prepare_v2(text,integer,uuid,integer,integer) to authenticated;
revoke all on function public.dy_shard_quote(integer),public.dy_shard_sale() from public;
grant execute on function public.dy_shard_quote(integer),public.dy_shard_sale() to anon,authenticated;
