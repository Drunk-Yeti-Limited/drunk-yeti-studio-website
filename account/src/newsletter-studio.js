import {createClient} from '@supabase/supabase-js';
const sb=createClient('https://rgafawpucqdhjrzodayl.supabase.co','sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy');
const $=id=>document.getElementById(id);let id=crypto.randomUUID(),owner;
const message=t=>$('status').textContent=t;
const errors={studio_admin_required:'This page is restricted to the studio owner.',sender_setup_required:'Connect Brevo and verify your sender before queuing delivery.',no_confirmed_subscribers:'No subscribers have explicitly confirmed newsletter permission yet.',campaign_locked:'This newsletter is already queued and cannot be edited.'};
async function call(action='list',payload={}){
 const u=await sb.auth.getUser();if(u.error||!u.data?.user||owner&&owner!==u.data.user.id)throw Error('Sign in with your studio account, then reload this page.');owner=u.data.user.id;
 const r=await sb.rpc('dy_newsletter_admin',{p_action:action,p_payload:payload});if(r.error)throw Error(errors[r.error.message]||'Could not update the newsletter. Try again.');return r.data;
}
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
function preview(){$('preview-subject').textContent=$('subject').value;$('preview-body').textContent=$('body').value;}
$('subject').oninput=preview;$('body').oninput=preview;
function render(data){
 $('editor').hidden=false;$('login').hidden=true;
 $('connection').textContent=(data.enabled?'Delivery enabled':'Delivery off — Brevo connection, domain verification and mailing address still required')+' · '+data.eligible+' confirmed subscribers · From '+data.sender_email;
 $('campaigns').replaceChildren();
 for(const c of data.campaigns){const box=el('div','');box.className='item';box.append(el('h3',c.subject),el('p',c.status+' · '+c.submitted+' submitted / '+c.recipients+' recipients'+(c.review?' · Needs review':'') ));
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=()=>operate(fn);box.append(b);return b;};
 if(c.status==='draft'){button('Edit draft',()=>{id=c.id;$('subject').value=c.subject;$('body').value=c.body;preview();});button('Queue newsletter',async()=>{if(!confirm('Send “'+c.subject+'” to the currently confirmed newsletter audience? Delivery begins automatically when the worker runs.'))return;render(await call('queue',{id:c.id}));message('Newsletter queued.');}).disabled=!data.enabled;}
 if(c.status==='queued')button('Pause remaining batches',async()=>render(await call('pause',{id:c.id})));
 if(c.status==='paused')button('Resume remaining batches',async()=>render(await call('resume',{id:c.id})));
 $('campaigns').append(box);
 }
}
async function operate(fn){const buttons=[...document.querySelectorAll('button')],states=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){message(e.message);}finally{buttons.forEach((b,i)=>b.disabled=states[i]);}}
$('draft').onsubmit=e=>{e.preventDefault();operate(async()=>{render(await call('save',{id,subject:$('subject').value,body:$('body').value}));message('Draft saved. No email has been sent.');});};
$('new').onclick=()=>{id=crypto.randomUUID();$('subject').value='';$('body').value='';preview();message('New draft.');};
$('refresh').onclick=()=>operate(async()=>render(await call()));
call().then(render).then(()=>message('Ready.')).catch(e=>{message(e.message);$('login').hidden=false;});
