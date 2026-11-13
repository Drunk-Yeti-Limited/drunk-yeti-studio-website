import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {GoTrueClient} from '@supabase/auth-js';
import {isAppleDevice,orderedSignInMethods,providerLabel} from '../src/apple.js';
import {loginMethods} from '../sdk/account-client.js';
import {decorateProviderButton} from '../src/provider-logos.js';
import {renderSignInConnections} from '../src/social.js';
import {accountAuthOptions} from '../src/recovery.js';
import {providerSignInOptions} from '../src/oauth.js';

const apple={id:'apple',name:'Apple'},google={id:'google',name:'Google'},methods=[google,apple];
for(const device of [
 {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'},
 {userAgent:'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)'},
 {platform:'MacIntel',maxTouchPoints:5},
 {userAgentData:{platform:'macOS'}},
 {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
]){assert.equal(isAppleDevice(device),true);assert.deepEqual(orderedSignInMethods(methods,device),[apple,google]);}
for(const device of [{userAgent:'Mozilla/5.0 (Linux; Android 16)'},{platform:'Win32'},{},null]){
 assert.equal(isAppleDevice(device),false);assert.deepEqual(orderedSignInMethods(methods,device),methods);
}
assert.deepEqual(methods,[google,apple]);
assert.equal(providerLabel(apple),'Sign in with Apple');
const manifest={auth:{providers:[{...apple,ready_surfaces:['web']}]}};
assert.deepEqual(loginMethods(manifest,{external:{apple:true}}),[apple]);
assert.deepEqual(loginMethods(manifest,{external:{apple:false}}),[]);
assert.deepEqual(loginMethods(manifest,{external:{apple:true}},'ios'),[]);
assert.deepEqual(loginMethods({auth:{providers:[{...apple,ready_surfaces:[]}]}},{external:{apple:true}}),[]);

const {document}=parseHTML('<button>Sign in with Apple</button><div id="connections"></div>');
globalThis.document=document;
const button=document.querySelector('button');decorateProviderButton(button,'apple');
assert.equal(button.dataset.provider,'apple');assert.equal(button.textContent,'Sign in with Apple');
assert.equal(button.querySelector('img').src,'./provider-logos/apple-signin.svg');
assert.equal(button.querySelector('img').getAttribute('aria-hidden'),'true');
button.querySelector('img').onerror();assert.equal(button.querySelector('img').hidden,true);assert.equal(button.querySelector('span').className,'');
let linked=null;
const root=document.getElementById('connections');
renderSignInConnections(root,[],methods,{link:id=>linked=id,canLink:true});
root.querySelector('[data-provider="apple"] button').click();assert.equal(linked,'apple');
renderSignInConnections(root,[{id:'apple-id',provider:'apple',identity_data:{email:'relay@privaterelay.appleid.com'}}],methods,{canLink:true});
assert.match(root.textContent,/Verified through Apple/);assert.equal(root.querySelector('[data-provider="apple"] button').disabled,true);

const callback='https://www.drunkyetistudio.com/account/';
const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const client=new GoTrueClient({url:'https://auth.example.test',...accountAuthOptions(callback),autoRefreshToken:false,storage,storageKey:'apple-test',fetch:async()=>{throw Error('OAuth start must not exchange credentials');}});
await client.initialize();
const credentials=providerSignInOptions('apple',callback);credentials.options.skipBrowserRedirect=true;
const result=await client.signInWithOAuth(credentials);assert.equal(result.error,null);
const url=new URL(result.data.url);
assert.equal(url.searchParams.get('provider'),'apple');assert.equal(url.searchParams.get('redirect_to'),callback);
assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.ok(url.searchParams.get('code_challenge').length>30);
assert.ok(values.get('apple-test-code-verifier'));assert.equal(url.searchParams.has('client_secret'),false);
await client.stopAutoRefresh();
console.log('PASS Apple device ordering, cross-device access, availability gates, accessible artwork fallback, identity linking and real SDK PKCE start');
