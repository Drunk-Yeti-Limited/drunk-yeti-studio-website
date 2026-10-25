import Stripe from 'npm:stripe@22.6.0';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createWebhookHandler} from '../_shared/payment-core.mjs';
const key=Deno.env.get('STRIPE_SECRET_KEY')||'';
const stripe=/^(sk|rk)_(test|live)_/.test(key)?new Stripe(key,{apiVersion:'2026-08-26.dahlia'}):null;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
// No user JWT: Stripe's signature authenticates the unmodified request body.
// Fulfillment continues while checkout is paused, so paid orders can complete.
const handler=createWebhookHandler({stripe,webhookSecret:Deno.env.get('STRIPE_WEBHOOK_SECRET'),livemode:/^(sk|rk)_live_/.test(key),cryptoProvider:Stripe.createSubtleCryptoProvider()});
Deno.serve((req:Request)=>handler(req,admin));
