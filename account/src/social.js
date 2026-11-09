import {providerMark} from './provider-logos.js';
// Profile handles are self-reported. Only Supabase Auth identities prove a sign-in connection.
export const socialPlatforms = [
 ['discord','Discord','Username or numeric user ID',null],
 ['github','GitHub','Username','https://github.com/'],
 ['steam','Steam','Vanity name or 17-digit SteamID',null],
 ['xbox','Xbox','Gamertag',null],['playstation','PlayStation','Online ID',null],
 ['nintendo','Nintendo Switch','SW-1234-5678-9012',null],
 ['instagram','Instagram','Username','https://www.instagram.com/'],
 ['facebook','Facebook','Profile username','https://www.facebook.com/'],
 ['twitch','Twitch','Channel name','https://www.twitch.tv/'],
 ['youtube','YouTube','Channel handle','https://www.youtube.com/@'],
 ['tiktok','TikTok','Username','https://www.tiktok.com/@'],
 ['twitter','X / Twitter','Username','https://x.com/'],
 ['bluesky','Bluesky','Handle, such as name.bsky.social','https://bsky.app/profile/'],
 ['linkedin','LinkedIn','Profile slug','https://www.linkedin.com/in/'],
 ['gitlab','GitLab','Username','https://gitlab.com/'],
 ['epic','Epic Games','Display name',null]
].map(([id,name,hint,base])=>({id,name,hint,base}));
export function normalizeSocialHandle(platform,value){
 if(!socialPlatforms.some(p=>p.id===platform))throw Error('Choose a supported network.');
 const handle=String(value||'').trim().replace(/^@/,'');
 if(!/^[A-Za-z0-9][A-Za-z0-9_. #@-]{0,63}$/.test(handle))throw Error('Enter a username or gaming ID (up to 64 characters), not a URL.');
 if(platform==='nintendo'&&!/^SW-\d{4}-\d{4}-\d{4}$/.test(handle))throw Error('Use a Nintendo friend code like SW-1234-5678-9012.');
 return handle;
}
export function socialURL(platform,handle){
 try{handle=normalizeSocialHandle(platform,handle)}catch{return null}
 const p=socialPlatforms.find(p=>p.id===platform);
 if(platform==='steam')return 'https://steamcommunity.com/'+(/^\d{17}$/.test(handle)?'profiles/':'id/')+encodeURIComponent(handle);
 if(platform==='discord')return /^\d{17,20}$/.test(handle)?'https://discord.com/users/'+handle:null;
 return p.base?p.base+encodeURIComponent(handle):null;
}
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n};
function button(text,fn){const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b}
export function renderSocialLinks(root,rows,{remove}={}){
 root.replaceChildren();
 for(const row of rows||[]){
  const p=socialPlatforms.find(p=>p.id===row.platform);if(!p)continue;
  const card=el('div',null,'social-row');card.append(el('strong',p.name),el('p',row.handle));
  card.append(el('small','Self-reported'+(remove?' · '+(row.share_with_friends?'Shared with accepted friends':'Only you'):''),'fine'));
  const url=socialURL(row.platform,row.handle);if(url){const a=el('a','Visit profile ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';card.append(a)}
  if(remove)card.append(button('Remove '+p.name,()=>remove(row)));
  root.append(card);
 }
 if(!root.children.length)root.append(el('p','No social profiles shared yet.','muted'));
}
export function renderSignInConnections(root,identities,methods,{link,unlink,canLink=false}){
 root.replaceChildren();
 for(const provider of methods){
  const identity=identities.find(i=>i.provider===provider.id);
  const card=el('div',null,'social-row connection-card');card.dataset.provider=provider.id;
  const mark=providerMark(provider.id);if(mark)card.append(mark);
  const heading=el('div',null,'connection-heading');heading.append(el('strong',provider.name),el('p',identity?'Connected':'Not connected'));card.append(heading);
  if(identity){const detail=identity.identity_data||{};const label=detail.preferred_username||detail.user_name||detail.name||detail.email;if(label)card.append(el('small',String(label).slice(0,128),'fine connection-account'));}
  if(identity){card.append(el('small','Verified through '+provider.name,'fine'));const b=button('Disconnect '+provider.name,()=>unlink(identity));b.disabled=!canLink||identities.length<2;card.append(b);if(identities.length<2)card.append(el('small','Keep at least one sign-in method.','fine'));}
  else {const b=button('Connect '+provider.name,()=>link(provider.id));b.disabled=!canLink;card.append(b)}
  root.append(card);
 }
 if(methods.length&&!canLink)root.append(el('p','Account connections are temporarily unavailable. Your existing sign-in methods still work.','fine'));
 if(!methods.length)root.append(el('p','Social sign-in connections are temporarily unavailable.','muted'));
}
