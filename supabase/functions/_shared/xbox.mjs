export const CLIENT_ID='74aebaec-1a84-4b69-b57c-7099fb1a42e5';
export const CALLBACK='https://rgafawpucqdhjrzodayl.supabase.co/functions/v1/xbox-callback';
export const ORIGIN='https://www.drunkyetistudio.com';
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const challenge=async s=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export async function authorizationURL(state,verifier){const u=new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');u.search=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:CALLBACK,response_mode:'query',scope:'XboxLive.signin',state,code_challenge:await challenge(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();return u.href;}
export function callbackResponse(req){
 const u=new URL(req.url),state=u.searchParams.get('state'),code=u.searchParams.get('code');
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 if(req.method!=='GET'||!state||!/^[a-f0-9]{64}$/.test(state))return new Response('Start Xbox connection from your signed-in Drunk Yeti account.',{status:400,headers});
 const p=new URLSearchParams({xbox_state:state});
 if(u.searchParams.has('error'))p.set('xbox_error','cancelled');
 else if(code&&code.length<8192)p.set('xbox_code',code);
 else return new Response('Invalid Xbox callback.',{status:400,headers});
 // Fragment avoids sending the one-use code to the website host. No provider token is exposed.
 return new Response(null,{status:303,headers:{...headers,Location:ORIGIN+'/account/#'+p}});
}
export async function exchangeXbox({code,verifier,secret,fetchImpl=fetch}){
 async function request(url,body,form=false){const r=await fetchImpl(url,{method:'POST',headers:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json','Accept':'application/json','x-xbl-contract-version':'1'},body:form?new URLSearchParams(body).toString():JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('provider_authorization_failed');return r.json();}
 const msa=await request('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{client_id:CLIENT_ID,client_secret:secret,code,code_verifier:verifier,redirect_uri:CALLBACK,grant_type:'authorization_code'},true);
 if(!msa.access_token)throw Error('invalid_provider_response');
 const ut=await request('https://user.auth.xboxlive.com/user/authenticate',{Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+msa.access_token},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'});
 if(!ut.Token)throw Error('invalid_provider_response');
 const xt=await request('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[ut.Token]},RelyingParty:'http://xboxlive.com',TokenType:'JWT'});
 const claims=xt.DisplayClaims?.xui;
 if(!xt.Token||claims?.length!==1||!/^\d{1,20}$/.test(claims[0].xid)||typeof claims[0].uhs!=='string'||claims[0].uhs!==ut.DisplayClaims?.xui?.[0]?.uhs)throw Error('invalid_provider_response');
 // Identity comes only from Microsoft's HTTPS response, never from browser-supplied claims.
 return {xuid:claims[0].xid,gamertag:String(claims[0].gtg||'').slice(0,64)};
}
export function createXboxHandler({clientFor,admin,secret,fetchImpl=fetch,now=()=>Date.now()}){return async req=>{
 const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS',...(origin===ORIGIN?{'Access-Control-Allow-Origin':origin}:{})};
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&origin!==ORIGIN)return reply(403,{error:'origin_denied'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
 try{
  const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return reply(401,{error:'sign_in_required'});
  const client=clientFor(auth),r=await client.auth.getUser(),user=r.data?.user;
  if(r.error||!user||user.is_anonymous)return reply(401,{error:'sign_in_required'});
  const scope=await client.rpc('dy_can_access',{p_scope:'profile'});if(scope.error||scope.data!==true)return reply(403,{error:'profile_scope_required'});
  const raw=await req.text();if(raw.length>16000)return reply(413,{error:'request_too_large'});let input;try{input=JSON.parse(raw)}catch{return reply(400,{error:'invalid_request'})}
  const owner=user.id;
  if(input.action==='status'){const q=await admin.from('dy_xbox_connections').select('gamertag,connected_at').eq('player_id',owner).maybeSingle();if(q.error)throw q.error;return reply(200,{connection:q.data,configured:!!secret});}
  if(input.action==='disconnect'){const p=await admin.from('dy_xbox_pending').delete().eq('player_id',owner);if(p.error)throw p.error;const q=await admin.from('dy_xbox_connections').delete().eq('player_id',owner);if(q.error)throw q.error;return reply(200,{disconnected:true});}
  if(!secret)return reply(503,{error:'xbox_not_configured'});
  if(input.action==='start'){
   if(!/^[a-f0-9]{64}$/.test(input.proof||''))return reply(400,{error:'invalid_request'});
   const last=await admin.from('dy_xbox_pending').select('created_at').eq('player_id',owner).maybeSingle();if(last.error)throw last.error;
   if(last.data&&now()-Date.parse(last.data.created_at)<30000)return reply(429,{error:'try_again_shortly'});
   const state=random(),verifier=random();
   const q=await admin.from('dy_xbox_pending').upsert({player_id:owner,state_hash:await digest(state),proof_hash:await digest(input.proof),verifier,created_at:new Date(now()).toISOString(),expires_at:new Date(now()+600000).toISOString()},{onConflict:'player_id'});if(q.error)throw q.error;
   return reply(200,{url:await authorizationURL(state,verifier),state});
  }
  if(input.action==='finish'){
   if(!/^[a-f0-9]{64}$/.test(input.state||'')||!/^[a-f0-9]{64}$/.test(input.proof||'')||typeof input.code!=='string'||!input.code||input.code.length>8192)return reply(400,{error:'invalid_request'});
   // Atomic DELETE RETURNING: one owner, one browser proof, one attempt, ten minutes.
   const pending=await admin.from('dy_xbox_pending').delete().eq('player_id',owner).eq('state_hash',await digest(input.state)).eq('proof_hash',await digest(input.proof)).gt('expires_at',new Date(now()).toISOString()).select('verifier').maybeSingle();
   if(pending.error)throw pending.error;if(!pending.data)return reply(409,{error:'connection_expired_or_changed'});
   let identity;try{identity=await exchangeXbox({code:input.code,verifier:pending.data.verifier,secret,fetchImpl})}catch{return reply(400,{error:'provider_authorization_failed'});}
   const fresh=await client.auth.getUser();if(fresh.error||fresh.data?.user?.id!==owner)return reply(401,{error:'session_changed'});
   const save=await admin.from('dy_xbox_connections').upsert({player_id:owner,...identity,connected_at:new Date(now()).toISOString()},{onConflict:'player_id'});
   if(save.error)return reply(save.error.code==='23505'?409:503,{error:save.error.code==='23505'?'xbox_already_connected':'connection_unavailable'});
   return reply(200,{connection:{gamertag:identity.gamertag,connected_at:new Date(now()).toISOString()}});
  }
  return reply(400,{error:'invalid_action'});
 }catch{return reply(503,{error:'connection_unavailable'});}
};}
