import {adminEntry} from './admin-entry.js';
import {smsPanel} from './sms.js';
import {signupNewsletterData,rememberNewsletterChoice,applyNewsletterChoice} from './newsletter-signup.js';
import {newsletterPanel} from './newsletter.js';
import {microsoftRedirect,consumeMicrosoftXbox,clearMicrosoftXbox} from './microsoft-xbox.js';
import {captureXboxReturn,xboxPanel} from './xbox.js';
import {accountAuthOptions,recoveryRequestOptions} from './recovery.js';
import {authMessage,callbackError} from './auth-errors.js';
import {providerSignInOptions,cleanAuthCallback} from './oauth.js';
import {orderedSignInMethods,providerLabel} from './apple.js';
import {renderMarketplace} from './marketplace.js';
import {frostpassClient} from '../sdk/frostpass-client.js';
import {renderFrostpass,billingURL} from './frostpass.js';
import {renderInventory} from './inventory.js';
import {multiplayerClient} from '../sdk/multiplayer-client.js';
import {renderMultiplayer} from './multiplayer.js';
import {renderPayments,stripeCheckoutURL,purchaseConfirmation} from './payments.js';
import {readManifest,readAccount,readRevision,loginMethods,watchAccount} from '../sdk/account-client.js';
import {linkReturnResult,rememberLink,clearLink} from './identity-links.js';
import {decorateProviderButton} from './provider-logos.js';
import {socialPlatforms,normalizeSocialHandle,renderSocialLinks,renderSignInConnections} from './social.js';
import {renderWorld} from './world.js';
import {avatars,avatarFor,showAvatar,setAvatarCatalog} from './avatars.js';
import {launch} from './config.js';
import {allowedRedirect,consentScopes} from './security.js';
import {createClient} from '@supabase/supabase-js';
const URL='https://rgafawpucqdhjrzodayl.supabase.co', KEY='sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy';
const xboxReturn=captureXboxReturn();
const microsoftReturnNonce=new globalThis.URL(location.href).searchParams.get('microsoft_xbox');
let microsoftCallbackReady=false;
const sb=createClient(URL,KEY,{auth:accountAuthOptions(location.href)});
let recoverySender;
const sendRecovery=(email)=>{recoverySender ||= createClient(URL,KEY,{auth:recoveryRequestOptions()});return recoverySender.auth.resetPasswordForEmail(email,{redirectTo:callback()});};
const multiplayer=multiplayerClient(sb);
const frostpass=frostpassClient(sb);
const $=id=>document.getElementById(id),message=text=>$('status').textContent=text;
let user=null,signup=false,generation=0,authorizationId=new URLSearchParams(location.search).get('authorization_id'),consentDetails=null;
try{const target=new URLSearchParams(location.search).get('manage');if(['unsubscribe','delete-account'].includes(target))sessionStorage.setItem('yeti.account.manage',target);}catch{}
const callback=()=>new globalThis.URL('./',location.href).href.split('?')[0].split('#')[0];
const check=r=>{if(r.error)throw r.error;return r.data};
const recoveryKey='yeti.passwordRecovery.verified';
const incomingAuthError=callbackError(location.href);
let recoveryMode=new globalThis.URL(location.href).hash==='#reset-password',recoveryComplete=false;
try{const requested=Number(sessionStorage.getItem(recoveryKey));recoveryMode ||= requested>0&&Date.now()-requested<30*60*1000;}catch{}
function rememberRecovery(){recoveryMode=true;recoveryComplete=false;try{sessionStorage.setItem(recoveryKey,String(Date.now()))}catch{}}
function clearRecovery(){recoveryMode=false;recoveryComplete=false;try{sessionStorage.removeItem(recoveryKey)}catch{};if(new globalThis.URL(location.href).hash==='#reset-password')globalThis.history?.replaceState(null,'',location.pathname+location.search);$('recovery').hidden=true;$('reset-password').value='';$('reset-confirm').value='';}
function showRecovery(){
 $('auth').hidden=true;$('dashboard').hidden=true;$('consent').hidden=true;$('recovery').hidden=false;
 $('reset-form').hidden=recoveryComplete;$('reset-continue').hidden=!recoveryComplete;
 if(!recoveryComplete){$('reset-status').textContent='Your email link signed you in securely. Choose a new password below to finish resetting it.';$('reset-password').focus();}
}

const adminAccess=adminEntry({document,storage:sessionStorage});
let paymentReturnOpened=false;
let selectedAvatar='yeti',platformManifest=null,platformAccount=null,platformSequence=0,avatarDirty=false;
function selectAvatar(id){selectedAvatar=avatarFor(id).id;for(const radio of document.querySelectorAll('input[name="avatar"]'))radio.checked=radio.value===selectedAvatar;}
function renderAvatarOptions(){
 const selected=selectedAvatar;$('avatar-options').replaceChildren();

for(const avatar of avatars){
 const label=document.createElement('label'),radio=document.createElement('input'),picture=document.createElement('span'),name=document.createElement('span');
 label.className='avatar-option';radio.type='radio';radio.name='avatar';radio.value=avatar.id;radio.setAttribute('aria-label',avatar.name);picture.className='avatar-picture';picture.setAttribute('aria-hidden','true');showAvatar(picture,avatar.id);name.textContent=avatar.name;
 radio.onchange=()=>{if(radio.checked){avatarDirty=true;selectAvatar(avatar.id)}};
 const owned=avatar.free!==false||(platformAccount?.unlocks||[]).some(u=>u.game_id==='yeti-account'&&u.item_id==='avatar:'+avatar.id);radio.disabled=!owned;if(!owned){const offer=(platformAccount?.offers||[]).find(o=>o.target_game==='yeti-account'&&o.item_id==='avatar:'+avatar.id);name.textContent+=' · Locked'+(offer?' · '+offer.cost+' Shards in Marketplace':'');}label.append(radio,picture,name);$('avatar-options').append(label);
}
selectAvatar(selected);
}
renderAvatarOptions();selectAvatar('yeti');showAvatar($('account-avatar'),'yeti');
function safeRedirect(value){location.assign(allowedRedirect(value));}
let actionDepth=0;const actionButtons=new Map();
async function action(fn){for(const b of document.querySelectorAll('button')){if(!actionButtons.has(b))actionButtons.set(b,b.disabled);b.disabled=true;}actionDepth++;try{await fn()}catch(e){message(authMessage(e))}finally{if(--actionDepth===0){for(const [b,disabled] of actionButtons)b.disabled=disabled;actionButtons.clear();}}}

function item(title,description){const el=document.createElement('div');el.className='item';const h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=description;el.append(h,p);return el}
function button(parent,label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=()=>action(fn);parent.append(b);return b}
function tab(name){document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==name);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===name))}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
if(location.hash==='#marketplace')tab('marketplace');
if(location.hash==='#social')tab('social');
try{if(sessionStorage.getItem('yeti.social_return')==='1'){tab('social');sessionStorage.removeItem('yeti.social_return')}}catch{}
$('profile-social').onclick=()=>tab('social');
$('market-buy-shards').onclick=e=>{e.preventDefault();tab('payments')};
$('mode').onclick=()=>{signup=!signup;$('auth-title').textContent=signup?'Create an account':'Sign in';$('submit').textContent=signup?'Create account':'Sign in';$('mode').textContent=signup?'Already have an account?':'Create an account';$('password').autocomplete=signup?'new-password':'current-password';$('password').minLength=signup?12:1;$('confirm-row').hidden=!signup;$('signup-help').hidden=!signup;$('confirm-password').required=signup;$('confirm-password').value='';$('password').value=''};
$('auth-form').onsubmit=e=>{e.preventDefault();action(async()=>{if(signup&&$('password').value!==$('confirm-password').value)throw Error('Your passwords do not match.');if(signup&&(!launch.registration||!launch.emailCallbacks))throw Error('Account creation is being prepared. Email verification is not available yet; no account has been created.');const email=$('email').value.trim(),password=$('password').value;const r=signup?await sb.auth.signUp({email,password,options:{emailRedirectTo:callback(),data:signupNewsletterData($('signup-newsletter').checked)}}):await sb.auth.signInWithPassword({email,password});check(r);if(!signup)clearRecovery();$('password').value='';$('confirm-password').value='';message(signup?'Check your inbox and spam folder for your confirmation email. Open the link in this browser, then sign in.':'Signed in.');await refresh()})};
$('forgot').onclick=()=>action(async()=>{if(!launch.emailCallbacks){message('Recovery emails are not ready yet. Please try again after account setup is complete.');return}if(!$('email').reportValidity())return;check(await sendRecovery($('email').value.trim()));message('If that address has an account, check your inbox and spam folder. Open the newest reset email to choose a new password. It can open in another browser. Older links may have expired or already been used.')});
async function refresh(){const mine=++generation;const {data,error}=await sb.auth.getUser();if(mine!==generation)return;user=error?null:data.user;platformSequence++;platformAccount=null;avatarDirty=false;clearSocial();$('world-sections').replaceChildren();$('marketplace-content').replaceChildren();$('shard-inventory').textContent='Loading your Shard balance…';$('payment-shop').replaceChildren();$('frostpass-content').replaceChildren();$('world-payment-note').textContent='';$('multiplayer-content').replaceChildren();$('multiplayer-status').textContent='';$('payment-status').textContent='';$('world-status').textContent='';$('auth').hidden=!!user;$('dashboard').hidden=true;$('consent').hidden=true;for(const id of ['save-list','achievement-list','friend-list','found'])$(id).replaceChildren();selectAvatar('yeti');showAvatar($('account-avatar'),'yeti');$('greeting').textContent='Welcome back';$('identity').textContent='';$('handle').value='';$('display-name').value='';$('discoverable').checked=false;$('share').checked=false;consentDetails=null;if(!user){$('recovery').hidden=true;if(recoveryMode)message('Open the newest reset email in the browser where you requested it, or request another reset link.');await syncPlatform();return;}if(recoveryMode){showRecovery();return;}await applyNewsletterChoice(sb,sessionStorage,user);try{const target=sessionStorage.getItem('yeti.account.manage');if(['unsubscribe','delete-account'].includes(target)){sessionStorage.removeItem('yeti.account.manage');location.assign('/'+target+'/');return;}}catch{}$('recovery').hidden=true;await renderNewsletter($('newsletter-preferences'));await renderSms($('sms-preferences'));const adminCheck=await sb.rpc('dy_studio_admin',{p_action:'access'});if(mine!==generation||!user)return;$('identity').textContent=user.email||'Connected account';try{await load(mine)}finally{if(mine===generation&&user)$('dashboard').hidden=false}if(mine!==generation)return;if(!authorizationId)adminAccess.show(user.id,adminCheck);if(authorizationId)await consent();await syncPlatform();if(mine===generation){await loadSocial();const result=linkReturnResult(sessionStorage,user,incomingAuthError);if(result){tab('social');$('connection-status').textContent=result;}}if(mine===generation)await snowlightStats(user.id,$('achievement-list'))}
async function load(mine){const results=await Promise.all([sb.from('dy_profiles').select('*').eq('player_id',user.id).maybeSingle(),sb.from('dy_saves').select('game_id,slot,revision,updated_at'),sb.from('dy_achievements').select('game_id,achievement_id,earned_at').is('revoked_at',null),sb.rpc('dy_friends')]);if(mine!==generation)return;const [profile,saves,achievements,friends]=results.map(check);selectAvatar(profile?.avatar_id);showAvatar($('account-avatar'),profile?.avatar_id);$('handle').value=profile?.handle||'';$('display-name').value=profile?.display_name||'';$('discoverable').checked=!!profile?.discoverable;$('share').checked=!!profile?.share_achievements;$('greeting').textContent=profile?'Hey, '+profile.display_name:'Make yourself at home';$('save-list').replaceChildren(...(saves.length?saves.map(s=>item(s.game_id,'Slot '+(s.slot+1)+' · Revision '+s.revision+' · '+new Date(s.updated_at).toLocaleString())):[item('No cloud saves yet','Connect a supported game to begin.')]));$('achievement-list').replaceChildren(...(achievements.length?achievements.map(a=>item(a.achievement_id,a.game_id)):[item('Your next adventure awaits','Verified achievements will appear here.')]));$('friend-list').replaceChildren(...(friends.length?friends.map(f=>{const el=item(f.display_name,'@'+f.handle+' · '+f.status);if(f.status==='pending'&&f.incoming)button(el,'Accept',()=>friend(f.player_id,'accept'));button(el,f.status==='accepted'?'Remove':'Cancel / decline',()=>friend(f.player_id,'remove'));button(el,'Block',()=>friend(f.player_id,'block'));if(f.status==='accepted')button(el,'Social profiles',()=>showFriendSocial(f.player_id,el));if(f.status==='accepted')button(el,'Snowlight stats',()=>action(()=>snowlightStats(f.player_id,el)));return el}):[item('Room for your people','Find friends by their exact, discoverable username.')]));}
async function snowlightStats(id,parent){const mine=generation;const r=await sb.rpc('dy_snowlight_stats',{p_target:id});if(mine!==generation)return;if(r.error){parent.append(item('Snowlight','Stats unavailable.'));return}const s=r.data;if(!s?.played){parent.append(item('Snowlight','No shared activity yet.'));return}parent.append(item('Snowlight · client-reported',`${s.runs} runs · ${s.finishes} finishes · Best ${s.best_score} · Last played ${new Date(s.played).toLocaleString()} · First finish: ${s.first_finish?'yes':'no'} · Ten finishes: ${s.ten_finishes?'yes':'no'}`));}
async function friend(id,act){check(await sb.rpc('dy_friend_action',{p_target:id,p_action:act}));$('found').replaceChildren();await refresh()}
$('profile-form').onsubmit=e=>{e.preventDefault();action(async()=>{check(await sb.rpc('dy_profile_set_with_avatar',{p_avatar:selectedAvatar,p_handle:$('handle').value,p_name:$('display-name').value,p_discoverable:$('discoverable').checked,p_share:$('share').checked}));message('Profile saved.');await refresh()})};
$('find-form').onsubmit=e=>{e.preventDefault();action(async()=>{const mine=generation,p=check(await sb.rpc('dy_find_friend',{p_handle:$('friend-handle').value}));if(mine!==generation)return;const el=p?item(p.display_name,'@'+p.handle):item('No player found','They may have discovery turned off.');if(p&&p.player_id!==user.id)button(el,'Send friend request',()=>friend(p.player_id,'request'));$('found').replaceChildren(el)})};
$('refresh').onclick=()=>action(refresh);
async function logout(scope){adminAccess.reset();clearMicrosoftXbox(sessionStorage);check(await sb.auth.signOut({scope}));clearRecovery();user=null;generation++;platformSequence++;platformAccount=null;avatarDirty=false;clearSocial();$('world-sections').replaceChildren();$('marketplace-content').replaceChildren();$('shard-inventory').textContent='Loading your Shard balance…';$('payment-shop').replaceChildren();$('frostpass-content').replaceChildren();$('world-payment-note').textContent='';$('multiplayer-content').replaceChildren();$('multiplayer-status').textContent='';$('payment-status').textContent='';$('dashboard').hidden=true;$('consent').hidden=true;$('auth').hidden=false;message(scope==='global'?'Refresh sessions signed out. Existing access tokens expire separately.':'Signed out of this browser.')}
$('logout').onclick=()=>action(()=>logout('local'));$('logout-all').onclick=()=>action(()=>logout('global'));
$('password-form').onsubmit=e=>{e.preventDefault();action(async()=>{check(await sb.auth.updateUser({password:$('new-password').value}));$('new-password').value='';message('Password updated.')})};
$('reset-form').onsubmit=async e=>{
 e.preventDefault();const submit=$('reset-submit');submit.disabled=true;
 try{
  if($('reset-password').value.length<12)throw Error('Use at least 12 characters for your new password.');
  if($('reset-password').value!==$('reset-confirm').value)throw Error('Your passwords do not match.');
  const mine=generation;
  check(await sb.auth.updateUser({password:$('reset-password').value}));
  if(mine!==generation)return;
  $('reset-password').value='';$('reset-confirm').value='';
  try{sessionStorage.removeItem(recoveryKey)}catch{}
  recoveryComplete=true;showRecovery();$('reset-status').textContent='Password saved. Use this new password the next time you sign in.';message('Password updated successfully.');
 }catch(e){$('reset-status').textContent=e.message||'Could not save your password. Request a fresh reset link and try again.';}finally{submit.disabled=false;}
};
$('reset-continue').onclick=()=>action(async()=>{clearRecovery();await refresh()});
$('export').onclick=()=>action(async()=>{const mine=generation,data=check(await sb.rpc('dy_export_account'));if(mine!==generation)return;const url=globalThis.URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='drunk-yeti-game-data.json';a.click();setTimeout(()=>globalThis.URL.revokeObjectURL(url),1000);message('Game data exported. Authentication/provider records are not included.')});
async function consent(){if(!launch.oauthServer){message('Shared app sign-in is not activated yet.');return}const mine=generation;const details=check(await sb.auth.oauth.getAuthorizationDetails(authorizationId));if(mine!==generation)return;if(!details.authorization_id){safeRedirect(details.redirect_url);return}consentDetails=details;$('consent').hidden=false;$('client-name').textContent=details.client.name;$('callback').textContent='Return to: '+details.redirect_uri;const apps=check(await sb.from('dy_apps').select('scopes').eq('oauth_client_id',details.client.id).eq('enabled',true));if(mine!==generation)return;if(!apps.length){consentDetails=null;message('This app has not been enabled by Drunk Yeti.');$('approve').hidden=true;return}$('approve').hidden=false;const scopes=consentScopes(details,apps[0]);$('scope-list').replaceChildren(...scopes.map(s=>{const li=document.createElement('li');li.textContent=s;return li}))}
$('approve').onclick=()=>action(async()=>{if(!consentDetails)throw Error('App is not available.');const data=check(await sb.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}));safeRedirect(data.redirect_url)});
$('deny').onclick=()=>action(async()=>{const data=check(await sb.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true}));safeRedirect(data.redirect_url)});
sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){rememberRecovery();$('dashboard').hidden=true;$('consent').hidden=true;setTimeout(()=>action(refresh),0)}else if(event==='SIGNED_OUT'){adminAccess.reset();clearMicrosoftXbox(sessionStorage);clearRecovery();generation++;platformSequence++;platformAccount=null;avatarDirty=false;clearSocial();$('world-sections').replaceChildren();$('marketplace-content').replaceChildren();$('shard-inventory').textContent='Loading your Shard balance…';$('payment-shop').replaceChildren();$('frostpass-content').replaceChildren();$('world-payment-note').textContent='';$('multiplayer-content').replaceChildren();$('multiplayer-status').textContent='';$('payment-status').textContent='';user=null;$('dashboard').hidden=true;$('consent').hidden=true;$('auth').hidden=false}else if(event==='SIGNED_IN'){setTimeout(()=>action(refresh),0)}});
async function syncPlatform(){
 const seq=++platformSequence,mine=generation;
 try {
 const manifest=await readManifest(sb);
 let settings={};try{const response=await fetch(URL+'/auth/v1/settings',{headers:{apikey:KEY},cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok)settings=await response.json()}catch{}
 if(user)await syncFrostpass(mine);
 let data=null;if(user){const revision=await readRevision(sb);data=platformAccount&&platformAccount.data_revision===revision.data_revision&&platformAccount.manifest_revision===revision.manifest_revision?platformAccount:await readAccount(sb);}
 if(seq!==platformSequence||mine!==generation)return;
 platformManifest=manifest;platformAccount=data;
 setAvatarCatalog(manifest.avatars);renderAvatarOptions();if(data&&!avatarDirty)selectAvatar(data.profile?.avatar_id);
 $('providers').replaceChildren();
 const methods=loginMethods(manifest,settings,'web');
 for(const provider of orderedSignInMethods(methods)){const providerButton=button($('providers'),providerLabel(provider),async()=>{
  clearRecovery();clearMicrosoftXbox(sessionStorage);
  if(authorizationId){try{sessionStorage.setItem('yeti.authorization',authorizationId)}catch{throw Error('Allow browser storage to continue signing in to your app.')}}
  message('Opening '+provider.name+' sign-in…');
  const redirect=provider.id==='azure'?microsoftRedirect(sessionStorage,callback()):callback();
  rememberNewsletterChoice(sessionStorage,$('signup-newsletter').checked);
  const result=await sb.auth.signInWithOAuth(providerSignInOptions(provider.id,redirect));
  if(result.error){clearMicrosoftXbox(sessionStorage);sessionStorage.removeItem('yeti.newsletter.signup');}check(result);
 });decorateProviderButton(providerButton,provider.id);}
 if(user)renderSignInConnections($('signin-connections'),user.identities||[],methods,{link:linkSocial,unlink:unlinkSocial,canLink:manifest.auth?.identity_linking!==false});
 if(methods.length){
  const help=document.createElement('p');help.className='fine';help.textContent='New here? A social account can create your profile. Microsoft sign-in also starts Xbox connection setup; Microsoft may ask you to approve Xbox access. Already registered? Sign in first, then connect another account in Social & gaming to keep your profile and purchases together.';$('providers').append(help);
  if(methods.some(p=>p.id==='apple')){const help=document.createElement('p');help.className='fine';help.textContent='Using Apple’s Hide My Email? If you already have a Drunk Yeti account, sign in to it first and connect Apple in Social & gaming to keep your purchases and progress.';$('providers').append(help);}
 }
 if(data){renderInventory($('shard-inventory'),data);renderWorld($('world-sections'),{...manifest,sections:manifest.sections.filter(s=>s.type!=='store')},data,redeem);renderMarketplace($('marketplace-content'),manifest,data,redeem);showAvatar($('account-avatar'),data.profile?.avatar_id);$('world-status').textContent='Up to date · Your progress travels with you.';await syncPayments(mine);await syncMultiplayer(mine);}
 }catch(e){if(seq===platformSequence&&mine===generation){$('providers').replaceChildren();$('signin-connections').replaceChildren();$('shard-inventory').textContent='Your Shard balance is temporarily unavailable. Refresh to try again.';$('marketplace-content').textContent='Marketplace is temporarily unavailable. Refresh to try again.';$('world-status').textContent='Account updates are temporarily unavailable. Refresh to try again.';}}
}

function clearSocial(){adminAccess.clear();$('sms-preferences')?.replaceChildren();$('studio-admin-link').hidden=true;$('newsletter-preferences')?.replaceChildren();$('xbox-connections')?.replaceChildren();for(const id of ['signin-connections','social-list','synced-profiles'])$(id).replaceChildren();$('social-handle').value='';$('social-share').checked=false;$('social-status').textContent='';$('connection-status').textContent='';}
for(const p of socialPlatforms){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('social-platform').append(o)}
$('social-platform').firstElementChild.selected=true;
$('social-platform').onchange=()=>{$('social-handle').placeholder=socialPlatforms.find(p=>p.id===$('social-platform').value)?.hint||'';};
$('social-platform').onchange();
const renderSms=smsPanel({sb,getUser:()=>user});
const renderNewsletter=newsletterPanel({sb,getUser:()=>user});
const renderXbox=xboxPanel({sb,getUser:()=>user,returned:xboxReturn,autoConnect:()=>microsoftCallbackReady&&consumeMicrosoftXbox(sessionStorage,{nonce:microsoftReturnNonce,user,error:incomingAuthError})});
async function loadSocial(){
 const mine=generation,owner=user?.id;if(!owner)return;
 await renderXbox($('xbox-connections'));
 await loadSyncedProfiles(mine,owner);
 const r=await sb.from('dy_social_profiles').select('platform,handle,share_with_friends').eq('player_id',user.id).order('platform');
 if(mine!==generation)return;
 if(r.error){$('social-status').textContent='Social profiles could not be loaded. Refresh to try again.';return;}
 renderSocialLinks($('social-list'),r.data,{remove:row=>action(async()=>{if(mine!==generation||user?.id!==owner)return;check(await sb.from('dy_social_profiles').delete().eq('player_id',owner).eq('platform',row.platform));if(mine!==generation)return;await loadSocial();$('social-status').textContent='Social profile removed.';})});
}
$('social-form').onsubmit=e=>{e.preventDefault();action(async()=>{
 if(!user)throw Error('Sign in before adding a social profile.');const mine=generation,owner=user.id,platform=$('social-platform').value;
 const handle=normalizeSocialHandle(platform,$('social-handle').value),shared=$('social-share').checked;
 check(await sb.from('dy_social_profiles').upsert({player_id:owner,platform,handle,share_with_friends:shared},{onConflict:'player_id,platform'}));
 if(mine!==generation)return;await loadSocial();$('social-status').textContent='Saved. '+(shared?'Accepted friends can see this handle.':'Only you can see this handle.');
})};
async function showFriendSocial(id,parent){const mine=generation;const rows=check(await sb.from('dy_social_profiles').select('platform,handle').eq('player_id',id).order('platform'));if(mine!==generation)return;let root=parent.querySelector('.friend-social');if(!root){root=document.createElement('div');root.className='friend-social';parent.append(root)}renderSocialLinks(root,rows);}
async function linkSocial(provider){await action(async()=>{
 if(!user)throw Error('Sign in first.');const owner=user.id;
 const fresh=check(await sb.auth.getUser()).user;if(fresh?.id!==owner)throw Error('Your session changed. Refresh before connecting an account.');
 if(!(platformManifest?.auth?.providers||[]).some(p=>p.id===provider&&p.ready_surfaces?.includes('web')))throw Error('This provider is not available yet.');
 clearRecovery();rememberLink(sessionStorage,{owner,provider});
 $('connection-status').textContent='Opening '+provider+' to verify your account…';
 clearMicrosoftXbox(sessionStorage);
 const redirect=provider==='azure'?microsoftRedirect(sessionStorage,callback(),owner):callback();
 const r=await sb.auth.linkIdentity(providerSignInOptions(provider,redirect));
 if(r.error){clearMicrosoftXbox(sessionStorage);clearLink(sessionStorage);const text=r.error.code==='manual_linking_disabled'?'Account linking is not enabled on the account service yet. Your existing account is unchanged.':r.error.code==='identity_already_exists'?'This social account belongs to another Drunk Yeti account. It cannot be merged here.':authMessage(r.error);$('connection-status').textContent=text;throw Error(text);}
 });}
async function unlinkSocial(identity){await action(async()=>{
 if(!user)throw Error('Sign in first.');const owner=user.id;
 const fresh=check(await sb.auth.getUser()).user;
 if(fresh?.id!==owner||!fresh.identities?.some(i=>i.id===identity.id))throw Error('Your connections changed. Refresh and try again.');
 if(fresh.identities.length<2)throw Error('Keep at least one sign-in method.');
 if(!globalThis.confirm('Disconnect '+identity.provider+' from this Drunk Yeti account? Your saves and purchases stay with this account.'))return;
 check(await sb.auth.unlinkIdentity(identity));await refresh();tab('social');$('connection-status').textContent='Disconnected '+identity.provider+'. Your Drunk Yeti account is unchanged.';
 });}


let membershipReturnOpened=false;
async function syncFrostpass(mine=generation){
 try{const data=await frostpass.status();if(mine!==generation||!user)return;
 renderFrostpass($('frostpass-content'),data,c=>{
  if(!confirm('Subscribe to Yeti Frostpass for '+new Intl.NumberFormat('en-US',{style:'currency',currency:c.currency}).format(c.amount_cents/100)+'/month, renewing until canceled? Includes '+c.monthly_shards+' Shards per paid month. '+((c.products||[]).some(p=>p.ready)?'Only apps marked Included have full access. ':'No apps or games are included yet. ')+'You will confirm payment in Stripe.'))return;
  openMembershipBilling('checkout');
 },()=>openMembershipBilling('portal'));
 if(new URLSearchParams(location.search).has('membership')&&!membershipReturnOpened&&!recoveryMode){tab('frostpass');membershipReturnOpened=true;}
 }catch{if(mine===generation)$('frostpass-content').textContent='Membership information is temporarily unavailable. Please refresh.';}
}
async function openMembershipBilling(kind){await action(async()=>{
 const mine=generation;const result=await frostpass[kind]();if(mine!==generation||!user)return;
 const url=billingURL(result.url,kind);if(!url)throw Error('Billing could not be opened safely.');location.assign(url);
 });}
async function syncMultiplayer(mine=generation){
 try{const [manifest,data]=await Promise.all([multiplayer.manifest(),multiplayer.snapshot()]);if(mine!==generation||!user)return;
 renderMultiplayer($('multiplayer-content'),manifest,data,(presence,coins)=>action(async()=>{
  const current=generation;await multiplayer.privacy(presence,coins);if(current!==generation)return;
  $('multiplayer-status').textContent='Sharing preferences saved.';await syncMultiplayer(current);
 }));
 }catch{if(mine===generation)$('multiplayer-status').textContent='Multiplayer account information is temporarily unavailable. Please refresh.';}
}
async function syncPayments(mine=generation){
 try{const catalog=check(await sb.rpc('dy_payment_catalog'));if(mine!==generation||!user)return;
 renderPayments($('payment-shop'),catalog,buyShards,async quantity=>check(await sb.rpc('dy_shard_quote',{p_quantity:quantity})));
 $('world-payment-note').textContent=catalog.orders?.[0]?.status==='test_complete'?'Latest purchase: '+purchaseConfirmation(catalog.orders[0]):'';
 const state=new URLSearchParams(location.search).get('payment');
 if(state==='returned'||state==='cancelled'){
  if(!paymentReturnOpened&&!recoveryMode){tab('payments');paymentReturnOpened=true;}
  $('payment-status').textContent=state==='returned'?'Back from checkout. Your purchase history shows the verified payment status.':'Checkout closed. Only confirmed payments add Shards.';
  try{const active=JSON.parse(sessionStorage.getItem('yeti.checkout.active')||'null');if(active?.user_id===user.id){sessionStorage.removeItem(active.key);sessionStorage.removeItem('yeti.checkout.active')}}catch{}
 }else $('payment-status').textContent='';
 }catch{if(mine===generation)$('payment-status').textContent='Purchase information is temporarily unavailable. Please refresh.';}
}
async function buyShards(pack){
 await action(async()=>{
 const mine=generation,key='yeti.checkout.'+user.id+':'+pack.id+':'+pack.version+':'+pack.shards+':'+pack.amount_cents;
 let request=sessionStorage.getItem(key);if(!/^[0-9a-f-]{36}$/i.test(request||'')){request=crypto.randomUUID();sessionStorage.setItem(key,request)}
 const result=check(await sb.functions.invoke('shard-checkout',{body:{pack_id:pack.id,version:pack.version,request_id:request,quantity:Number(pack.shards),expected_cents:pack.amount_cents}}));
 if(mine!==generation)return;const url=stripeCheckoutURL(result.url);if(!url)throw Error('Checkout could not be opened safely.');
 sessionStorage.setItem('yeti.checkout.active',JSON.stringify({user_id:user.id,key}));location.assign(url);
 });
}
const pendingRedemptions=new Map();
async function redeem(offer){
 const walletName=offer.currency_id==='yeti-shards-web'?'purchased Shards':offer.currency_id==='yeti-shards'?'earned Shards':offer.currency_id;
 if(!confirm('Spend '+offer.cost+' '+walletName+' on '+offer.title+'? This unlock is saved to your account.'))return;
 const key='yeti.redemption.'+user.id+':'+offer.id+':'+offer.version;
 if(!pendingRedemptions.has(key)){const saved=sessionStorage.getItem(key);pendingRedemptions.set(key,/^[0-9a-f-]{36}$/i.test(saved||'')?saved:crypto.randomUUID());}
 sessionStorage.setItem(key,pendingRedemptions.get(key));
 await action(async()=>{const mine=generation;check(await sb.rpc('dy_redeem_offer',{p_offer:offer.id,p_version:offer.version,p_request:pendingRedemptions.get(key)}));pendingRedemptions.delete(key);sessionStorage.removeItem(key);if(mine!==generation)return;message(offer.item_id?.startsWith('avatar:')?'Unlocked! Choose your new avatar in Profile, then Save profile. Your character ownership is saved for future supported skins and themes.':'Purchase complete. Your item is saved to your account.');await syncPlatform()});
}

if(!authorizationId){try{authorizationId=sessionStorage.getItem('yeti.authorization');sessionStorage.removeItem('yeti.authorization')}catch{}}
action(async()=>{const result=await sb.auth.initialize();const error=incomingAuthError||result.error;microsoftCallbackReady=!error;if(error)clearMicrosoftXbox(sessionStorage);const clean=cleanAuthCallback(location.href);if(clean!==location.href)globalThis.history?.replaceState(null,'',clean);if(error)clearRecovery();await refresh();if(error)message(authMessage(error));});
watchAccount(syncPlatform);

$('resend-confirmation').onclick=()=>action(async()=>{
 if(!launch.emailCallbacks){message('Confirmation email delivery is being prepared. Please try again after setup is complete.');return}
 if(!$('email').reportValidity())return;
 check(await sb.auth.resend({type:'signup',email:$('email').value.trim(),options:{emailRedirectTo:callback()}}));
 message('If confirmation is needed for that address, check your inbox and spam folder. Open the link in this browser.');
});

async function loadSyncedProfiles(mine,owner){
 const root=$('synced-profiles');root.replaceChildren();
 const result=await sb.from('dy_connected_profiles').select('provider,provider_subject,display_name,username,synced_at').eq('player_id',owner);
 if(mine!==generation)return;
 if(result.error){root.textContent='Profile sync is temporarily unavailable.';return;}
 for(const identity of (user.identities||[]).filter(i=>['google','discord','github'].includes(i.provider))){
  const row=(result.data||[]).find(r=>r.provider===identity.provider&&r.provider_subject===String(identity.provider_id||identity.identity_data?.sub||''));
  const el=item(identity.provider,row?`${row.display_name}${row.username?' · @'+row.username:''} · Synced ${new Date(row.synced_at).toLocaleString()}`:'No profile synced yet.');
  button(el,'Sync profile',()=>action(async()=>{
   if(mine!==generation||user?.id!==owner)return;
   const session=check(await sb.auth.getSession()).session;
   if(!session?.provider_token)throw Error('Sign out and sign in with '+identity.provider+' to authorize profile refresh.');
   const r=await sb.functions.invoke('connected-profile-sync',{body:{provider:identity.provider,provider_token:session.provider_token}});
   if(r.error||r.data?.error)throw Error('Profile refresh failed. Sign in with the matching provider and try again.');
   if(mine!==generation)return;await loadSyncedProfiles(mine,owner);$('social-status').textContent='Private profile refreshed from '+identity.provider+'.';
  }));
  if(row)button(el,'Remove synced details',()=>action(async()=>{if(mine!==generation)return;check(await sb.from('dy_connected_profiles').delete().eq('player_id',owner).eq('provider',identity.provider));if(mine===generation)await loadSyncedProfiles(mine,owner);}));
  root.append(el);
 }
}
