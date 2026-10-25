import {renderPayments,stripeCheckoutURL} from './payments.js';
import {readManifest,readAccount,readRevision,loginMethods,watchAccount} from '../sdk/account-client.js';
import {renderWorld} from './world.js';
import {avatars,avatarFor,showAvatar,setAvatarCatalog} from './avatars.js';
import {launch} from './config.js';
import {allowedRedirect,consentScopes} from './security.js';
import {createClient} from '@supabase/supabase-js';
const URL='https://rgafawpucqdhjrzodayl.supabase.co', KEY='sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy';
const sb=createClient(URL,KEY,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id),message=text=>$('status').textContent=text;
let user=null,signup=false,generation=0,authorizationId=new URLSearchParams(location.search).get('authorization_id'),consentDetails=null;
const callback=()=>new globalThis.URL('./',location.href).href.split('?')[0].split('#')[0];
const check=r=>{if(r.error)throw r.error;return r.data};
let selectedAvatar='yeti',platformManifest=null,platformAccount=null,platformSequence=0,avatarDirty=false;
function selectAvatar(id){selectedAvatar=avatarFor(id).id;for(const radio of document.querySelectorAll('input[name="avatar"]'))radio.checked=radio.value===selectedAvatar;}
function renderAvatarOptions(){
 const selected=selectedAvatar;$('avatar-options').replaceChildren();

for(const avatar of avatars){
 const label=document.createElement('label'),radio=document.createElement('input'),picture=document.createElement('span'),name=document.createElement('span');
 label.className='avatar-option';radio.type='radio';radio.name='avatar';radio.value=avatar.id;radio.setAttribute('aria-label',avatar.name);picture.className='avatar-picture';picture.setAttribute('aria-hidden','true');showAvatar(picture,avatar.id);name.textContent=avatar.name;
 radio.onchange=()=>{if(radio.checked){avatarDirty=true;selectAvatar(avatar.id)}};
 const owned=avatar.free!==false||(platformAccount?.unlocks||[]).some(u=>u.game_id==='yeti-account'&&u.item_id==='avatar:'+avatar.id);radio.disabled=!owned;if(!owned)name.textContent+=' · Locked';label.append(radio,picture,name);$('avatar-options').append(label);
}
selectAvatar(selected);
}
renderAvatarOptions();selectAvatar('yeti');showAvatar($('account-avatar'),'yeti');
function safeRedirect(value){location.assign(allowedRedirect(value));}
async function action(fn){const buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);try{await fn()}catch(e){message(e.status===429?'Too many attempts. Please wait and try again.':e.message||'Could not complete the request. Try again.')}finally{buttons.forEach(([b,disabled])=>b.disabled=disabled)}}
function item(title,description){const el=document.createElement('div');el.className='item';const h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=description;el.append(h,p);return el}
function button(parent,label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=()=>action(fn);parent.append(b)}
function tab(name){document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==name);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===name))}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('mode').onclick=()=>{signup=!signup;$('auth-title').textContent=signup?'Create an account':'Sign in';$('submit').textContent=signup?'Create account':'Sign in';$('mode').textContent=signup?'Already have an account?':'Create an account';$('password').autocomplete=signup?'new-password':'current-password';$('password').minLength=signup?12:1;$('confirm-row').hidden=!signup;$('signup-help').hidden=!signup;$('confirm-password').required=signup;$('confirm-password').value='';$('password').value=''};
$('auth-form').onsubmit=e=>{e.preventDefault();action(async()=>{if(signup&&$('password').value!==$('confirm-password').value)throw Error('Your passwords do not match.');if(signup&&(!launch.registration||!launch.emailCallbacks))throw Error('Account creation is being prepared. Email verification is not available yet; no account has been created.');const email=$('email').value.trim(),password=$('password').value;const r=signup?await sb.auth.signUp({email,password,options:{emailRedirectTo:callback()}}):await sb.auth.signInWithPassword({email,password});check(r);$('password').value='';$('confirm-password').value='';message(signup?'Check your inbox and spam folder for your confirmation email. Open the link in this browser, then sign in.':'Signed in.');await refresh()})};
$('forgot').onclick=()=>action(async()=>{if(!launch.emailCallbacks){message('Recovery emails are not ready yet. Please try again after account setup is complete.');return}if(!$('email').reportValidity())return;check(await sb.auth.resetPasswordForEmail($('email').value.trim(),{redirectTo:callback()}));message('If that address has an account, a recovery email will arrive. Keep this browser available for the recovery link.')});
async function refresh(){const mine=++generation;const {data,error}=await sb.auth.getUser();if(mine!==generation)return;user=error?null:data.user;platformSequence++;platformAccount=null;avatarDirty=false;$('world-sections').replaceChildren();$('payment-shop').replaceChildren();$('payment-status').textContent='';$('world-status').textContent='';$('auth').hidden=!!user;$('dashboard').hidden=true;$('consent').hidden=true;for(const id of ['save-list','achievement-list','friend-list','found'])$(id).replaceChildren();selectAvatar('yeti');showAvatar($('account-avatar'),'yeti');$('greeting').textContent='Welcome back';$('identity').textContent='';$('handle').value='';$('display-name').value='';$('discoverable').checked=false;$('share').checked=false;consentDetails=null;if(!user){await syncPlatform();return;}$('identity').textContent=user.email||'Connected account';try{await load(mine)}finally{if(mine===generation&&user)$('dashboard').hidden=false}if(mine!==generation)return;if(authorizationId)await consent();await syncPlatform()}
async function load(mine){const results=await Promise.all([sb.from('dy_profiles').select('*').eq('player_id',user.id).maybeSingle(),sb.from('dy_saves').select('game_id,slot,revision,updated_at'),sb.from('dy_achievements').select('game_id,achievement_id,earned_at').is('revoked_at',null),sb.rpc('dy_friends')]);if(mine!==generation)return;const [profile,saves,achievements,friends]=results.map(check);selectAvatar(profile?.avatar_id);showAvatar($('account-avatar'),profile?.avatar_id);$('handle').value=profile?.handle||'';$('display-name').value=profile?.display_name||'';$('discoverable').checked=!!profile?.discoverable;$('share').checked=!!profile?.share_achievements;$('greeting').textContent=profile?'Hey, '+profile.display_name:'Make yourself at home';$('save-list').replaceChildren(...(saves.length?saves.map(s=>item(s.game_id,'Slot '+(s.slot+1)+' · Revision '+s.revision+' · '+new Date(s.updated_at).toLocaleString())):[item('No cloud saves yet','Connect a supported game to begin.')]));$('achievement-list').replaceChildren(...(achievements.length?achievements.map(a=>item(a.achievement_id,a.game_id)):[item('Your next adventure awaits','Verified achievements will appear here.')]));$('friend-list').replaceChildren(...(friends.length?friends.map(f=>{const el=item(f.display_name,'@'+f.handle+' · '+f.status);if(f.status==='pending'&&f.incoming)button(el,'Accept',()=>friend(f.player_id,'accept'));button(el,f.status==='accepted'?'Remove':'Cancel / decline',()=>friend(f.player_id,'remove'));button(el,'Block',()=>friend(f.player_id,'block'));return el}):[item('Room for your people','Find friends by their exact, discoverable username.')]));}
async function friend(id,act){check(await sb.rpc('dy_friend_action',{p_target:id,p_action:act}));$('found').replaceChildren();await refresh()}
$('profile-form').onsubmit=e=>{e.preventDefault();action(async()=>{check(await sb.rpc('dy_profile_set_with_avatar',{p_avatar:selectedAvatar,p_handle:$('handle').value,p_name:$('display-name').value,p_discoverable:$('discoverable').checked,p_share:$('share').checked}));message('Profile saved.');await refresh()})};
$('find-form').onsubmit=e=>{e.preventDefault();action(async()=>{const mine=generation,p=check(await sb.rpc('dy_find_friend',{p_handle:$('friend-handle').value}));if(mine!==generation)return;const el=p?item(p.display_name,'@'+p.handle):item('No player found','They may have discovery turned off.');if(p&&p.player_id!==user.id)button(el,'Send friend request',()=>friend(p.player_id,'request'));$('found').replaceChildren(el)})};
$('refresh').onclick=()=>action(refresh);
async function logout(scope){check(await sb.auth.signOut({scope}));user=null;generation++;platformSequence++;platformAccount=null;avatarDirty=false;$('world-sections').replaceChildren();$('payment-shop').replaceChildren();$('payment-status').textContent='';$('dashboard').hidden=true;$('consent').hidden=true;$('auth').hidden=false;message(scope==='global'?'Refresh sessions signed out. Existing access tokens expire separately.':'Signed out of this browser.')}
$('logout').onclick=()=>action(()=>logout('local'));$('logout-all').onclick=()=>action(()=>logout('global'));
$('password-form').onsubmit=e=>{e.preventDefault();action(async()=>{check(await sb.auth.updateUser({password:$('new-password').value}));$('new-password').value='';message('Password updated.')})};
$('export').onclick=()=>action(async()=>{const mine=generation,data=check(await sb.rpc('dy_export_account'));if(mine!==generation)return;const url=globalThis.URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='drunk-yeti-game-data.json';a.click();setTimeout(()=>globalThis.URL.revokeObjectURL(url),1000);message('Game data exported. Authentication/provider records are not included.')});
async function consent(){if(!launch.oauthServer){message('Shared app sign-in is not activated yet.');return}const mine=generation;const details=check(await sb.auth.oauth.getAuthorizationDetails(authorizationId));if(mine!==generation)return;if(!details.authorization_id){safeRedirect(details.redirect_url);return}consentDetails=details;$('consent').hidden=false;$('client-name').textContent=details.client.name;$('callback').textContent='Return to: '+details.redirect_uri;const apps=check(await sb.from('dy_apps').select('scopes').eq('oauth_client_id',details.client.id).eq('enabled',true));if(mine!==generation)return;if(!apps.length){consentDetails=null;message('This app has not been enabled by Drunk Yeti.');$('approve').hidden=true;return}$('approve').hidden=false;const scopes=consentScopes(details,apps[0]);$('scope-list').replaceChildren(...scopes.map(s=>{const li=document.createElement('li');li.textContent=s;return li}))}
$('approve').onclick=()=>action(async()=>{if(!consentDetails)throw Error('App is not available.');const data=check(await sb.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}));safeRedirect(data.redirect_url)});
$('deny').onclick=()=>action(async()=>{const data=check(await sb.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true}));safeRedirect(data.redirect_url)});
sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){setTimeout(()=>action(async()=>{await refresh();tab('security');message('Choose your new password.')}),0)}else if(event==='SIGNED_OUT'){generation++;platformSequence++;platformAccount=null;avatarDirty=false;$('world-sections').replaceChildren();$('payment-shop').replaceChildren();$('payment-status').textContent='';user=null;$('dashboard').hidden=true;$('consent').hidden=true;$('auth').hidden=false}else if(event==='SIGNED_IN'){setTimeout(()=>action(refresh),0)}});
async function syncPlatform(){
 const seq=++platformSequence,mine=generation;
 try {
 const manifest=await readManifest(sb);
 let settings={};try{const response=await fetch(URL+'/auth/v1/settings',{headers:{apikey:KEY},cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok)settings=await response.json()}catch{}
 let data=null;if(user){const revision=await readRevision(sb);data=platformAccount&&platformAccount.data_revision===revision.data_revision&&platformAccount.manifest_revision===revision.manifest_revision?platformAccount:await readAccount(sb);}
 if(seq!==platformSequence||mine!==generation)return;
 platformManifest=manifest;platformAccount=data;
 setAvatarCatalog(manifest.avatars);renderAvatarOptions();if(data&&!avatarDirty)selectAvatar(data.profile?.avatar_id);
 $('providers').replaceChildren();
 for(const provider of loginMethods(manifest,settings,'web'))button($('providers'),'Continue with '+provider.name,async()=>{
  if(authorizationId)sessionStorage.setItem('yeti.authorization',authorizationId);
  check(await sb.auth.signInWithOAuth({provider:provider.id,options:{redirectTo:callback()}}));
 });
 if(data){renderWorld($('world-sections'),manifest,data,redeem);showAvatar($('account-avatar'),data.profile?.avatar_id);$('world-status').textContent='Up to date · Your progress travels with you.';await syncPayments(mine);}
 }catch(e){if(seq===platformSequence&&mine===generation){$('providers').replaceChildren();$('world-status').textContent='Account updates are temporarily unavailable. Refresh to try again.';}}
}
async function syncPayments(mine=generation){
 try{const catalog=check(await sb.rpc('dy_payment_catalog'));if(mine!==generation||!user)return;
 renderPayments($('payment-shop'),catalog,buyShards);
 const state=new URLSearchParams(location.search).get('payment');
 if(state==='returned'||state==='cancelled'){
  $('payment-status').textContent=state==='returned'?'Back from checkout. Your purchase history shows the verified payment status.':'Checkout closed. Only confirmed payments add Shards.';
  try{const active=JSON.parse(sessionStorage.getItem('yeti.checkout.active')||'null');if(active?.user_id===user.id){sessionStorage.removeItem(active.key);sessionStorage.removeItem('yeti.checkout.active')}}catch{}
 }else $('payment-status').textContent='';
 }catch{if(mine===generation)$('payment-status').textContent='Purchase information is temporarily unavailable. Please refresh.';}
}
async function buyShards(pack){
 await action(async()=>{
 const mine=generation,key='yeti.checkout.'+user.id+':'+pack.id+':'+pack.version;
 let request=sessionStorage.getItem(key);if(!/^[0-9a-f-]{36}$/i.test(request||'')){request=crypto.randomUUID();sessionStorage.setItem(key,request)}
 const result=check(await sb.functions.invoke('shard-checkout',{body:{pack_id:pack.id,version:pack.version,request_id:request}}));
 if(mine!==generation)return;const url=stripeCheckoutURL(result.url);if(!url)throw Error('Checkout could not be opened safely.');
 sessionStorage.setItem('yeti.checkout.active',JSON.stringify({user_id:user.id,key}));location.assign(url);
 });
}
const pendingRedemptions=new Map();
async function redeem(offer){
 if(!confirm('Spend '+offer.cost+' '+offer.currency_id+' on '+offer.title+'?'))return;
 const key='yeti.redemption.'+user.id+':'+offer.id+':'+offer.version;
 if(!pendingRedemptions.has(key)){const saved=sessionStorage.getItem(key);pendingRedemptions.set(key,/^[0-9a-f-]{36}$/i.test(saved||'')?saved:crypto.randomUUID());}
 sessionStorage.setItem(key,pendingRedemptions.get(key));
 await action(async()=>{const mine=generation;check(await sb.rpc('dy_redeem_offer',{p_offer:offer.id,p_version:offer.version,p_request:pendingRedemptions.get(key)}));pendingRedemptions.delete(key);sessionStorage.removeItem(key);if(mine!==generation)return;message('Unlocked. Your account has been updated.');await syncPlatform()});
}

if(!authorizationId){authorizationId=sessionStorage.getItem('yeti.authorization');sessionStorage.removeItem('yeti.authorization')}
action(refresh);
watchAccount(syncPlatform);

$('resend-confirmation').onclick=()=>action(async()=>{
 if(!launch.emailCallbacks){message('Confirmation email delivery is being prepared. Please try again after setup is complete.');return}
 if(!$('email').reportValidity())return;
 check(await sb.auth.resend({type:'signup',email:$('email').value.trim(),options:{emailRedirectTo:callback()}}));
 message('If confirmation is needed for that address, check your inbox and spam folder. Open the link in this browser.');
});
