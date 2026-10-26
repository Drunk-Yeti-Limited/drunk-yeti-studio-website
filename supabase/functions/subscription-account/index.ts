import Stripe from 'npm:stripe@22.6.0';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createSubscriptionHandler} from '../_shared/subscription-core.mjs';
const key=Deno.env.get('STRIPE_SECRET_KEY')||'';
const stripe=/^(sk|rk)_(test|live)_/.test(key)?new Stripe(key,{apiVersion:'2026-08-26.dahlia'}):null;
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createSubscriptionHandler({stripe,livemode:/^(sk|rk)_live_/.test(key),admin,automaticTax:Deno.env.get('STRIPE_AUTOMATIC_TAX')==='true',
 userClient:(authorization:string)=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})}));
