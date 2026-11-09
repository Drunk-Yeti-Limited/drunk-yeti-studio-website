const key='yeti.xbox.pending';
const messages={provider_authorization_failed:'Microsoft or Xbox did not authorize the connection. Check that your Microsoft account has an Xbox profile, then try again.',xbox_already_connected:'This Xbox account is already connected to another Drunk Yeti account.',connection_expired_or_changed:'The connection expired or was already used. Select Connect Xbox again.',try_again_shortly:'Wait 30 seconds before trying again.',xbox_not_configured:'Xbox connection setup is not finished yet.'};
export function captureXboxReturn(){const p=new URLSearchParams((location.hash||'').slice(1));if(!p.has('xbox_state'))return null;const result={state:p.get('xbox_state'),code:p.get('xbox_code'),error:p.get('xbox_error')};globalThis.history?.replaceState(null,'',location.pathname+'#social');return result;}
export function xboxPanel({sb,getUser,returned}){
 let completing=false,notice='';
 const make=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
 async function call(owner,body){const {data,error}=await sb.auth.getSession();if(error||data?.session?.user?.id!==owner)throw Error('Your session changed. Sign in again.');const token=data.session.access_token;const fresh=await sb.auth.getUser(token);if(fresh.error||fresh.data?.user?.id!==owner)throw Error('Sign in again before connecting Xbox.');const r=await sb.functions.invoke('xbox-link',{body,headers:{Authorization:'Bearer '+token}});if(r.error){let code;try{code=(await r.error.context.json()).error}catch{}throw Error(messages[code]||'Xbox connection is unavailable. Please try again.');}if(r.data?.error)throw Error(messages[r.data.error]||'Xbox connection is unavailable.');return r.data;}
 return async function render(root){
  if(!root)return;const owner=getUser()?.id;if(!owner){root.replaceChildren();return;}
  const current=()=>getUser()?.id===owner;
  try{
   if(returned&&!completing){completing=true;const result=returned;returned=null;let pending;try{pending=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}sessionStorage.removeItem(key);
    if(!pending||pending.owner!==owner||pending.state!==result.state||Date.now()-pending.at>600000)notice='Xbox connection could not be verified for this account. Please try again.';
    else if(result.error)notice='Xbox connection was cancelled. Your account is unchanged.';
    else{try{await call(owner,{action:'finish',state:result.state,code:result.code,proof:pending.proof});notice='Xbox connected to your Drunk Yeti account.';}catch(e){notice=e.message;}}completing=false;
   }
   if(completing)return;
   const data=await call(owner,{action:'status'});if(!current())return;
   const card=make('div','');card.className='social-row connection-card';card.append(make('strong','Xbox'),make('p',data.connection?'Connected · '+(data.connection.gamertag||'Verified Xbox account'):'Not connected'));
   card.append(make('small','Verified gaming identity. Continue using your existing Drunk Yeti sign-in. Game saves and achievements require support in each game.'));
   const b=make('button',data.connection?'Disconnect Xbox':'Connect Xbox');b.type='button';b.className='secondary';b.disabled=!data.connection&&!data.configured;
   b.onclick=async()=>{if(!current())return;b.disabled=true;try{
    if(data.connection){if(!globalThis.confirm('Disconnect Xbox? Your Drunk Yeti saves and purchases will stay on this account.'))return;await call(owner,{action:'disconnect'});sessionStorage.removeItem(key);notice='Xbox disconnected.';}
    else{const proof=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(key,JSON.stringify({owner,proof,at:Date.now()}));const start=await call(owner,{action:'start',proof});if(!current())return;const url=new URL(start.url);if(url.origin!=='https://login.microsoftonline.com'||url.pathname!=='/consumers/oauth2/v2.0/authorize')throw Error('Invalid Xbox sign-in destination.');sessionStorage.setItem(key,JSON.stringify({owner,proof,state:start.state,at:Date.now()}));location.assign(url.href);return;}
   }catch(e){notice=e.message;}finally{if(current()){b.disabled=false;await render(root);}}};card.append(b);if(notice){const p=make('p',notice);p.setAttribute('role','status');card.append(p);}root.replaceChildren(card);
  }catch(e){if(current())root.replaceChildren(make('p',e.message));}
 };
}
