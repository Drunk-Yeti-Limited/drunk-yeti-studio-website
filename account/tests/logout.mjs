import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {logoutBrowser} from '../src/logout.js';
for(const fail of [false,true]){
 const values=new Map(),pending=new Map([['yeti.xbox.pending','proof'],['yeti.social_link','pending'],['unrelated','keep']]);
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const sessionStorage={removeItem:k=>pending.delete(k)};
 const storageKey='logout-test-'+fail;
 values.set(storageKey,JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:'test-user'}}));
 let called=false;
 const client=createClient('https://example.supabase.co','test-key',{auth:{storage,storageKey,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url)=>{called=true;assert(String(url).endsWith('/logout?scope=local'));return fail?Response.json({message:'unavailable'},{status:500}):new Response(null,{status:204});}}});
 const result=await logoutBrowser({client,storage:sessionStorage});assert(called);assert.equal(result.revocationPending,fail);assert.equal((await client.auth.getSession()).data.session,null);assert(!values.has(storageKey));assert(!pending.has('yeti.xbox.pending'));assert.equal(pending.get('unrelated'),'keep');
 await client.auth.stopAutoRefresh();
}
console.log('PASS real SDK local logout, failed server revocation, pending authorization cleanup, unrelated data preservation.');
