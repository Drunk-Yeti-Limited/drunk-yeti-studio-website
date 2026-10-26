// Account SDK: a server response is an expiring permission, never a permanent flag.
export function hasFullAccess(result,productId,now=Date.now()){
 return result?.schema_version===1&&result.product_id===productId&&result.full_access===true&&Number.isFinite(Date.parse(result.valid_until))&&Date.parse(result.valid_until)>now;
}
export function frostpassClient(supabase){
 async function call(action,extra={}){const {data,error}=await supabase.functions.invoke('subscription-account',{body:{action,...extra}});if(error)throw error;if(data?.error)throw Error(data.error);return data;}
 return {status:()=>call('status'),checkout:()=>call('checkout'),portal:()=>call('portal'),access:product_id=>call('access',{product_id})};
}
// Apps must stop this watcher on logout/account switch and retain the original demo
// mode. Server-side premium operations must independently verify dy_app_access.
export function watchFrostpass(client,productId,onChange,{interval=300000,now=()=>Date.now(),onError=()=>{}}={}){
 let stopped=false,running=false,last=null,expiry=null;
 const publish=result=>{last=result;clearTimeout(expiry);onChange(hasFullAccess(last,productId,now()),last);
 if(hasFullAccess(last,productId,now()))expiry=setTimeout(()=>{if(!stopped)onChange(false,{reason:'refresh_required'});},Math.max(0,Date.parse(last.valid_until)-now()));};
 const refresh=async()=>{if(stopped||running)return;running=true;try{const result=await client.access(productId);if(!stopped)publish(result);}catch(e){if(!stopped){publish(null);onError(e)}}finally{running=false}};
 const timer=setInterval(refresh,Math.max(60000,Math.min(300000,interval)));timer.unref?.();
 globalThis.addEventListener?.('focus',refresh);
 return {refresh,stop(){stopped=true;clearTimeout(expiry);clearInterval(timer);globalThis.removeEventListener?.('focus',refresh);last=null;onChange(false,{reason:'signed_out'});}};
}
