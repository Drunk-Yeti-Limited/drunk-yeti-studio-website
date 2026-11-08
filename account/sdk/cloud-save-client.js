// Progress only. Currency, purchases and entitlements must use verified server ledgers.
export class CloudSaves {
 constructor(client,{game,storage=globalThis.localStorage,uuid=()=>crypto.randomUUID()}) {
  if(!/^[a-z0-9-]{1,80}$/.test(game))throw Error('Invalid game');
  this.client=client;this.game=game;this.storage=storage;this.uuid=uuid;
 }
 async owner(){const {data,error}=await this.client.auth.getUser();if(error||!data?.user||data.user.is_anonymous)throw Error('Sign in to sync saves');return data.user.id;}
 key(owner,slot){if(!Number.isInteger(slot)||slot<0||slot>3)throw Error('Invalid save slot');return `yeti-save-v1:${owner}:${this.game}:${slot}`;}
 async read(slot=0){const owner=await this.owner();this.key(owner,slot);const r=await this.client.from('dy_saves').select('revision,schema_version,payload,updated_at').eq('player_id',owner).eq('game_id',this.game).eq('slot',slot).maybeSingle();if(r.error)throw r.error;if(await this.owner()!==owner)throw Error('Account changed');return r.data;}
 // Caller retains the revision of the save it loaded. Never fetch a newer revision to force an overwrite.
 async queue(payload,{slot=0,revision=0,schema=1}={}){
  const owner=await this.owner(),key=this.key(owner,slot);
  if(!payload||Array.isArray(payload)||typeof payload!=='object'||!Number.isSafeInteger(revision)||revision<0||!Number.isInteger(schema)||schema<1||schema>10000)throw Error('Invalid save');
  if(new TextEncoder().encode(JSON.stringify(payload)).length>65536)throw Error('Save exceeds 64 KB');
  if(this.storage.getItem(key))throw Error('Resolve the pending save before replacing it');
  this.storage.setItem(key,JSON.stringify({owner,game:this.game,slot,revision,schema,payload,request:this.uuid()}));
  return this.flush(slot);
 }
 async flush(slot=0){
  const owner=await this.owner(),key=this.key(owner,slot),raw=this.storage.getItem(key);if(!raw)return {ok:true,pending:false};
  const p=JSON.parse(raw);if(p.owner!==owner||p.game!==this.game||p.slot!==slot)throw Error('Save owner mismatch');
  const session=await this.client.auth.getSession();if(session.error||session.data?.session?.user?.id!==owner)throw Error('Account changed');
  const r=await this.client.rpc('dy_put_save',{p_game:this.game,p_slot:slot,p_expected:p.revision,p_schema:p.schema,p_payload:p.payload,p_request:p.request}).setHeader('Authorization','Bearer '+session.data.session.access_token);
  if(r.error)throw r.error; // Retain the same request ID for safe retries after network loss.
  if(await this.owner()!==owner)throw Error('Account changed');
  if(r.data?.ok&&this.storage.getItem(key)===raw)this.storage.removeItem(key);
  return r.data; // conflict retains local data; UI must offer an explicit choice.
 }
 async discardPending(slot=0){this.storage.removeItem(this.key(await this.owner(),slot));}
}
