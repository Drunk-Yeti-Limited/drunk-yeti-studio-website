-- Allow the explicitly requested Shards-first launch. App access still requires ready=true.
create or replace function public.dy_subscription_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.dy_require('account_read');c dy_private.subscription_config%rowtype;begin
 select * into c from dy_private.subscription_config where id;
 return jsonb_build_object('schema_version',1,'title',c.title,'mode',c.mode,'amount_cents',c.amount_cents,'currency',c.currency,'interval',c.billing_interval,'monthly_shards',c.monthly_shards,
 'available',c.checkout_enabled and c.webhooks_ready and c.mode in ('test','live') and c.stripe_price is not null and c.portal_configuration is not null and c.amount_cents is not null and c.billing_interval is not null,
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'kind',kind,'ready',ready) order by kind,title),'[]') from dy_private.access_products where included));
end $$;
