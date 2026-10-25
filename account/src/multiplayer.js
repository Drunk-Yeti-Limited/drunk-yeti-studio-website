import {avatarFor,showAvatar} from './avatars.js';
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
export function renderMultiplayer(root,manifest,data,onPrivacy){
 root.replaceChildren();
 const intro=element('p','Play together with your Yeti account. Friends, avatars and activity will travel between supported games. Multiplayer is free for players.','muted');root.append(intro);
 const games=element('div',undefined,'multiplayer-games');
 for(const game of manifest.games||[]){const card=element('div',undefined,'item');card.append(element('strong',game.title),element('p',game.available?'Available in the connected game':'Multiplayer coming soon'));games.append(card)}
 root.append(games);
 root.append(element('p','Guest players will receive a numbered Guest name. Sign in to use your profile and friends.','fine'));
 const form=element('form');const title=element('h3','Share with your friends');form.append(title);
 for(const [id,label,key] of [['mp-presence','Show accepted friends when I’m online and which game I’m playing','share_presence'],['mp-coins','Also show my game coin balance where supported','share_coins']]){
  const row=element('label',undefined,'check'),input=element('input');input.type='checkbox';input.id=id;input.checked=data.privacy?.[key]===true;row.append(input,document.createTextNode(label));form.append(row);
 }
 form.append(element('p','Activity sharing is off by default. Coin sharing applies only while activity sharing is on. Purchased Shards and payment history stay private.','fine'));
 const save=element('button','Save sharing preferences');save.type='submit';form.append(save);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await onPrivacy(form.querySelector('#mp-presence').checked,form.querySelector('#mp-coins').checked)}finally{save.disabled=false}};
 root.append(form,element('h3','Friends playing now'));
 if(!data.friends?.length)root.append(element('p','No shared activity right now. Add friends in Your people, and choose what you want to share.','muted'));
 for(const friend of data.friends||[]){const row=element('div',undefined,'item');const pic=element('span',undefined,'avatar-picture');pic.setAttribute('role','img');pic.setAttribute('aria-label',avatarFor(friend.avatar_id).name);showAvatar(pic,friend.avatar_id);
 const title=manifest.games?.find(g=>g.id===friend.game_id)?.title||'Online';
 row.append(pic,element('strong',friend.name||'Yeti player'),element('p',title+(typeof friend.coins==='string'&&/^\d+$/.test(friend.coins)?' · '+friend.coins+' game coins':'')));root.append(row);
 }
 if(data.room)root.append(element('p','Your '+(manifest.games?.find(g=>g.id===data.room.game_id)?.title||'game')+' lobby is '+(data.room.status==='ready'?'matched':'waiting for players')+'. Return to the game to continue.','fine'));
 if(data.invites?.length)root.append(element('p','You have '+data.invites.length+' friend lobby invitation(s). Open the matching game to join.','fine'));
}
