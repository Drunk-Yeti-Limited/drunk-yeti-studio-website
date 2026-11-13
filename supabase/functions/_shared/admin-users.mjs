const origins=new Set(['https://www.drunkyetistudio.com','https://drunkyetistudio.com']);
const actions=new Set(['profile','reset_password','set_password','suspend','restore','revoke_sessions','delete']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages={studio_admin_required:'Studio administrator access required.',live_session_required:'Sign in again to continue.',protected_account:'Owner accounts and your own account cannot be managed here. Admins cannot change other staff accounts.',owner_required:'Only an owner can set a password directly.',billing_review_required:'This account has purchase or subscription records. Review billing and retention before deletion; you can suspend access now.',confirmation_required:'Type the exact account email to confirm deletion.',reason_required:'Enter a reason of 3–500 characters.',profile_invalid:'Use a valid username and a display name of 1–48 characters.',account_not_found:'The selected account no longer exists.',username_taken:'That username is already in use.',reset_cooldown:'Wait one minute before another recovery email.',account_action_pending:'A recent action is still pending. Refresh the audit log before retrying.'};
export function createAdminUsersHandler({admin,authClient}){
 return async req=>{
  const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.has(origin))return reply(403,{error:'Origin not allowed.'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'Use POST.'});
  let auditId,actor;
  try{
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply(401,{error:'Sign in to continue.'});
   const identity=await admin.auth.getUser(token);if(identity.error||!identity.data.user)return reply(401,{error:'Sign in again to continue.'});actor=identity.data.user.id;
   // Claims are read only after the Auth service has verified this exact token.
   const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   if(claims.client_id||!uuid.test(claims.session_id||''))return reply(403,{error:'Use the studio website session.'});
   const raw=await req.text();if(raw.length>8192)return reply(413,{error:'Request too large.'});
   const body=JSON.parse(raw);if(!actions.has(body.action)||!uuid.test(body.target||''))return reply(400,{error:'Choose a valid account and action.'});
   if(body.action==='set_password'&&(typeof body.password!=='string'||body.password.length<12||body.password.length>128))return reply(400,{error:'Use a password of 12–128 characters.'});
   const safe={reason:body.reason,handle:body.handle,display_name:body.display_name,confirmation:body.confirmation};
   const prepared=await admin.rpc('dy_admin_user_prepare',{p_actor:actor,p_session:claims.session_id,p_target:body.target,p_action:body.action,p_payload:safe});
   if(prepared.error)return reply(403,{error:messages[prepared.error.message]||'This account action is unavailable.'});
   auditId=prepared.data.audit_id;
   let result={error:null};
   if(body.action==='delete')result=await admin.auth.admin.deleteUser(body.target);
   if(body.action==='set_password')result=await admin.auth.admin.updateUserById(body.target,{password:body.password});
   if(body.action==='suspend')result=await admin.auth.admin.updateUserById(body.target,{ban_duration:'876000h'});
   if(body.action==='restore')result=await admin.auth.admin.updateUserById(body.target,{ban_duration:'none'});
   if(body.action==='reset_password')result=await authClient.auth.resetPasswordForEmail(prepared.data.email,{redirectTo:'https://www.drunkyetistudio.com/account/'});
   const recorded=await admin.rpc('dy_admin_user_finish',{p_actor:actor,p_audit:auditId,p_success:!result.error});
   if(result.error)return reply(409,{error:'The provider could not complete the action. Check the audit log and retry after resolving email, storage ownership, or password requirements.'});
   return reply(200,{ok:true,action:body.action,audit_recorded:!recorded.error,message:recorded.error?'Action completed; its audit entry needs review.':'Action completed and recorded.'});
  }catch{
   if(auditId)await admin.rpc('dy_admin_user_finish',{p_actor:actor,p_audit:auditId,p_success:false});
   return reply(400,{error:'Unable to complete the request. Refresh the account and try again.'});
  }
 };
}
