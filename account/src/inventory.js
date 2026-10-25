const balance=value=>/^\d+$/.test(String(value))?BigInt(value).toLocaleString():'—';
export function renderInventory(root,data){
 root.replaceChildren();
 const heading=document.createElement('div');heading.className='inventory-heading';
 const icon=document.createElement('img');icon.src='icons/shard.svg';icon.alt='';icon.width=64;icon.height=76;
 const copy=document.createElement('div'),eyebrow=document.createElement('p'),title=document.createElement('h2');eyebrow.className='eyebrow';eyebrow.textContent='YOUR INVENTORY';title.textContent='Yeti Shards';copy.append(eyebrow,title);heading.append(icon,copy);
 const counts=document.createElement('div');counts.className='inventory-balances';
 for(const [id,label,detail] of [['yeti-shards-web','Purchased Shards','Bought on the website'],['yeti-shards','Earned Shards','Earned through games']]){
  const wallet=(data.wallets||[]).find(w=>w.id===id),block=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('strong'),note=document.createElement('small');
  name.textContent=label;amount.textContent=wallet?balance(wallet.balance):'—';amount.dataset.currency=id;note.textContent=wallet?detail:'Balance unavailable';block.append(name,amount,note);counts.append(block);
 }
 const hint=document.createElement('p');hint.className='inventory-note';hint.textContent='These are your current balances. Test purchases add no Shards. Each game’s coins are tracked separately.';
 root.append(heading,counts,hint);
}
