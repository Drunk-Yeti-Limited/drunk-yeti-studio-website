-- Publish the web capability. The UI additionally requires Azure enabled in Auth settings.
update dy_private.account_config
set document=jsonb_set(document,'{auth,providers}',(
 select jsonb_agg(case when p->>'id'='azure' then p || '{"name":"Microsoft","ready_surfaces":["web"]}'::jsonb else p end order by ord)
 from jsonb_array_elements(document#>'{auth,providers}') with ordinality as providers(p,ord)
)),revision=revision+1,updated_at=now()
where id=true and exists(select 1 from jsonb_array_elements(document#>'{auth,providers}') p where p->>'id'='azure' and p->'ready_surfaces' is distinct from '["web"]'::jsonb);
