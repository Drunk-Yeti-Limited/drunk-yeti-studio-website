import {SITE,checkoutURL} from './payment-core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=o=>typeof o==='string'?o:o?.id;
const check=r=>{if(r.error)throw Error('subscription_database_error');return r.data};
const stamp=n=>Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null;
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':SITE,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export function portalURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='billing.stripe.com'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function invoiceSubscription(invoice){return id(invoice.parent?.subscription_details?.subscription)||id(invoice.subscription)}
export async function syncSubscription(stripe,admin,subscriptionId,livemode){
 const fetched=new Date().toISOString();
 const sub=await stripe.subscriptions.retrieve(subscriptionId,{expand:['latest_invoice']});
 const request=sub.metadata?.yeti_subscription_request;
 if(!request)return null; // Unrelated business subscription.
 if(!uuid.test(request)||sub.livemode!==livemode)throw Error('subscription_mode_or_owner_mismatch');
 const items=sub.items?.data||[];
 if(items.length!==1||items[0].quantity!==1)throw Error('unsupported_subscription_items');
 const item=items[0],price=item.price;
 // Unsupported price changes suspend access via failed refresh, not an inferred entitlement.
 if(price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)throw Error('unsupported_billing_period');
 let invoice=sub.latest_invoice;
 if(typeof invoice==='string')invoice=await stripe.invoices.retrieve(invoice);
 const paid=invoice?.status==='paid'&&invoice.livemode===livemode&&invoiceSubscription(invoice)===sub.id&&invoice.currency===price.currency&&invoice.amount_paid>=price.unit_amount&&!sub.pause_collection;
 const end=Math.min(item.current_period_end||0,sub.cancel_at||Infinity);
 check(await admin.rpc('dy_subscription_sync',{p_request:request,p_subscription:sub.id,p_customer:id(sub.customer),p_price:id(price),p_live:livemode,p_status:sub.status,p_paid:!!paid,p_end:stamp(end),p_cancel:!!(sub.cancel_at_period_end||sub.cancel_at),p_fetched:fetched}));
 return sub;
}
export async function grantInvoice(stripe,admin,invoiceId,livemode,knownSub=null){
 const invoice=await stripe.invoices.retrieve(invoiceId);
 const sid=invoiceSubscription(invoice);
 if(!sid||invoice.status!=='paid')return;
 const sub=knownSub?.id===sid?knownSub:await syncSubscription(stripe,admin,sid,livemode);
 if(!sub)return;
 if(invoice.livemode!==livemode||id(invoice.customer)!==id(sub.customer))throw Error('invoice_mode_or_owner_mismatch');
 if(!['subscription_create','subscription_cycle'].includes(invoice.billing_reason))return;
 const price=id(sub.items.data[0].price);
 // Read all line items rather than trusting a possibly truncated embedded list.
 const result=await stripe.invoices.listLineItems(invoice.id,{limit:100});
 if(result.has_more)throw Error('unexpected_invoice_lines');
 const lines=result.data.filter(l=>id(l.pricing?.price_details?.price||l.price)===price&&!l.parent?.subscription_item_details?.proration&&!l.proration);
 if(lines.length!==1||lines[0].quantity!==1)throw Error('unexpected_subscription_line');
 const line=lines[0];
 check(await admin.rpc('dy_subscription_benefit',{p_subscription:sid,p_invoice:invoice.id,p_customer:id(invoice.customer),p_price:price,p_live:livemode,p_paid:true,p_amount:invoice.amount_paid,p_currency:invoice.currency,p_reason:invoice.billing_reason,p_start:stamp(line.period?.start),p_end:stamp(line.period?.end)}));
}
export async function subscriptionEvent(event,stripe,admin,livemode){
 if(event.type.startsWith('customer.subscription.')){
  const sub=await syncSubscription(stripe,admin,event.data.object.id,livemode);
  if(sub&&id(sub.latest_invoice))await grantInvoice(stripe,admin,id(sub.latest_invoice),livemode,sub);
 }else if(['invoice.paid','invoice.payment_failed','invoice.voided','invoice.marked_uncollectible','invoice.payment_action_required'].includes(event.type)){
  const invoice=await stripe.invoices.retrieve(event.data.object.id),sid=invoiceSubscription(invoice);
  if(sid){const sub=await syncSubscription(stripe,admin,sid,livemode);if(sub&&invoice.status==='paid')await grantInvoice(stripe,admin,invoice.id,livemode,sub);}
 }else if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
  const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
  if(session.mode==='subscription'&&session.metadata?.yeti_subscription_request&&id(session.subscription)){
   if(session.livemode!==livemode)throw Error('subscription_mode_mismatch');
   const sub=await syncSubscription(stripe,admin,id(session.subscription),livemode);
   if(sub&&id(sub.latest_invoice))await grantInvoice(stripe,admin,id(sub.latest_invoice),livemode,sub);
  }
 }else if(['charge.refunded','charge.dispute.created'].includes(event.type)){
  const charge=await stripe.charges.retrieve(event.type==='charge.refunded'?event.data.object.id:id(event.data.object.charge));
  if(charge.livemode!==livemode)throw Error('subscription_mode_mismatch');
  if(id(charge.customer))check(await admin.rpc('dy_subscription_hold',{p_customer:id(charge.customer),p_live:livemode,p_reason:event.type+':'+event.id}));
 }
}
// Recover missed renewal deliveries as well as the latest invoice. Receipts make
// the scan idempotent; no anniversary timer credits money without a paid invoice.
async function reconcileInvoices(stripe,admin,sub,livemode,credited){
 let after;
 do{
  const page=await stripe.invoices.list({subscription:sub.id,status:'paid',limit:100,...(after?{starting_after:after}:{})});
  for(const invoice of page.data){if(!credited.has(invoice.id)){await grantInvoice(stripe,admin,invoice.id,livemode,sub);credited.add(invoice.id);}}
  if(!page.has_more)break;
  const next=page.data.at(-1)?.id;if(!next||next===after)throw Error('invalid_invoice_pagination');after=next;
 }while(true);
}
export async function reconcilePlayer(stripe,admin,player,livemode){
 const context=check(await admin.rpc('dy_subscription_sync_context',{p_player:player}));
 const credited=new Set(context.benefit_invoices||[]);
 for(const pending of context.pending||[]){
  if(pending.livemode!==livemode)continue;
  const session=await stripe.checkout.sessions.retrieve(pending.session_id);
  if(session.mode==='subscription'&&id(session.subscription)){
   if(session.livemode!==livemode||session.metadata?.yeti_subscription_request!==pending.id||session.client_reference_id!==player)throw Error('checkout_owner_mismatch');
   const sub=await syncSubscription(stripe,admin,id(session.subscription),livemode);
   if(sub)await reconcileInvoices(stripe,admin,sub,livemode,credited);
  }
 }
 for(const s of context.subscriptions||[]){
  if(s.livemode!==livemode||Date.now()-Date.parse(s.verified_at)<300000)continue;
  // Refresh terminal states too, but only on explicit account access (no global polling bill).
  const sub=await syncSubscription(stripe,admin,s.stripe_id,livemode);
  if(sub)await reconcileInvoices(stripe,admin,sub,livemode,credited);
 }
 return check(await admin.rpc('dy_subscription_sync_context',{p_player:player}));
}
export function createSubscriptionHandler({stripe,livemode,admin,userClient,automaticTax=false}){
 return async req=>{
 const origin=req.headers.get('Origin');if(origin&&origin!==SITE)return reply({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 const authorization=req.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'sign_in_required'},401);
 try{
 const raw=await req.text();if(raw.length>2048)return reply({error:'request_too_large'},413);
 let input;try{input=JSON.parse(raw)}catch{return reply({error:'invalid_request'},400)}
 if(!['status','access','checkout','portal'].includes(input?.action))return reply({error:'invalid_request'},400);
 if(['checkout','portal'].includes(input.action)&&origin!==SITE)return reply({error:'use_website_for_billing'},403);
 if(input.action==='access'&&(typeof input.product_id!=='string'||!/^[a-z0-9-]{1,64}$/.test(input.product_id)))return reply({error:'invalid_product'},400);
 const client=userClient(authorization);const auth=await client.auth.getUser(authorization.slice(7));
 if(auth.error||!auth.data?.user)return reply({error:'sign_in_required'},401);
 const player=auth.data.user.id;
 // Scope/guest/deleted-account validation precedes any service-role or Stripe work.
 if(input.action==='access')check(await client.rpc('dy_app_access',{p_product:input.product_id}));
 else check(await client.rpc('dy_subscription_status'));
 let context=null,reconcileFailed=false;
 if(stripe){try{context=await reconcilePlayer(stripe,admin,player,livemode)}catch{reconcileFailed=true;}}
 if(input.action==='access')return reply(check(await client.rpc('dy_app_access',{p_product:input.product_id})));
 if(input.action==='status')return reply({schema_version:1,catalog:check(await client.rpc('dy_subscription_catalog')),membership:check(await client.rpc('dy_subscription_status')),sync_pending:reconcileFailed});
 if(!stripe||reconcileFailed)return reply({error:'billing_temporarily_unavailable'},503);
 if(input.action==='portal'){
  const s=(context.subscriptions||[]).filter(s=>s.livemode===livemode).sort((a,b)=>Date.parse(b.verified_at)-Date.parse(a.verified_at))[0];
  if(!s||!context.portal_configuration)return reply({error:'no_manageable_subscription'},409);
  const portal=await stripe.billingPortal.sessions.create({customer:s.customer_id,configuration:context.portal_configuration,return_url:SITE+'/account/?membership=returned'});
  const url=portalURL(portal.url);if(!url)throw Error('invalid_portal');return reply({url});
 }
 const order=check(await client.rpc('dy_subscription_prepare'));
 if(order.player_id!==player||order.livemode!==livemode)throw Error('checkout_mode_mismatch');
 if(order.session_id){const old=await stripe.checkout.sessions.retrieve(order.session_id);if(old.status!=='open'||!checkoutURL(old.url))return reply({error:'checkout_closed_refresh'},409);return reply({url:checkoutURL(old.url)});}
 const price=await stripe.prices.retrieve(order.stripe_price);
 if(!price.active||price.livemode!==livemode||price.unit_amount!==order.amount_cents||price.currency!==order.currency||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)throw Error('price_mismatch');
 const metadata={yeti_subscription_request:order.id};
 const session=await stripe.checkout.sessions.create({mode:'subscription',integration_identifier:'yeti-frostpass-xhqtbmlk',client_reference_id:player,metadata,subscription_data:{metadata},
 line_items:[{price:order.stripe_price,quantity:1}],automatic_tax:{enabled:automaticTax},
 success_url:SITE+'/account/?membership=returned',cancel_url:SITE+'/account/?membership=cancelled',expires_at:Math.floor(Date.parse(order.expires_at)/1000)},
 {idempotencyKey:'yeti-frostpass-'+order.id});
 if(session.livemode!==livemode||!checkoutURL(session.url))throw Error('invalid_checkout');
 check(await admin.rpc('dy_subscription_bind',{p_request:order.id,p_session:session.id}));
 return reply({url:checkoutURL(session.url)});
 }catch{return reply({error:'subscription_request_failed_refresh_or_manage_existing'},409)}
 };
}
