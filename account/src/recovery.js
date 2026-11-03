// Recovery emails must work when a mail app opens a different browser/profile.
// Only recovery uses the implicit email flow. OAuth/signup remain PKCE.
export function recoveryCallback(href){
 const params=new URLSearchParams(new URL(href).hash.slice(1));
 return params.get('type')==='recovery'&&!!params.get('access_token')&&!!params.get('refresh_token');
}
export function accountAuthOptions(href){
 return {flowType:recoveryCallback(href)?'implicit':'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true};
}
export function recoveryRequestOptions(){
 return {flowType:'implicit',detectSessionInUrl:false,persistSession:false,autoRefreshToken:false,storageKey:'yeti-recovery-email-request'};
}
