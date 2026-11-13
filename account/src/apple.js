// Presentation only: Apple stays available elsewhere so accounts can travel
// between devices. Supabase settings and the manifest still gate availability.
export function isAppleDevice(device=globalThis.navigator){
 const platform=device?.userAgentData?.platform||device?.platform||'';
 return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(device?.userAgent||'')||/^(Mac|iPhone|iPad|iPod)/i.test(platform);
}

export function orderedSignInMethods(methods,device=globalThis.navigator){
 if(!isAppleDevice(device))return [...methods];
 return [...methods.filter(p=>p.id==='apple'),...methods.filter(p=>p.id!=='apple')];
}

export function providerLabel(provider){
 return provider.id==='apple'?'Sign in with Apple':provider.id==='azure'?'Sign in with Microsoft':'Continue with '+provider.name;
}
