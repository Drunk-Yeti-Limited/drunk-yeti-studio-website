import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from '../../account/node_modules/linkedom/esm/index.js';
const {document}=parseHTML('<main></main>');
const source=await readFile(new URL('../../catalog.js',import.meta.url),'utf8');
const definitions=source.slice(0,source.indexOf('function render()'));
const ctx=vm.createContext({document});vm.runInContext(definitions,ctx);
for(const category of ['Games','Tools','Mods','Assets','Soundtracks','Comics']){
 const card={title:'Example',description:'Demo',url:'https://drunkyeti.itch.io/example',image:'./assets/logo.png',category,frostpass:true};
 ctx.card=card;const el=vm.runInContext('projectCard(card)',ctx);
 assert.equal(el.querySelector('.frostpass').textContent,'Yeti Frostpass');
 card.frostpass=false;assert.equal(vm.runInContext('projectCard(card)',ctx).querySelector('.frostpass'),null);
 card.frostpass='true';assert.equal(vm.runInContext('projectCard(card)',ctx).querySelector('.frostpass'),null);
}
console.log('PASS Frostpass badges across all categories and strict boolean flag');
