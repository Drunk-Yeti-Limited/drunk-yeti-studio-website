import {createClient} from '@supabase/supabase-js';
const url='https://rgafawpucqdhjrzodayl.supabase.co';
const key='sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy';
export async function logoutBrowser({client,storage}){
 const result=await client.auth.signOut({scope:'local'});
 for(const name of ['yeti.microsoft.xbox','yeti.xbox.pending','yeti.social_link','yeti.social_return','yeti.passwordRecovery.verified'])storage.removeItem(name);
 const session=await client.auth.getSession();
 if(session.error||session.data?.session)throw Error('Sign-out could not be confirmed. Please try again.');
 return {revocationPending:!!result.error};
}
export async function runLogout(){
 const status=document.getElementById('logout-status');
 try{
  if(window.self!==window.top&&document.hasStorageAccess&&!(await document.hasStorageAccess()))throw Error('Your browser blocks embedded session access. Open this logout page directly to finish signing out.');
  const client=createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:false}});
  const result=await logoutBrowser({client,storage:sessionStorage});
  status.textContent=result.revocationPending?'Signed out of this browser. The server could not confirm session revocation; previously issued tokens may remain valid until expiry.':'Signed out of this browser. Your linked accounts, saves and purchases are unchanged.';
 }catch(e){status.textContent=e.message||'Could not finish signing out. Open this page directly and try again.';}
}
