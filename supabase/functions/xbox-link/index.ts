import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createXboxHandler} from '../_shared/xbox.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
Deno.serve(createXboxHandler({secret:Deno.env.get('XBOX_CLIENT_SECRET'),admin:createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options),clientFor:(authorization:string)=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{...options,global:{headers:{Authorization:authorization}}})}));
