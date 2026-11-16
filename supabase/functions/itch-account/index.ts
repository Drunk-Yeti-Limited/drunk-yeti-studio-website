import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createItchHandler } from '../_shared/itch-account.mjs';
import { ORIGIN } from '../_shared/xbox.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve(createItchHandler({
  clientId: Deno.env.get('ITCH_OAUTH_CLIENT_ID'),
  callback: ORIGIN + '/account/?itch_callback=1',
  admin: createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options),
  clientFor: (authorization: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    ...options, global: { headers: { Authorization: authorization } },
  }),
}));
