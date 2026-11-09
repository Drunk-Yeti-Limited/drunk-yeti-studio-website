import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createNewsletterWorker} from '../_shared/newsletter-worker.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createNewsletterWorker({apiKey:Deno.env.get('BREVO_API_KEY')||'',workerSecret:Deno.env.get('NEWSLETTER_WORKER_SECRET')||'',rpc:async(action:string,payload:unknown)=>{const r=await admin.rpc('dy_newsletter_worker',{p_action:action,p_payload:payload});if(r.error)throw r.error;return r.data;}}));
