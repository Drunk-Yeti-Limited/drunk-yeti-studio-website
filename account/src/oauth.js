// Provider credentials stay in Supabase Auth; this browser only starts PKCE.
export function providerSignInOptions(provider, redirectTo) {
  const options = {redirectTo};
  if (provider === 'google') {
    options.scopes = 'openid email profile';
    options.queryParams = {prompt: 'select_account'};
  }
  return {provider, options};
}

// Run after SDK initialization so one-use callback values do not survive reloads.
export function cleanAuthCallback(href) {
  const url = new URL(href);
  const keys = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'error_uri',
    'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token'];
  for (const key of keys) url.searchParams.delete(key);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (keys.some(key => fragment.has(key))) url.hash = '';
  return url.href;
}
