export async function mountAccountActions(sb,document){
const $=id=>document.getElementById(id),kind=document.body.dataset.action;
async function run(){
 const r=await sb.auth.getUser();const owner=r.data?.user?.id;
 if(r.error||!owner){$('login').hidden=false;$('status').textContent='Sign in to manage your own account securely.';return;}
 $('identity').textContent=r.data.user.email||'Your connected account';
 const rpc=async(name,args)=>{const fresh=await sb.auth.getUser();if(fresh.error||fresh.data?.user?.id!==owner)throw Error('Your account changed. Reload this page.');const result=await sb.rpc(name,args);if(result.error)throw Error('Unable to save right now. Please try again.');return result.data;};
 if(kind==='unsubscribe'){
  $('action').hidden=false;
  $('action').onsubmit=async e=>{e.preventDefault();$('submit').disabled=true;try{await rpc('dy_newsletter_set',{p_subscribed:false});$('action').hidden=true;$('status').textContent='You are unsubscribed from the monthly Drunk Yeti newsletter. Your account and games are unchanged.';}catch(e){$('status').textContent=e.message;$('submit').disabled=false;}};
  $('status').textContent='Select Unsubscribe to stop monthly studio news.';
 }else{
  const state=await rpc('dy_deletion_request_status');
  if(state.requested){$('status').textContent='Your deletion request is recorded and awaiting studio review. It has not yet been completed.';return;}
  $('action').hidden=false;
  $('action').onsubmit=async e=>{e.preventDefault();if($('confirmation').value!=='DELETE'){$('status').textContent='Type DELETE to confirm your request.';return;}$('submit').disabled=true;
   try{await rpc('dy_request_deletion');$('action').hidden=true;$('status').textContent='Your deletion request is recorded. Newsletter enrollment has stopped and connected account access is restricted while the studio reviews the request. Deletion is not yet complete.';}catch(e){$('status').textContent=e.message;$('submit').disabled=false;}};
  $('status').textContent='No deletion request is pending.';
 }
}
await run().catch(()=>{$('status').textContent='Account settings are temporarily unavailable. Please reload and try again.';});
}
