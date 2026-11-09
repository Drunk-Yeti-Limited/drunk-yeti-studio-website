// A one-use browser continuation, never an authentication or ownership claim.
export const MICROSOFT_XBOX_KEY='yeti.microsoft.xbox';
export function clearMicrosoftXbox(storage){storage.removeItem(MICROSOFT_XBOX_KEY);}
export function microsoftRedirect(storage,redirectTo,owner=null,now=Date.now()){
 const nonce=crypto.randomUUID();
 storage.setItem(MICROSOFT_XBOX_KEY,JSON.stringify({nonce,owner,at:now}));
 const url=new URL(redirectTo);url.searchParams.set('microsoft_xbox',nonce);return url.href;
}
export function consumeMicrosoftXbox(storage,{nonce,user,error,now=Date.now()}){
 let pending;try{pending=JSON.parse(storage.getItem(MICROSOFT_XBOX_KEY)||'null')}catch{clearMicrosoftXbox(storage);return false;}
 if(!pending||!nonce)return false;
 clearMicrosoftXbox(storage);
 return !error&&pending.nonce===nonce&&Number.isFinite(pending.at)&&now>=pending.at&&now-pending.at<15*60*1000&&!!user?.id&&(!pending.owner||pending.owner===user.id)&&user.identities?.some(i=>i.provider==='azure')===true;
}
