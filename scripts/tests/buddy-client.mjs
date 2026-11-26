import assert from 'node:assert/strict';
import {BuddyClient, rememberPairing, savedPairing, takePairingFragment} from '../../desktop-buddy/bridge-client.mjs';
const calls=[];const token='a'.repeat(32);
const client=new BuddyClient(async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({version:1,available:true,events:[]})};});
assert.equal(calls.length,0);
await assert.rejects(()=>client.act('wave'),/Connect/);
await assert.rejects(()=>client.connect('invalid'),/32-character/);
assert.equal(calls.length,0);
await client.connect(token);
assert.equal(calls[0].url,'http://127.0.0.1:47864/v1/status');
assert.equal(calls[0].options.credentials,'omit');
assert.equal(calls[0].options.referrerPolicy,'no-referrer');
assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);
await client.act('wave');assert.deepEqual(JSON.parse(calls.at(-1).options.body),{action:'wave'});
await assert.rejects(()=>client.act('open-url'),/Unsupported/);
await client.disconnect();assert.equal(client.token,'');
const denied=new BuddyClient(async()=>({ok:false,json:async()=>({error:'Pairing expired'})}));
await assert.rejects(()=>denied.connect(token),/Pairing expired/);assert.equal(denied.token,'');
console.log('Buddy client: opt-in, fixed endpoint, bounded actions and token cleanup passed.');

const session = new Map();
globalThis.sessionStorage = {
  getItem: key => session.get(key),
  setItem: (key, value) => session.set(key, value),
  removeItem: key => session.delete(key),
};
rememberPairing(token);
assert.equal(savedPairing(), token);
rememberPairing('');
assert.equal(savedPairing(), '');
globalThis.location = {hash: '#buddy=' + token, pathname: '/desktop-buddy/', search: '?source=app'};
let replaced;
globalThis.history = {state: null, replaceState: (_state, _unused, url) => { replaced = url; }};
assert.equal(takePairingFragment(), token);
assert.equal(replaced, '/desktop-buddy/?source=app');
location.hash = '#link-title';
assert.equal(takePairingFragment(), '');
console.log('Same-tab pairing storage and fragment cleanup passed.');
