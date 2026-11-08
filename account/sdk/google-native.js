// Pass the original nonce used to request a Google ID token. Never log tokens.
// Android must request the configured WEB client ID as serverClientId.
export async function signInGoogleNative(client,{idToken,nonce}){
 if(typeof idToken!=='string'||!idToken||typeof nonce!=='string'||nonce.length<16)throw Error('Google authorization required');
 const result=await client.auth.signInWithIdToken({provider:'google',token:idToken,nonce});
 if(result.error)throw result.error;
 return result.data;
}
