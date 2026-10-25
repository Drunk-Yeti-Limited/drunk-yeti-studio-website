function row(title,detail){const el=document.createElement('div');el.className='item';const h=document.createElement('strong'),p=document.createElement('p');h.textContent=title;p.textContent=detail;el.append(h,p);return el}
const title=value=>String(value||'').replace(/^avatar:/,'').replace(/[-_:]/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
const number=value=>/^\d+$/.test(String(value))?BigInt(value).toLocaleString():'—';
export function renderWorld(root,manifest,data,onRedeem){
 const panels=[];
 for(const section of manifest.sections){
 const panel=document.createElement('section');panel.className='world-panel';const h=document.createElement('h3');h.textContent=section.title;panel.append(h);
 switch(section.type){
 case 'wallets':
 for(const w of data.wallets||[])panel.append(row(w.title,number(w.balance)+' · '+(w.kind==='earned'?'Earned through connected games':'Purchased · '+w.source_platform)+' · '+(w.game_id?title(w.game_id):'Shared across Drunk Yeti')));
 for(const w of data.game_wallets||[])panel.append(row(w.title+' coins',number(w.balance)+' · For this game only'));
 if(!data.game_wallets?.length)panel.append(row('Game coins','Separate game wallets will appear here when connected.'));
 panel.append(row('Buying Shards','Purchases are not available yet.'));
 for(const a of (data.activity||[]).slice(0,5))panel.append(row(a.reason,(String(a.delta).startsWith('-')?'':'+')+a.delta+' '+title(a.currency_id)+' · '+new Date(a.created_at).toLocaleDateString()));break;
 case 'achievements':
 for(const a of data.achievements||[])panel.append(row(a.title,title(a.game_id)+' · Earned '+new Date(a.earned_at).toLocaleDateString()));
 if(!data.achievements?.length)panel.append(row('Your next adventure awaits','Achievements from connected games will appear here.'));break;
 case 'unlocks':
 for(const a of data.unlocks||[])panel.append(row(title(a.item_id),title(a.game_id)));
 if(!data.unlocks?.length)panel.append(row('A world of possibilities','Earn cross-game unlocks through achievements, or spend Shards when offers are available.'));break;
 case 'store':
 for(const o of data.offers||[]){const el=row(o.title,number(o.cost)+' '+title(o.currency_id)+(o.kind==='casino_coins'?' · '+number(o.coin_amount)+' game coins':''));
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
