const endpoints={google:'https://openidconnect.googleapis.com/v1/userinfo',discord:'https://discord.com/api/v10/users/@me',github:'https://api.github.com/user'};
export const subjectFor=i=>String(i?.provider_id||i?.identity_data?.sub||'');
const short=v=>String(v||'').slice(0,128);
export function normalizeProviderProfile(provider,data){
 const subject=String(provider==='google'?data.sub:data.id||'');
 if(!subject||subject.length>255)throw Error('invalid_provider_response');
 let avatar=provider==='discord'&&data.avatar&&/^[a-zA-Z0-9_]+$/.test(data.avatar)&&/^\d+$/.test(subject)?`https://cdn.discordapp.com/avatars/${subject}/${data.avatar}.png`:data.picture||data.avatar_url||null;
 if(avatar){try{const u=new URL(avatar);if(u.protocol!=='https:'||!['cdn.discordapp.com','avatars.githubusercontent.com','lh3.googleusercontent.com','lh4.googleusercontent.com','lh5.googleusercontent.com','lh6.googleusercontent.com'].includes(u.hostname))avatar=null;}catch{avatar=null}}
 return {provider,provider_subject:subject,display_name:short(data.global_name||data.name||data.username||data.login),username:short(data.username||data.login),avatar_url:avatar};
}
export function createProfileSyncHandler({userClient,admin,fetchImpl=fetch,now=()=>Date.now()}){
 return async req=>{
  const origin=req.headers.get('origin');const allowed=!origin||origin==='https://www.drunkyetistudio.com';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowed&&origin?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(!allowed)return reply(403,{error:'origin_denied'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  try{
   const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return reply(401,{error:'sign_in_required'});
   const client=userClient(auth),userResult=await client.auth.getUser();const user=userResult.data?.user;
   if(userResult.error||!user||user.is_anonymous)return reply(401,{error:'sign_in_required'});
   const access=await client.rpc('dy_can_access',{p_scope:'profile'});if(access.error||access.data!==true)return reply(403,{error:'profile_scope_required'});
   const body=await req.text();if(body.length>20000)return reply(413,{error:'request_too_large'});
   let input;try{input=JSON.parse(body)}catch{return reply(400,{error:'invalid_request'})}
   const {provider,provider_token:token}=input;
   if(!Object.hasOwn(endpoints,provider)||typeof token!=='string'||!token||token.length>16000)return reply(400,{error:'provider_authorization_required'});
   const identity=user.identities?.find(i=>i.provider===provider);if(!identity)return reply(403,{error:'connect_provider_first'});
   const previous=await admin.from('dy_connected_profiles').select('synced_at').eq('player_id',user.id).eq('provider',provider).maybeSingle();
   if(previous.error)return reply(503,{error:'sync_unavailable'});
   if(previous.data&&now()-Date.parse(previous.data.synced_at)<30000)return reply(429,{error:'try_again_shortly'});
   const response=await fetchImpl(endpoints[provider],{headers:{Authorization:'Bearer '+token,Accept:'application/json','User-Agent':'DrunkYeti-ProfileSync'},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return reply(response.status===429?429:401,{error:'provider_reauthorization_required'});
   const profile=normalizeProviderProfile(provider,await response.json());
   if(profile.provider_subject!==subjectFor(identity))return reply(403,{error:'provider_account_mismatch'});
   // Recheck the authenticated user after the network call, before recording the result.
   const fresh=await client.auth.getUser();if(fresh.error||fresh.data?.user?.id!==user.id||!fresh.data.user.identities?.some(i=>i.provider===provider&&subjectFor(i)===profile.provider_subject))return reply(403,{error:'connection_changed'});
   const snapshot={...profile,player_id:user.id,synced_at:new Date(now()).toISOString()};
   const saved=await admin.from('dy_connected_profiles').upsert(snapshot,{onConflict:'player_id,provider'});
   if(saved.error)return reply(503,{error:'sync_unavailable'});
   return reply(200,{profile:snapshot});
  }catch{return reply(503,{error:'sync_unavailable'});}
 };
}
