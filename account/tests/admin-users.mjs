import assert from 'node:assert/strict';
import {createAdminUsersHandler} from '../../supabase/functions/_shared/admin-users.mjs';
const actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
const token='header.'+Buffer.from(JSON.stringify({session_id:session})).toString('base64url')+'.signature';
let denied=false,providerFail=false,identityFail=false,calls=[];
const admin={auth:{getUser:async()=>identityFail?{error:Error('bad')}:{data:{user:{id:actor}}},admin:{deleteUser:async id=>{calls.push(['delete',id]);return {error:providerFail?Error('private upstream info'):null}},updateUserById:async(id,payload)=>{calls.push(['update',id,payload]);return {error:null}}}},rpc:async(name,args)=>{calls.push([name,args]);return name==='dy_admin_user_prepare'?{data:{audit_id:'audit',email:'player@example.invalid'},error:denied?{message:'protected_account'}:null}:{error:null}}};
const handler=createAdminUsersHandler({admin,authClient:{auth:{resetPasswordForEmail:async(email,options)=>{calls.push(['recovery',email,options]);return {error:null}}}}});
const request=(action,options={})=>new Request('https://test.invalid',{method:'POST',headers:{Origin:'https://www.drunkyetistudio.com',Authorization:'Bearer '+token,...options.headers},body:JSON.stringify({action,target,reason:'Customer support',...options.body})});
assert.equal((await handler(request('delete',{headers:{Origin:'https://evil.invalid'}}))).status,403);assert.equal(calls.length,0);
identityFail=true;assert.equal((await handler(request('delete'))).status,401);identityFail=false;assert.equal(calls.length,0);
denied=true;assert.equal((await handler(request('delete'))).status,403);assert.ok(!calls.some(c=>c[0]==='delete'));denied=false;calls=[];
for(const action of ['profile','reset_password','set_password','suspend','restore','revoke_sessions','delete']){
 calls=[];const response=await handler(request(action,{body:{password:'sample-password-123',confirmation:'player@example.invalid'}}));assert.equal(response.status,200,action);assert.equal(calls[0][0],'dy_admin_user_prepare');assert.equal(calls[0][1].p_actor,actor);assert.equal(calls[0][1].p_session,session);assert.ok(!JSON.stringify(calls[0]).includes('sample-password'));assert.equal(calls.at(-1)[0],'dy_admin_user_finish');
 if(action==='reset_password')assert.deepEqual(calls[1],['recovery','player@example.invalid',{redirectTo:'https://www.drunkyetistudio.com/account/'}]);
 if(action==='set_password')assert.equal(calls[1][2].password,'sample-password-123');
}
calls=[];assert.equal((await handler(request('set_password',{body:{password:'short'}}))).status,400);assert.equal(calls.length,0);
providerFail=true;const failed=await handler(request('delete'));assert.equal(failed.status,409);assert.equal(calls.at(-1)[1].p_success,false);assert.ok(!(await failed.text()).includes('private upstream'));
assert.equal((await handler(request('role_change'))).status,400);
assert.equal((await handler(request('delete',{headers:{Authorization:'Bearer h.'+Buffer.from(JSON.stringify({client_id:'external',session_id:session})).toString('base64url')+'.s'}}))).status,403);
console.log('PASS admin endpoint: origin, verified identity, session binding, staff refusal, action allowlist, fixed recovery callback, audit ordering, password secrecy and provider failure');
