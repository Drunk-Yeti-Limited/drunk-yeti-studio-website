import assert from 'node:assert/strict';
import { createItchHandler, fetchItchIdentity } from '../../supabase/functions/_shared/itch-account.mjs';

const callback = 'https://example.supabase.co/functions/v1/itch-account';
const base = { clientId: 'registered-id', callback, code: 'provider-code', pending: { verifier: 'pkce', restore: true } };
const requests = [];
const fetchImpl = async (url, options) => {
  requests.push(url);
  if (url.endsWith('/oauth/token')) {
    assert.equal(options.body.get('code_verifier'), 'pkce');
    assert.equal(options.body.get('redirect_uri'), callback);
    assert.equal(options.body.get('client_secret'), null);
    return Response.json({ access_token: 'test-token' });
  }
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  if (url.endsWith('/profile')) return Response.json({ user: { id: 7, username: 'player' } });
  assert(url.endsWith('/games/5254505/ownership'));
  return Response.json({ owns: true });
};
assert.deepEqual(await fetchItchIdentity({ ...base, fetchImpl }), { id: 7, username: 'player', owns: true });
requests.length = 0;
assert.equal((await fetchItchIdentity({ ...base, pending: { verifier: 'pkce', restore: false }, fetchImpl })).owns, false);
assert.equal(requests.length, 2);
await assert.rejects(fetchItchIdentity({
  ...base, fetchImpl: async (url, options) => url.endsWith('/ownership')
    ? Response.json({ owns: 'true' }) : fetchImpl(url, options),
}), /invalid_ownership_response/);

const handler = createItchHandler({ clientId: 'registered-id', callback });
const relay = await handler(new Request(callback + '?state=' + 'a'.repeat(64) + '&code=provider-code'));
assert.equal(relay.status, 303);
assert.equal(new URL(relay.headers.get('location')).origin, 'https://www.drunkyetistudio.com');
assert(!relay.headers.get('location').includes('?'));
assert.equal((await handler(new Request(callback + '?state=bad&code=code'))).status, 400);
assert.equal((await handler(new Request(callback, { method: 'POST', body: '{}' }))).status, 401);
console.log('PASS itch.io relay, PKCE exchange, minimal scopes and ownership validation');
