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
 if(['flow_state_not_found','flow_state_expired','bad_code_verifier','pkce_verifier_not_found','pkce_code_verifier_not_found'].includes(code)||/code verifier|both auth code/i.test(error?.message||''))return 'This sign-in could not be matched to this browser. For Google, choose Continue with Google again. For an email link, request a new link here and open it in this same browser and browser profile.';
 if(code==='access_denied')return 'Sign-in was cancelled or access was declined. Choose your sign-in method again when you are ready.';
 if(['provider_disabled','provider_not_enabled','oauth_provider_not_supported'].includes(code))return 'This sign-in provider is temporarily unavailable. Use email and password, or try again later.';
 if(code==='invalid_credentials'||/invalid login credentials/i.test(error?.message||''))return 'The email or password was not accepted. Check the email address and password, or choose Forgot password to set a new password.';
 if(code==='email_not_confirmed')return 'Confirm your email before signing in. Use Resend confirmation email if you need a new link.';
 if(error?.status===429)return 'Too many attempts. Please wait before requesting another email or signing in.';
 if(error?.callback)return 'Sign-in could not be completed. Try your sign-in method again. If you used an email link, request a new one and open the newest email in this same browser.';
 return error?.message||'Could not complete the request. Try again.';
}
