import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createAdminUsersHandler} from '../_shared/admin-users.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit' as const}};
Deno.serve(createAdminUsersHandler({admin:createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,opts),authClient:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,opts)}));
