import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {renderInventory} from '../src/inventory.js';
const {document}=parseHTML('<section></section>');globalThis.document=document;const root=document.querySelector('section');
renderInventory(root,{wallets:[{id:'yeti-shards-web',balance:'1200'},{id:'yeti-shards',balance:'9007199254740991'}],game_wallets:[{balance:'50000'}]});
assert.equal(root.querySelector('[data-currency="yeti-shards-web"]').textContent,'1,200');assert.match(root.textContent,/9,007,199,254,740,991/);assert.doesNotMatch(root.textContent,/50,000/);assert.equal(root.querySelector('img').getAttribute('src'),'icons/shard.svg');
renderInventory(root,{wallets:[]});assert.match(root.textContent,/Balance unavailable/);assert.equal(root.querySelector('[data-currency="yeti-shards-web"]').textContent,'—');
renderInventory(root,{wallets:[{id:'yeti-shards-web',balance:'0'}]});assert.equal(root.querySelector('[data-currency="yeti-shards-web"]').textContent,'0');
console.log('PASS Shard inventory separates purchased/earned/game coins, preserves exact amounts and distinguishes unavailable from zero');
