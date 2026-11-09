export function newsletterPanel({sb,getUser}){
 return async function render(root){
  if(!root)return;const owner=getUser()?.id;root.replaceChildren();if(!owner)return;
  const current=()=>getUser()?.id===owner;
  const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  try{
   const r=await sb.rpc('dy_newsletter_preference');if(!current())return;if(r.error)throw r.error;
   const data=r.data||{},form=document.createElement('form');
   form.append(el('h3','Monthly studio news'),el('p','Optional updates about new games, releases and studio news. You can unsubscribe here at any time.'));
   const label=el('label','');label.className='check';const box=document.createElement('input');box.type='checkbox';box.checked=data.subscribed===true;box.disabled=!data.email_confirmed;label.append(box,document.createTextNode(' Email me the monthly Drunk Yeti newsletter'));form.append(label);
   form.append(el('p',data.email?'Delivery address: '+data.email:'Add a confirmed account email to subscribe.'));
   const button=el('button','Save newsletter preference');button.type='submit';button.disabled=!data.email_confirmed;
   const status=el('p','');status.setAttribute('role','status');form.append(button,status);
   form.onsubmit=async event=>{event.preventDefault();if(!current())return;button.disabled=true;try{
    const fresh=await sb.auth.getUser();if(fresh.error||fresh.data?.user?.id!==owner)throw Error('Your account changed. Refresh before saving.');
    const saved=await sb.rpc('dy_newsletter_set',{p_subscribed:box.checked});if(saved.error)throw saved.error;if(!current())return;
    box.checked=saved.data?.subscribed===true;status.textContent=box.checked?'Subscribed to monthly studio news.':'Unsubscribed from studio news.';
   }catch{if(current())status.textContent='Could not save your preference. Please try again.';}finally{if(current())button.disabled=false;}};
   root.replaceChildren(form);
  }catch{if(current())root.replaceChildren(el('p','Newsletter preferences are temporarily unavailable.'));}
 };
}
