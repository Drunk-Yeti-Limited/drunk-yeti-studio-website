const key='yeti.social_link';
export function rememberLink(storage,{owner,provider},now=Date.now()){
 if(!owner||!provider)throw Error('Sign in before connecting an account.');
 try{storage.setItem(key,JSON.stringify({owner,provider,at:now}));storage.setItem('yeti.social_return','1');}catch{throw Error('Allow browser storage before connecting an account.');}
}
export function clearLink(storage){try{storage.removeItem(key);storage.removeItem('yeti.social_return')}catch{}}
export function linkReturnResult(storage,user,error,now=Date.now()){
 let pending;try{pending=JSON.parse(storage.getItem(key)||'null')}catch{clearLink(storage);return null}
 if(!pending||!user)return null;
 clearLink(storage);
 if(!Number.isFinite(pending.at)||now-pending.at>30*60*1000||now<pending.at)return 'Connection verification expired. Check the list below before trying again.';
 if(user.id!==pending.owner)return 'The signed-in account changed. This connection has not been confirmed for your original account.';
 if(error)return 'The provider connection was not completed. Your existing Drunk Yeti account is unchanged.';
 return user.identities?.some(i=>i.provider===pending.provider)?'Connected '+pending.provider+' to your Drunk Yeti account. Your saves and purchases remain on this account.':'The connection was not confirmed. Select Connect to try again.';
}
