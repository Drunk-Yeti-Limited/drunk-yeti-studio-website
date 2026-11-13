const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function userManager({invoke,reload,status}){
 let dialog,selected,role,actor;
 function close(){if(dialog){dialog.querySelectorAll('input[type=password]').forEach(e=>e.value='');dialog.close();dialog.remove();dialog=null;}selected=null;}
 function open(account,myRole,myId){
  close();selected=account;role=myRole;actor=myId;
  dialog=el('dialog');dialog.className='user-dialog';dialog.setAttribute('aria-labelledby','manage-user-title');
  const title=el('h2','Manage account');title.id='manage-user-title';dialog.append(title,el('p',account.email||account.id));
  const protectedAccount=account.id===actor||account.studio_role==='owner'||(account.studio_role==='admin'&&role!=='owner');
  const exit=el('button','Close');exit.type='button';exit.onclick=close;dialog.append(exit);
  if(protectedAccount){dialog.append(el('p','This account is protected. Use your own account settings for personal changes.'));document.body.append(dialog);dialog.showModal();return;}
  const form=el('form');form.id='manage-user-form';
  const field=(title,id,value='',type='text')=>{const label=el('label',title),input=el('input');input.id=id;input.type=type;input.value=value;label.append(input);form.append(label);return input;};
  const choiceLabel=el('label','Action'),choice=el('select');choice.id='user-action';
  for(const [value,label] of [['profile','Edit username and display name'],['reset_password','Send password recovery email'],['revoke_sessions','Sign out refresh sessions'],['suspend','Suspend sign-in'],['restore','Restore sign-in'],...(role==='owner'?[['set_password','Set password (owner only)']]:[]),['delete','Permanently delete account']]){const o=el('option',label);o.value=value;choice.append(o);}choiceLabel.append(choice);form.append(choiceLabel);
  const handle=field('Username','user-handle',account.handle||'');handle.pattern='[a-z][a-z0-9_]{2,23}';handle.maxLength=24;
  const name=field('Display name','user-display-name',account.display_name||'');name.maxLength=48;
  const password=field('New password','user-password','','password');password.autocomplete='new-password';password.minLength=12;password.maxLength=128;
  const confirmation=field('Type the exact account email to confirm deletion','user-confirmation');confirmation.autocomplete='off';
  const reason=field('Reason (saved in the audit log)','user-reason');reason.required=true;reason.minLength=3;reason.maxLength=500;
  const notice=el('p');notice.className='fine';const result=el('p');result.setAttribute('role','status');
  const save=el('button','Review and apply');save.type='submit';form.append(notice,save,result);
  const change=()=>{const a=choice.value;for(const [input,visible] of [[handle,a==='profile'],[name,a==='profile'],[password,a==='set_password'],[confirmation,a==='delete']]){input.parentElement.hidden=!visible;input.disabled=!visible;input.required=visible;}password.value='';confirmation.value='';notice.textContent=a==='delete'?'Deletion is permanent and removes the account and linked game data. Accounts with billing records require a separate billing review.':a==='set_password'?'Use recovery email when possible. This changes the password and revokes refresh sessions. Existing access tokens may remain valid until expiry.':a==='suspend'||a==='revoke_sessions'?'Refresh sessions will be revoked. Existing access tokens may remain valid until expiry; suspension also blocks sign-in and account-service actions.':'Changes apply to this account only and are recorded with your reason.';};choice.onchange=change;change();
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;const target=selected;if(!target)return;
   if(choice.value==='delete'&&confirmation.value!==target.email){result.textContent='Enter the exact account email.';return;}
   if(!confirm('Apply “'+choice.selectedOptions[0].textContent+'” to '+target.email+'?'))return;
   save.disabled=true;exit.disabled=true;choice.disabled=true;dialog.oncancel=e=>e.preventDefault();
   try{const response=await invoke({action:choice.value,target:target.id,reason:reason.value.trim(),handle:handle.value.trim(),display_name:name.value.trim(),confirmation:confirmation.value,password:password.value});password.value='';await reload();status(response.message||'Account updated.');close();}
   catch(e){password.value='';result.textContent=e.message||'Could not complete this action.';}
   finally{save.disabled=false;exit.disabled=false;choice.disabled=false;if(dialog)dialog.oncancel=()=>close();}
  };
  dialog.oncancel=()=>close();dialog.append(form);document.body.append(dialog);dialog.showModal();
 }
 return {open,close};
}
