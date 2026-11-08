import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createProfileSyncHandler} from '../_shared/profile-sync.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
Deno.serve(createProfileSyncHandler({admin,userClient:(authorization:string)=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{...options,global:{headers:{Authorization:authorization}}})}));
