import {BuddyClient, rememberPairing, savedPairing, takePairingFragment} from './bridge-client.mjs';
const client=new BuddyClient();
const el=id=>document.getElementById(id);
let connected=false, timer, lastEvent=0, polling=false;
const status=message=>{el('status').textContent=message;};
const fragmentCode=takePairingFragment();
const launchCode=fragmentCode || savedPairing();
if(launchCode){
  el('pairing-code').value=launchCode;
  status('Pairing code ready. Choose Connect to link this browser.');
}
const routes={games:['/play/','Open the studio game library'],comics:['/comics/','Open the studio comics']};
function clearConnection(message){rememberPairing('');connected=false;clearTimeout(timer);client.forget();el('actions').hidden=true;el('buddy-offer').hidden=true;el('connect').disabled=false;el('pairing-code').value='';status(message);}
function effect(kind){
  if(Object.hasOwn(routes,kind)){
    const [path,title]=routes[kind];
    const offer=el('buddy-offer');
    offer.href=path;offer.textContent=title;offer.hidden=false;
    status('Buddy shared a studio page.');
    return;
  }
  status(kind==='snow'?'Your desktop Yeti sent a little snow.':'Your desktop Yeti says hello!');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer=el('effects');layer.replaceChildren();
  if(kind==='snow') for(let i=0;i<20;i++){const flake=document.createElement('span');flake.textContent='❄';flake.className='snowflake snow-'+(i%5);flake.style.left=(5+i*4.7)+'%';layer.append(flake);}
  else {const wave=document.createElement('span');wave.className='wave';wave.textContent='👋';layer.append(wave);}
  setTimeout(()=>layer.replaceChildren(),4000);
}
async function poll(){
  clearTimeout(timer);
  if(!connected||document.hidden||polling)return;
  polling=true;
  try {const data=await client.request('status');if(!connected)return;
    for(const event of data.events||[]){if(Number.isInteger(event.id)&&event.id>lastEvent&&['wave','snow','games','comics'].includes(event.kind)){lastEvent=event.id;effect(event.kind);}}
    el('availability').textContent=data.available?'Buddy is ready to react.':'Buddy is resting, busy or hidden. Reactions resume when he is available.';
  }catch{clearConnection('Connection ended. Keep Buddy’s Website link window open, allow local-network access if your browser asks, then reconnect.');}
  finally{polling=false;if(connected&&!document.hidden)timer=setTimeout(poll,3000);}
}
async function connectPairing(){
  el('connect').disabled=true;status('Connecting to Buddy on this computer…');
  try {const data=await client.connect(el('pairing-code').value);rememberPairing(client.token);el('pairing-code').value='';connected=true;
    lastEvent=Math.max(0,...(data.events||[]).map(e=>Number(e.id)||0));el('actions').hidden=false;
    status('Connected for this session. Close the native Website link window to disconnect.');await poll();
  }catch(error){clearConnection(error instanceof TypeError||error.name==='AbortError'?'Could not reach Buddy. Install the Website Link adapter, enable it in Buddy, and allow local-network access if prompted. Mobile devices cannot connect to Buddy on another computer.':error.message);}
}
el('pair').addEventListener('submit',event=>{event.preventDefault();connectPairing();});
if(!fragmentCode&&launchCode&&!document.hidden)connectPairing();
for(const button of document.querySelectorAll('[data-reaction]'))button.addEventListener('click',async()=>{
  button.disabled=true;
  try{await client.act(button.dataset.reaction);status('Reaction requested. Buddy respects quiet, focus and sleep settings.');}
  catch(error){status(error.message);}
  finally{button.disabled=false;}
});
el('disconnect').addEventListener('click',async()=>{connected=false;clearTimeout(timer);try{await client.disconnect();}catch{}clearConnection('Disconnected. Enable a fresh code in Buddy to connect again.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else poll();});
window.addEventListener('pagehide',()=>clearTimeout(timer));
window.addEventListener('pageshow',event=>{if(event.persisted)poll();});
