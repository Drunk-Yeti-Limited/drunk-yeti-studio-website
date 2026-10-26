export function billingURL(value,kind){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===(kind==='portal'?'billing.stripe.com':'checkout.stripe.com')&&!u.username&&!u.password?u.href:null}catch{return null}}
export function renderFrostpass(root,data,onSubscribe,onManage){
 root.replaceChildren();const c=data.catalog||{},m=data.membership||{};
 const h=document.createElement('h3');h.textContent=c.title||'Yeti Frostpass';
 const price=document.createElement('p');price.className='frostpass-price';price.textContent=Number.isInteger(c.amount_cents)?new Intl.NumberFormat('en-US',{style:'currency',currency:c.currency||'usd'}).format(c.amount_cents/100)+'/month':'Pricing coming soon';
 const perks=document.createElement('p');perks.textContent=(c.monthly_shards||1000).toLocaleString()+' Shards after each successful monthly payment, plus full access to participating apps and games.';
 const state=document.createElement('p');state.className='purchase-confirmation';state.setAttribute('role','status');
 state.textContent=m.test?'Test subscription · No real full-access entitlement or spendable Shards.':m.active?'Frostpass active':m.status&&m.status!=='none'?'Membership: '+m.status.replaceAll('_',' '):'Not subscribed';
 if(m.period_end&&m.active)state.textContent+=' · '+(m.cancel_at_period_end?'Access ends ':'Renews ')+new Date(m.period_end).toLocaleDateString();
 const note=document.createElement('p');note.className='fine';note.textContent='Renews monthly until canceled. Cancel through Manage subscription. Unspent Shards roll over; avatars and themes you buy stay yours. App access lasts through the paid period. Shards have no cash value and are not casino coins.';
 root.append(h,price,perks,state,note);
 if(data.sync_pending){const p=document.createElement('p');p.className='fine';p.textContent='Billing verification is temporarily delayed. Refresh shortly.';root.append(p);}
 const b=document.createElement('button');b.type='button';
 if(m.can_manage){b.textContent='Manage subscription';b.onclick=onManage;}
 else{b.textContent=c.available?(c.mode==='test'?'Try test subscription':'Subscribe to Yeti Frostpass'):'Coming soon';b.disabled=!c.available;b.onclick=()=>onSubscribe(c);}
 root.append(b);
 if(m.can_manage&&['canceled','incomplete_expired'].includes(m.status)&&c.available){const again=document.createElement('button');again.type='button';again.textContent='Subscribe again';again.onclick=()=>onSubscribe(c);root.append(again);}
 if(!c.available&&!m.can_manage){const p=document.createElement('p');p.className='fine';p.textContent='Subscriptions open once billing verification and participating app integrations are ready.';root.append(p);}
 const list=document.createElement('ul');list.className='frostpass-products';
 for(const product of c.products||[]){const li=document.createElement('li');li.textContent=product.title+' · '+(product.ready?'Included':'Integration planned');list.append(li);}root.append(list);
}
