const key='yeti.newsletter.signup';
export function signupNewsletterData(checked=true){return {newsletter_subscribed:checked===true};}
export function rememberNewsletterChoice(storage,checked,now=Date.now()){
 storage.setItem(key,JSON.stringify({checked:checked===true,at:now}));
}
export async function applyNewsletterChoice(sb,storage,user,now=Date.now()){
 let pending;try{pending=JSON.parse(storage.getItem(key)||'null');}catch{return;}
 if(!pending||!user)return;
 if(!Number.isFinite(Date.parse(user.created_at))||!Number.isFinite(pending.at)||now-pending.at>30*60*1000||pending.at>now||Date.parse(user.created_at)<pending.at-5000){storage.removeItem(key);return;}
 const r=await sb.rpc('dy_newsletter_signup_choice',{p_subscribed:pending.checked===true});
 if(r.error)throw r.error;storage.removeItem(key);
}
