import {assetURL} from '../sdk/account-client.js';
export let avatars = [
  {id:'yeti',name:'Drunk Yeti',image:'../assets/logo.png'},
  {id:'raccoon',name:'Raccoon',image:'avatars/raccoon.png'},
  {id:'fox',name:'Fox',image:'avatars/fox.png'},
  {id:'beaver',name:'Beaver',image:'avatars/beaver.png'},
  {id:'seagull',name:'Seagull',image:'avatars/seagull.png'},
  {id:'otter',name:'Otter',image:'avatars/otter.png'},
  {id:'owl',name:'Owl',image:'avatars/owl.png'},
];
export const avatarFor = id => avatars.find(avatar => avatar.id === id) || avatars[0];
export function showAvatar(element,id){
  const avatar=avatarFor(id),img=document.createElement('img');
  img.src=avatar.image;img.alt='';img.width=80;img.height=80;
  img.onerror=()=>{img.onerror=null;img.src=avatars[0].image};
  element.dataset.avatar=avatar.id;
  element.setAttribute('aria-label',avatar.name+' avatar');
  element.replaceChildren(img);
}

export function setAvatarCatalog(catalog){if(Array.isArray(catalog)&&catalog.some(a=>a.id==='yeti'))avatars=catalog.filter(a=>assetURL(a.image));}
