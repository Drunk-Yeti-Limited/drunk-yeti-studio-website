// Account contract v1. No credentials, executable code or arbitrary action URLs in manifests.
export const ACCOUNT_SCHEMA=1;
export const ACCOUNT_ORIGIN='https://www.drunkyetistudio.com';
const providers=new Set(['google','apple','facebook']);
const sectionTypes=new Set(['wallets','achievements','unlocks','store','connections','notice']);
export function assetURL(value){
 try {const u=new URL(value,ACCOUNT_ORIGIN);return u.origin===ACCOUNT_ORIGIN&&/^\/(assets|account\/avatars)\/[a-zA-Z0-9_.-]+\.(png|webp|jpg)$/.test(u.pathname)&&!u.search&&!u.hash?u.href:null}catch{return null}
}
export function normalizeManifest(raw){
 if(raw?.schema_version!==1||raw.minimum_client_schema>1)throw Error('An account client update is needed. Open your account on the studio website.');
 return {...raw,refresh_after_seconds:Math.max(60,Math.min(3600,Number(raw.refresh_after_seconds)||60)),
 sections:(Array.isArray(raw.sections)?raw.sections:[]).filter(s=>s&&sectionTypes.has(s.type)&&typeof s.id==='string'&&typeof s.title==='string').slice(0,30),
 avatars:(Array.isArray(raw.avatars)?raw.avatars:[]).filter(a=>a&&/^[a-z][a-z0-9_-]{0,63}$/.test(a.id)&&typeof a.name==='string'&&assetURL(a.image)).map(a=>({...a,image:assetURL(a.image)}))};
}
export function loginMethods(manifest,settings,surface='web'){
 return (manifest?.auth?.providers||[]).filter(p=>providers.has(p.id)&&Array.isArray(p.ready_surfaces)&&p.ready_surfaces.includes(surface)&&settings?.external?.[p.id]===true).map(p=>({id:p.id,name:p.name}));
}
export async function readManifest(client){const r=await client.rpc('dy_account_manifest',{p_schema:1});if(r.error)throw r.error;return normalizeManifest(r.data)}
export async function readAccount(client){const r=await client.rpc('dy_account_snapshot',{p_schema:1});if(r.error)throw r.error;if(r.data?.schema_version!==1)throw Error('Unsupported account response.');return r.data}
export async function readRevision(client){const r=await client.rpc('dy_account_revision');if(r.error)throw r.error;if(r.data?.schema_version!==1)throw Error('Unsupported account revision.');return r.data}
export function watchAccount(refresh,{interval=60_000,onError=()=>{}}={}){
 let stopped=false,running=false;
 const run=async()=>{if(stopped||running||globalThis.document?.hidden)return;running=true;try{await refresh()}catch(e){onError(e)}finally{running=false}};
 const timer=setInterval(run,Math.max(60_000,interval));timer.unref?.();
 globalThis.addEventListener?.('focus',run);globalThis.document?.addEventListener('visibilitychange',run);
 return {refresh:run,stop(){stopped=true;clearInterval(timer);globalThis.removeEventListener?.('focus',run);globalThis.document?.removeEventListener('visibilitychange',run)}};
}
// Native clients implement the same RPCs over HTTPS with their own PKCE/session manager.
// Never persist a private snapshot across users. Re-fetch before every mutation.
