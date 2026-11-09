export function escapeHTML(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function newsletterHTML(campaign,config){
 return '<!doctype html><html><body style="margin:0;background:#eef4fa;font-family:Arial,sans-serif;color:#182d45"><div style="max-width:620px;margin:auto;padding:32px"><h2>DRUNK YETI STUDIO</h2><h1>'+escapeHTML(campaign.subject)+'</h1>'+campaign.body.split(/\n\s*\n/).map(p=>'<p style="line-height:1.7;white-space:pre-wrap">'+escapeHTML(p)+'</p>').join('')+'<hr><p>'+escapeHTML(config.postal_address)+'</p><p><a href="{{ unsubscribe }}">Unsubscribe</a> · <a href="https://www.drunkyetistudio.com/account/">Your account</a></p></div></body></html>';
}
export function createNewsletterWorker({rpc,apiKey,workerSecret,fetchImpl=fetch}){
 const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const api=async(path,method='GET',body)=>{
  const r=await fetchImpl('https://api.brevo.com/v3'+path,{method,headers:{'api-key':apiKey,'content-type':'application/json',accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok){const error=new Error('brevo_'+r.status);error.status=r.status;throw error;}
  if(r.status===204)return {};return await r.json();
 };
 return async req=>{
  if(req.method!=='POST')return response(405,{error:'method_not_allowed'});
  if(!workerSecret||req.headers.get('x-newsletter-worker')!==workerSecret)return response(401,{error:'worker_authentication_required'});
  if(!apiKey)return response(503,{error:'brevo_connection_required'});
  let claim;try{claim=await rpc('claim',{});}catch{return response(503,{error:'queue_unavailable'});}
  if(!claim.job)return response(200,claim);
  const {job,campaign,config}=claim;const identity={id:job.id,lease:job.lease};let dispatching=false;
  const step=(action,payload={})=>rpc(action,{...identity,...payload});
  try{
   if(!config.enabled||!config.folder_id||!config.postal_address||!/^newsletter@drunkyetistudio\.com$/i.test(config.sender_email))throw Error('sender_setup_required');
   if(!claim.emails.length){await step('skip');return response(200,{skipped:true});}
   const list=await api('/contacts/lists','POST',{name:'DY '+job.id,folderId:config.folder_id});
   const emails=[];
   // Small bounded batches; preserve provider opt-outs. Never set emailBlacklisted=false.
   for(let i=0;i<claim.emails.length;i+=5){
    await Promise.all(claim.emails.slice(i,i+5).map(async email=>{
     let contact;try{contact=await api('/contacts/'+encodeURIComponent(email));}catch(e){if(e.status!==404)throw e;}
     if(contact?.emailBlacklisted)return;
     if(contact)await api('/contacts/'+encodeURIComponent(email),'PUT',{listIds:[list.id]});
     else await api('/contacts','POST',{email,listIds:[list.id]});
     emails.push(email);
    }));
   }
   if(!emails.length){await step('skip');return response(200,{skipped:true});}
   const created=await api('/emailCampaigns','POST',{name:'DY '+job.id,type:'classic',subject:campaign.subject,sender:{name:config.sender_name,email:config.sender_email},replyTo:config.reply_to,htmlContent:newsletterHTML(campaign,config),recipients:{listIds:[list.id]}});
   // Persist ID and recheck local consent immediately before handing off to Brevo.
   await step('dispatch',{provider_id:created.id,emails});dispatching=true;
   await api('/emailCampaigns/'+created.id+'/sendNow','POST');
   await step('submitted');return response(200,{submitted:emails.length});
  }catch(error){
   let action='review',reason='provider_or_configuration_error';
   if(error.status===402){action='retry';reason='credits_exhausted';}
   else if(error.status===429){action='retry';reason='rate_limited';}
   else if(!dispatching&&(error.name==='TimeoutError'||error.name==='TypeError'||/audience_changed|dispatch_not_allowed/.test(String(error.message)))){action='retry';reason='preparation_retry';}
   else if(dispatching)reason='dispatch_outcome_unknown';
   try{await step(action,{reason});}catch{}
   return response(200,{status:action,reason});
  }
 };
}
