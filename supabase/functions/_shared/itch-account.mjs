import { ORIGIN, digest, random } from './xbox.mjs';

const GAME_ID = 5254505;
const HEX = /^[a-f0-9]{64}$/;
const API = 'https://api.itch.io';
const baseHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

async function authorizationURL({ clientId, callback, state, verifier, restore }) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const url = new URL('https://itch.io/user/oauth');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: callback, response_type: 'code',
    scope: restore ? 'profile:me game:view:ownership' : 'profile:me',
    state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return url.href;
}

function relay(url) {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const cancelled = url.searchParams.has('error');
  if (!HEX.test(state || '') || (!cancelled && (!code || code.length > 4096))) {
    return new Response('Start the itch.io connection in your Drunk Yeti account.', { status: 400, headers: baseHeaders });
  }

  const params = new URLSearchParams({ itch_state: state });
  if (cancelled) params.set('itch_cancelled', '1');
  else params.set('itch_code', code);
  return new Response(null, {
    status: 303, headers: { ...baseHeaders, Location: ORIGIN + '/account/#' + params },
  });
}

export async function fetchItchIdentity({ clientId, callback, code, pending, fetchImpl = fetch }) {
  const options = { redirect: 'error', signal: AbortSignal.timeout(10000) };
  async function read(path, init) {
    const response = await fetchImpl(API + path, { ...options, ...init });
    if (!response.ok) throw Error('itch_request_failed');
    const result = await response.json();
    if (!result || result.errors?.length) throw Error('itch_request_failed');
    return result;
  }
  const token = await read('/oauth/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: clientId, redirect_uri: callback,
      code, code_verifier: pending.verifier,
    }),
  });
  if (typeof token.access_token !== 'string' || !token.access_token) throw Error('missing_access_token');
  const init = { headers: { Authorization: 'Bearer ' + token.access_token } };
  const { user } = await read('/profile', init);
  if (!Number.isSafeInteger(user?.id) || user.id < 1 ||
      typeof user.username !== 'string' || !user.username.trim() || user.username.length > 128) {
    throw Error('invalid_itch_profile');
  }
  let owns = false;
  if (pending.restore) {
    const result = await read('/games/' + GAME_ID + '/ownership', init);
    if (typeof result.owns !== 'boolean') throw Error('invalid_ownership_response');
    owns = result.owns;
  }
  return { id: user.id, username: user.username, owns };
}

export function createItchHandler({ admin, clientFor, clientId, callback, fetchImpl = fetch }) {
  return async req => {
    const url = new URL(req.url);
    if (req.method === 'GET') return relay(url);
    const origin = req.headers.get('origin');
    const headers = {
      ...baseHeaders, 'Content-Type': 'application/json', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(origin === ORIGIN ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (origin && origin !== ORIGIN) return reply(403, { error: 'origin_denied' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    try {
      const authorization = req.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'sign_in_required' });
      const client = clientFor(authorization);
      const auth = await client.auth.getUser();
      const user = auth.data?.user;
      if (auth.error || !user || user.is_anonymous) return reply(401, { error: 'sign_in_required' });
      const allowed = await client.rpc('dy_can_access', { p_scope: 'profile' });
      if (allowed.error || allowed.data !== true) return reply(403, { error: 'profile_scope_required' });
      const raw = await req.text();
      if (raw.length > 8192) return reply(413, { error: 'request_too_large' });
      let input;
      try { input = JSON.parse(raw); } catch { return reply(400, { error: 'invalid_request' }); }

      const pending = admin.from('dy_itch_pending');
      const connections = admin.from('dy_itch_connections');
      if (input?.action === 'status') {
        if (!clientId) return reply(200, { configured: false });
        const [link, receipt] = await Promise.all([
          connections.select('username').eq('player_id', user.id).maybeSingle(),
          admin.from('dy_itch_snowlight_receipts').select('verified_at').eq('player_id', user.id).limit(1),
        ]);
        if (link.error || receipt.error) throw Error('database_unavailable');
        return reply(200, { configured: true, connection: link.data, restored: receipt.data.length > 0 });
      }
      if (!clientId) return reply(503, { error: 'itch_not_configured' });
      if (input?.action === 'disconnect') {
        const cleared = await pending.delete().eq('player_id', user.id);
        if (cleared.error) throw cleared.error;
        const removed = await connections.delete().eq('player_id', user.id);
        if (removed.error) throw removed.error;
        return reply(200, { disconnected: true });
      }
      if (input?.action === 'start') {
        const state = random(), verifier = random(), restore = input.restore === true;
        const timestamp = Date.now();
        const previous = await pending.select('expires_at').eq('player_id', user.id).maybeSingle();
        if (previous.error) throw previous.error;
        if (Date.parse(previous.data?.expires_at) > timestamp + 590000) {
          return reply(429, { error: 'try_again_shortly' });
        }
        const saved = await pending.upsert({
          player_id: user.id, state_hash: await digest(state), verifier, restore,
          expires_at: new Date(timestamp + 600000).toISOString(),
        });
        if (saved.error) throw saved.error;
        return reply(200, { state, url: await authorizationURL({ clientId, callback, state, verifier, restore }) });
      }
      if (input?.action !== 'finish' || !HEX.test(input.state || '') ||
          typeof input.code !== 'string' || !input.code || input.code.length > 4096) {
        return reply(400, { error: 'invalid_request' });
      }
      const result = await pending.delete().eq('player_id', user.id)
        .eq('state_hash', await digest(input.state)).gt('expires_at', new Date().toISOString())
        .select('verifier,restore').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return reply(409, { error: 'connection_expired' });

      const identity = await fetchItchIdentity({ clientId, callback, code: input.code, pending: result.data, fetchImpl });
      const linked = await admin.rpc('dy_itch_link', {
        p_player: user.id, p_itch_user: identity.id, p_username: identity.username, p_owns_snowlight: identity.owns,
      });
      if (linked.error?.code === '23505') return reply(409, { error: 'itch_already_linked' });
      if (linked.error) throw linked.error;
      return reply(200, { username: identity.username, owns: identity.owns, checked: result.data.restore });
    } catch {
      return reply(503, { error: 'itch_unavailable' });
    }
  };
}
