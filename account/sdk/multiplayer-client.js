// Versioned lobby client. Game rules, cards, results and currency remain server-owned.
export function normalizeMultiplayer(raw){
 if(raw?.schema_version!==1)throw Error('This multiplayer connection needs an app update.');
 return {...raw,heartbeat_seconds:Math.max(30,Number(raw.heartbeat_seconds)||30),poll_seconds:Math.max(15,Number(raw.poll_seconds)||15),games:(Array.isArray(raw.games)?raw.games:[]).filter(g=>g&&/^[a-z0-9-]{1,64}$/.test(g.id)&&typeof g.title==='string'&&Number.isInteger(g.protocol)&&Array.isArray(g.regions)).map(g=>({...g,available:g.available===true}))};
}
export function multiplayerClient(supabase){
 async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data}
 async function snapshot(name='dy_multiplayer_snapshot',args){const data=await rpc(name,args);if(data?.schema_version!==1)throw Error('Unsupported multiplayer response.');return data}
 return {
  manifest:async()=>normalizeMultiplayer(await rpc('dy_multiplayer_manifest',{p_schema:1})),
  snapshot:()=>snapshot(),
  privacy:(presence,coins)=>snapshot('dy_multiplayer_privacy',{p_presence:presence,p_coins:coins}),
  heartbeat:(game=null)=>snapshot('dy_multiplayer_heartbeat',{p_game:game}),
  join:(game,protocol,{region='global',kind='public',room=null}={})=>snapshot('dy_multiplayer_join',{p_game:game,p_protocol:protocol,p_region:region,p_kind:kind,p_room:room}),
  leave:()=>rpc('dy_multiplayer_leave'),
  invite:target=>rpc('dy_multiplayer_invite',{p_target:target}),
  async guest(captchaToken){
   const {data,error}=await supabase.auth.getSession();if(error)throw error;
   if(data.session){const checked=await supabase.auth.getUser();if(checked.error)throw checked.error;return checked.data.user;}
   const manifest=await this.manifest();if(!manifest.guests_enabled)throw Error('Guest multiplayer is coming soon.');
   const signed=await supabase.auth.signInAnonymously({options:{captchaToken}});if(signed.error)throw signed.error;return signed.data.user;
  }
 };
}
// Call only while a game/lobby is open, and stop on logout or identity changes.
// Lobby polling is a bootstrap transport; gameplay must use its own authority.
export function watchMultiplayer(client,game,onUpdate,{onError=()=>{},onManifest=()=>{}}={}){
 let stopped=false,running=false,lastBeat=0,lastManifest=0;
 const tick=async()=>{if(stopped||running||globalThis.document?.hidden)return;running=true;try{const now=Date.now();if(now-lastManifest>=60_000){const manifest=await client.manifest();if(stopped)return;onManifest(manifest);lastManifest=now;}const data=now-lastBeat>=30_000?await client.heartbeat(game):await client.snapshot();if(stopped)return;lastBeat=now-lastBeat>=30_000?now:lastBeat;onUpdate(data)}catch(e){if(!stopped)onError(e)}finally{running=false}};
 const timer=setInterval(tick,15_000);timer.unref?.();tick();
 globalThis.addEventListener?.('focus',tick);
 return {refresh:tick,stop(){stopped=true;clearInterval(timer);globalThis.removeEventListener?.('focus',tick)}};
}
