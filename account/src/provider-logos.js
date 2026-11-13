// Official provider assets, hosted locally. See provider-logos/SOURCES.md.
const known=new Set(['apple','azure','google','discord','github','twitch','x']);
export function decorateProviderButton(button,provider){
 if(!known.has(provider))return;
 button.classList.add('provider-button');button.dataset.provider=provider;
 const label=document.createElement('span');label.textContent=button.textContent;
 const logo=document.createElement('img');logo.src='./provider-logos/'+provider+'.svg';logo.alt='';logo.setAttribute('aria-hidden','true');logo.width=24;logo.height=24;
 if(provider==='apple'){
  logo.src='./provider-logos/apple-signin.svg';logo.width=210;logo.height=44;
  label.className='apple-accessible-label';
  // Preserve a readable button if the local artwork cannot load.
  logo.onerror=()=>{logo.hidden=true;label.className='';};
 }
 button.replaceChildren(logo,label);
}

export function providerMark(provider){
 if(!known.has(provider))return null;
 const mark=document.createElement('span');mark.className='provider-mark';mark.dataset.provider=provider;
 const img=document.createElement('img');img.src='./provider-logos/'+provider+'.svg';img.alt='';img.width=24;img.height=24;img.setAttribute('aria-hidden','true');mark.append(img);return mark;
}
