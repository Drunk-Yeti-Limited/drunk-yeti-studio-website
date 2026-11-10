import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {adminEntry} from '../src/admin-entry.js';
const {document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
const dialog=document.getElementById('admin-welcome');let shown=0;
dialog.showModal=()=>{dialog.open=true;shown++};dialog.close=()=>{dialog.open=false};
const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const entry=adminEntry({document,storage});const link=document.getElementById('studio-admin-link'),social=document.getElementById('social-admin-link');
for(const result of [{data:null},{data:{role:'member'}},{error:{message:'denied'},data:{role:'owner'}}]){entry.show('ordinary',result);assert.equal(link.hidden,true);assert.equal(social.hidden,true);assert.equal(shown,0);}
entry.show('owner',{data:{role:'owner'}});assert.equal(shown,1);assert.equal(dialog.open,true);assert.equal(link.hidden,false);assert.equal(social.hidden,false);
document.getElementById('admin-stay').click();assert.equal(dialog.open,false);assert.equal(link.hidden,false);
entry.show('owner',{data:{role:'owner'}});assert.equal(shown,1);
entry.reset();assert.equal(link.hidden,true);entry.show('owner',{data:{role:'owner'}});assert.equal(shown,2);
entry.show('admin',{data:{role:'admin'}});assert.equal(shown,3);assert.match(social.textContent,/admin/);
entry.clear();assert.equal(dialog.open,false);assert.equal(social.hidden,true);
console.log('PASS admin popup: role allowlist, errors fail closed, owner/admin entry, dismissal, session deduplication, logout and account clearing');
