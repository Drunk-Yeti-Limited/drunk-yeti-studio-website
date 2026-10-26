export const SITE='https://www.drunkyetistudio.com';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function checkoutURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.username&&!u.password?u.href:null}catch{return null}}
const response=(body,status=200,cors=false)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(cors?{'Access-Control-Allow-Origin':SITE,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})}});
const checked=r=>{if(r.error)throw Error('database_request_failed');return r.data};
export function createCheckoutHandler({mode,stripe,userClient,admin,automaticTax=false}){
 return async req=>{
 const origin=req.headers.get('Origin');if(origin!==SITE)return response({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}});
 if(req.method!=='POST')return response({error:'method_not_allowed'},405,true);
 if(!['test','live'].includes(mode)||!stripe)return response({error:'payments_not_ready'},503,true);
 const authorization=req.headers.get('Authorization')||'';if(!authorization.startsWith('Bearer '))return response({error:'sign_in_required'},401,true);
 try{
 const text=await req.text();if(text.length>2048)return response({error:'request_too_large'},413,true);
 let input;try{input=JSON.parse(text)}catch{return response({error:'invalid_request'},400,true)}
 if(!input||typeof input.pack_id!=='string'||input.pack_id.length>80||!Number.isInteger(input.version)||!uuid.test(input.request_id||''))return response({error:'invalid_request'},400,true);
 const client=userClient(authorization),auth=await client.auth.getUser(authorization.slice(7));
 if(auth.error||!auth.data?.user)return response({error:'sign_in_required'},401,true);
 const order=checked(await client.rpc('dy_checkout_prepare',{p_pack:input.pack_id,p_version:input.version,p_request:input.request_id}));
 if(order.player_id!==auth.data.user.id||order.livemode!==(mode==='live'))return response({error:'checkout_mode_mismatch'},409,true);
 if(order.status!=='created'&&order.status!=='open')return response({error:'order_already_completed'},409,true);
 if(order.stripe_session){
 const old=await stripe.checkout.sessions.retrieve(order.stripe_session);
 if(old.status!=='open'||!checkoutURL(old.url))return response({error:'checkout_expired_use_new_request'},409,true);
 return response({url:checkoutURL(old.url),order_id:order.id,mode},200,true);
 }
 const session=await stripe.checkout.sessions.create({
 mode:'payment',integration_identifier:'yeti-shards-web-hqvnlzma',client_reference_id:order.player_id,
 metadata:{yeti_order_id:order.id},payment_intent_data:{metadata:{yeti_order_id:order.id}},
 line_items:[{quantity:1,price_data:{currency:order.currency,unit_amount:order.amount_cents,tax_behavior:'exclusive',product_data:{name:order.title,description:'Purchased Yeti Shards for supported Drunk Yeti account unlocks. No cash value; not casino coins.'}}}],
 automatic_tax:{enabled:automaticTax},
 success_url:SITE+'/account/?payment=returned',cancel_url:SITE+'/account/?payment=cancelled',
 expires_at:Math.floor(Date.parse(order.created_at)/1000)+3600
 },{idempotencyKey:'yeti-checkout-'+order.id});
 if(!checkoutURL(session.url)||session.livemode!==order.livemode)throw Error('invalid_checkout_response');
 checked(await admin.rpc('dy_checkout_bind',{p_order:order.id,p_session:session.id,p_url:session.url}));
 return response({url:checkoutURL(session.url),order_id:order.id,mode},200,true);
 }catch{return response({error:'checkout_unavailable_try_again'},409,true)}
 };
}
export function createWebhookHandler({stripe,webhookSecret,livemode,cryptoProvider,onSubscriptionEvent=null}){
 return async(req,admin)=>{
 if(req.method!=='POST')return response({error:'method_not_allowed'},405);
 if(!stripe||!webhookSecret)return response({error:'webhook_not_configured'},503);
 let event;
 try{const raw=await req.text();if(raw.length>1_000_000)return response({error:'payload_too_large'},413);event=await stripe.webhooks.constructEventAsync(raw,req.headers.get('Stripe-Signature')||'',webhookSecret,300,cryptoProvider)}catch{return response({error:'invalid_signature'},400)}
 if(event.livemode!==livemode)return response({error:'mode_mismatch'},400);
 try{
 if(onSubscriptionEvent)await onSubscriptionEvent(event,admin);
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
 const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
 const order=session.metadata?.yeti_order_id;
 if(!order)return response({received:true}); // Other products on the Stripe account.
 if(!uuid.test(order)||session.livemode!==livemode||session.mode!=='payment')return response({error:'invalid_session'},400);
 if(session.payment_status!=='paid')return response({received:true,pending:true});
 const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 checked(await admin.rpc('dy_checkout_fulfill',{p_order:order,p_session:session.id,p_intent:intent,p_subtotal:session.amount_subtotal,p_total:session.amount_total,p_currency:session.currency,p_live:session.livemode}));
 }else if(['charge.refunded','charge.dispute.created'].includes(event.type)){
 const id=event.type==='charge.refunded'?event.data.object.id:event.data.object.charge;
 const charge=await stripe.charges.retrieve(typeof id==='string'?id:id.id);
 if(charge.livemode!==livemode)return response({error:'mode_mismatch'},400);
 const intent=await stripe.paymentIntents.retrieve(typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent.id);
 const order=intent.metadata?.yeti_order_id;if(!order)return response({received:true});
 if(!uuid.test(order))return response({error:'invalid_order'},400);
 checked(await admin.rpc('dy_payment_review',{p_order:order,p_event:event.id,p_intent:intent.id,p_live:livemode,p_kind:event.type==='charge.refunded'?'refund':'dispute'}));
 }
 return response({received:true});
 }catch{return response({error:'processing_failed_retry'},500)}
 };
}
