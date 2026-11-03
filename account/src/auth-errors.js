// Map authentication failures to actionable messages without exposing callback data.
export function callbackError(href){
 const url=new URL(href);
 for(const params of [url.searchParams,new URLSearchParams(url.hash.slice(1))]){
  if(params.has('error')||params.has('error_code'))return {code:params.get('error_code')||params.get('error'),callback:true};
 }
 return null;
}
export function authMessage(error){
 const code=error?.code||'';
 if(code==='otp_expired'||/email link.*expired/i.test(error?.message||''))return 'This email link has expired or has already been used. Enter your email and choose Forgot password to request a new link. Open only the newest email in the same browser and browser profile.';
 if(['flow_state_not_found','flow_state_expired','bad_code_verifier','pkce_verifier_not_found'].includes(code)||/code verifier|both auth code/i.test(error?.message||''))return 'This link could not be matched to this browser. Request a new reset link here and open it in this same browser and browser profile.';
 if(code==='invalid_credentials'||/invalid login credentials/i.test(error?.message||''))return 'The email or password was not accepted. Check the email address and password, or choose Forgot password to set a new password.';
 if(code==='email_not_confirmed')return 'Confirm your email before signing in. Use Resend confirmation email if you need a new link.';
 if(error?.status===429)return 'Too many attempts. Please wait before requesting another email or signing in.';
 if(error?.callback)return 'This email link could not be verified. Request a new link and open the newest email in this same browser.';
 return error?.message||'Could not complete the request. Try again.';
}
