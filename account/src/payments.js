export function purchaseConfirmation(order){
 if(!order)return '';
 if(order.status==='test_complete'&&order.livemode===false)return 'Test payment confirmed for '+order.title+'. No real money was charged. Your Yeti World balance stays unchanged because test purchases do not add spendable Shards.';
 if(order.status==='fulfilled'&&order.livemode===true)return 'Payment confirmed for '+order.title+'. Purchased Shards have been added to your account.';
 if(order.status==='review')return 'This purchase is under payment review. Check purchase history for its status.';
 return 'Checkout started for '+order.title+'. Payment has not been confirmed yet. Your balance changes only after a verified real payment.';
}
export function stripeCheckoutURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function renderPayments(root,catalog,onBuy){
 root.replaceChildren();if(catalog.orders?.length){const confirmation=document.createElement('p');confirmation.className='purchase-confirmation';confirmation.setAttribute('role','status');confirmation.textContent='Latest purchase: '+purchaseConfirmation(catalog.orders[0]);root.append(confirmation);}const notice=document.createElement('p');notice.className='fine';notice.textContent=catalog.mode==='preview'?'Price preview · Checkout is not open yet.':catalog.mode==='test'?'Test checkout · No real charge and no spendable Shards.':'Secure checkout by Stripe. Shards arrive after payment verification.';root.append(notice);
 const grid=document.createElement('div');grid.className='shard-packs';
 for(const pack of catalog.packs||[]){const card=document.createElement('div');card.className='shard-pack';const h=document.createElement('h3'),price=document.createElement('p'),b=document.createElement('button');h.textContent=pack.title;price.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:pack.currency}).format(pack.amount_cents/100);b.type='button';b.textContent=catalog.mode==='test'?'Try test checkout':catalog.available?'Buy Shards':'Coming soon';b.disabled=!catalog.available||!pack.available;b.onclick=()=>onBuy(pack);card.append(h,price,b);grid.append(card)}root.append(grid);
 const usage=document.createElement('p');usage.className='fine';usage.textContent='Purchased Shards are tracked separately from earned Shards. They are for supported account unlocks, have no cash value, and cannot be converted to casino coins. Visit Yeti World to spend Shards on available character unlocks.';root.append(usage);
 const heading=document.createElement('h3');heading.textContent='Purchase history';root.append(heading);
 const labels={created:'Checkout started',open:'Awaiting payment',fulfilled:'Shards added',test_complete:'Test payment confirmed · no real charge or spendable Shards',review:'Under payment review'};
 for(const order of catalog.orders||[]){const p=document.createElement('p');p.className='item';p.textContent=order.title+' · '+(labels[order.status]||'Processing')+' · '+new Date(order.created_at).toLocaleDateString();root.append(p)}
 if(!catalog.orders?.length){const p=document.createElement('p');p.className='fine';p.textContent='No purchases yet.';root.append(p)}
}
