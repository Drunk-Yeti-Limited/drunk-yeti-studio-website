import assert from 'node:assert/strict';
import {createNewsletterWorker,newsletterHTML} from '../../supabase/functions/_shared/newsletter-worker.mjs';
const config={enabled:true,folder_id:1,postal_address:'<Address>',sender_email:'newsletter@drunkyetistudio.com',sender_name:'Drunk Yeti Studio',reply_to:'reply@example.invalid'};
const campaign={subject:'Test <script>',body:'Hello <img>\n\nNews'};
assert(!newsletterHTML(campaign,config).includes('<script>'));assert(newsletterHTML(campaign,config).includes('{{ unsubscribe }}'));
let calls=[],network=[],sendStatus=204,blocked=true;
const rpc=async(action,payload)=>{calls.push({action,payload});return action==='claim'?{job:{id:'j',lease:'l'},campaign,config,emails:['a@example.invalid','b@example.invalid']}:{};};
const fake=async(url,options)=>{network.push({url,options});if(url.endsWith('/sendNow'))return new Response(null,{status:sendStatus});if(options.method==='GET')return Response.json({emailBlacklisted:blocked&&url.includes('b%40')});if(url.endsWith('/lists')||url.endsWith('/emailCampaigns'))return Response.json({id:7},{status:201});return new Response(null,{status:204});};
const handler=createNewsletterWorker({rpc,apiKey:'test',workerSecret:'worker',fetchImpl:fake});
assert.equal((await handler(new Request('https://test',{method:'POST'}))).status,401);assert.equal(calls.length,0);
const req=()=>new Request('https://test',{method:'POST',headers:{'x-newsletter-worker':'worker'}});
let r=await handler(req());assert.equal((await r.json()).submitted,1);assert.deepEqual(calls.map(c=>c.action),['claim','dispatch','submitted']);assert(!JSON.stringify(network).includes('emailBlacklisted'));
assert(network.some(x=>x.url.endsWith('/emailCampaigns/7/sendNow')));assert(!network.some(x=>x.url.includes('/smtp/')));
for(const [status,action,reason] of [[402,'retry','credits_exhausted'],[429,'retry','rate_limited'],[500,'review','dispatch_outcome_unknown']]){calls=[];sendStatus=status;await handler(req());assert.equal(calls.at(-1).action,action);assert.equal(calls.at(-1).payload.reason,reason);}
console.log('PASS worker authentication, escaped content, provider suppression, native marketing API, quota retries and ambiguous-send hold');
