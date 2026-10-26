import {renderWorld} from './world.js';
export function renderMarketplace(root,manifest,data,onRedeem){
 root.replaceChildren();
 const intro=document.createElement('p');intro.className='muted';intro.textContent='Spend Shards on characters and future unlocks. Character purchases stay on your account; supported apps can recognize the same ownership.';
 const controls=document.createElement('div');controls.className='market-controls';
 const search=document.createElement('input');search.type='search';search.placeholder='Find an item';search.setAttribute('aria-label','Search marketplace');
 const owned=document.createElement('button');owned.type='button';owned.className='secondary';owned.textContent='My items';owned.setAttribute('aria-pressed','false');
 const list=document.createElement('div');list.className='market-grid';
 const note=document.createElement('p');note.className='fine';note.textContent='Each avatar costs 100 Shards. Choose purchased or earned Shards; balances are kept separate. Desktop Buddy skins and other themes will appear as those apps add support.';
 const render=()=>{
  const query=search.value.trim().toLowerCase(),onlyOwned=owned.getAttribute('aria-pressed')==='true';
  const offers=(data.offers||[]).filter(o=>(!query||String(o.title).toLowerCase().includes(query))&&(!onlyOwned||o.owned||(data.unlocks||[]).some(u=>u.game_id===o.target_game&&u.item_id===o.item_id)));
  renderWorld(list,{...manifest,sections:[{id:'marketplace',type:'store',title:'Available items'}]},{...data,offers},onRedeem);
  if(!offers.length)list.textContent=onlyOwned?'Your purchased items will appear here.':query?'No matching items.':'New items are on their way. Check back soon.';
 };
 search.oninput=render;owned.onclick=()=>{owned.setAttribute('aria-pressed',String(owned.getAttribute('aria-pressed')!=='true'));render()};
 controls.append(search,owned);root.append(intro,controls,note,list);render();
}
