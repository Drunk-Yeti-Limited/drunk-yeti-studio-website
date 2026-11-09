// Official provider assets, hosted locally. See provider-logos/SOURCES.md.
const known=new Set(['google','discord','github','twitch','x']);
export function decorateProviderButton(button,provider){
 if(!known.has(provider))return;
 button.classList.add('provider-button');button.dataset.provider=provider;
 const label=document.createElement('span');label.textContent=button.textContent;
 const logo=document.createElement('img');logo.src='./provider-logos/'+provider+'.svg';logo.alt='';logo.setAttribute('aria-hidden','true');logo.width=24;logo.height=24;
 button.replaceChildren(logo,label);
}
