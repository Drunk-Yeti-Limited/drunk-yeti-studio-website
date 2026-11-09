export function adminEntry({document,storage}) {
 const link=document.getElementById('studio-admin-link'),social=document.getElementById('social-admin-link'),dialog=document.getElementById('admin-welcome');
 let current=null;
 const clear=()=>{link.hidden=true;social.hidden=true;if(dialog.open)dialog.close();current=null;};
 document.getElementById('admin-stay').onclick=()=>dialog.close();
 return {clear,show(userId,result){
  clear();const role=!result?.error&&result?.data?.role;
  if(!userId||!['owner','admin'].includes(role))return;
  current=userId;link.hidden=false;social.hidden=false;
  link.textContent=social.textContent='Open studio admin · '+role;
  document.getElementById('admin-role').textContent='You have '+role+' access to Drunk Yeti Studio.';
  const key='yeti.adminWelcome.'+userId;
  let seen=false;try{seen=storage.getItem(key)==='1';}catch{}
  if(!seen){dialog.showModal();try{storage.setItem(key,'1');}catch{}}
 },reset(){if(current){try{storage.removeItem('yeti.adminWelcome.'+current);}catch{}}clear();}};
}
