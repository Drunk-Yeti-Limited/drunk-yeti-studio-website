import {characterThemes} from '../sdk/account-client.js';
function row(title,detail){const el=document.createElement('div');el.className='item';const h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=detail;el.append(h,p);return el}
const title=value=>String(value||'').replace(/^avatar:/,'').replace(/[-_:]/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
const number=value=>/^\d+$/.test(String(value))?BigInt(value).toLocaleString():'—';
export function renderWorld(root,manifest,data,onRedeem){
 const panels=[],themes=characterThemes(manifest,data);
 const themedOffer=o=>themes.find(t=>t.entitlement.game_id===o.target_game&&t.entitlement.item_id===o.item_id);
 for(const section of manifest.sections){
 const panel=document.createElement('section');panel.className='world-panel';const h=document.createElement('h3');h.textContent=section.title;panel.append(h);
 switch(section.type){
 case 'wallets':
 for(const w of data.wallets||[])panel.append(row(w.title,number(w.balance)+' · '+(w.kind==='earned'?'Earned through connected games':'Purchased · '+w.source_platform)+' · '+(w.game_id?title(w.game_id):'Shared across Drunk Yeti')));
 for(const w of data.game_wallets||[])panel.append(row(w.title+' coins',number(w.balance)+' · For this game only'));
 if(!data.game_wallets?.length)panel.append(row('Game coins','Separate game wallets will appear here when connected.'));
 panel.append(row('Shard purchases','Open Buy Shards for checkout availability and confirmed purchase history.'));
 for(const a of (data.activity||[]).slice(0,5))panel.append(row(a.reason,(String(a.delta).startsWith('-')?'':'+')+a.delta+' '+title(a.currency_id)+' · '+new Date(a.created_at).toLocaleDateString()));break;
 case 'achievements':
 for(const a of data.achievements||[])panel.append(row(a.title,title(a.game_id)+' · Earned '+new Date(a.earned_at).toLocaleDateString()));
 if(!data.achievements?.length)panel.append(row('Your next adventure awaits','Achievements from connected games will appear here.'));break;
 case 'unlocks':
 for(const a of data.unlocks||[]){const theme=themes.find(t=>t.entitlement.game_id===a.game_id&&t.entitlement.item_id===a.item_id);panel.append(row(theme?.title||title(a.item_id),theme?'Character owned · Avatar ready · Buddy skins and app/game themes planned':title(a.game_id)));}
 if(!data.unlocks?.length)panel.append(row('A world of possibilities','Earn cross-game unlocks through achievements, or spend Shards when offers are available.'));break;
 case 'store':
 for(const theme of themes){
 const offers=(data.offers||[]).filter(o=>themedOffer(o)?.id===theme.id);
 if(!offers.length)continue;
 const el=row(theme.title,theme.description);el.classList.add('character-card');
 const img=document.createElement('img');img.src=theme.image;img.alt=theme.title;img.width=160;img.height=160;img.loading='lazy';el.prepend(img);
 el.append(row(theme.owned?'Owned · Ready to select in Profile':number(offers[0].cost)+' Shards · One-time character unlock','Avatar available now. Matching skins and themes appear as apps add support.'));
 if(!theme.owned)for(const o of offers){
 const wallet=(data.wallets||[]).find(w=>w.id===o.currency_id),balance=String(wallet?.balance??'0');
 const enough=/^\d+$/.test(balance)&&BigInt(balance)>=BigInt(o.cost);
 const b=document.createElement('button');b.type='button';
 b.textContent='Use '+number(o.cost)+' '+(o.currency_id==='yeti-shards-web'?'purchased':'earned')+' Shards';
 b.disabled=!manifest.features?.redemptions||!!o.owned||!enough;
 b.title=enough?'Unlock '+theme.title:'Not enough '+(wallet?.title||'Shards');b.onclick=()=>onRedeem(o);el.append(b);
 }
 panel.append(el);
 }
 for(const o of (data.offers||[]).filter(o=>!themedOffer(o))){const el=row(o.title,number(o.cost)+' '+title(o.currency_id)+(o.kind==='casino_coins'?' · '+number(o.coin_amount)+' game coins':''));
 const b=document.createElement('button');b.type='button';b.textContent=o.owned?'Already unlocked':'Unlock with Shards';b.disabled=!!o.owned||!manifest.features?.redemptions||(o.kind==='casino_coins'&&!manifest.features?.casino_exchange);b.onclick=()=>onRedeem(o);el.append(b);panel.append(el)}
 if(!data.offers?.length)panel.append(row('More to discover soon','New avatars and game unlocks will appear here as they become available. Your starter avatars stay free.'));break;
 case 'connections':
 for(const c of manifest.connections||[]){const connected=(data.connections||[]).find(v=>v.platform===c.id);panel.append(row(c.name,connected?'Connected · Verified '+new Date(connected.verified_at).toLocaleDateString():'Not available yet'))}break;
 case 'notice':panel.append(row(section.title,typeof section.text==='string'?section.text:''));break;
 default:continue;
 }
 panels.push(panel);
 }
 root.replaceChildren(...panels);
}
