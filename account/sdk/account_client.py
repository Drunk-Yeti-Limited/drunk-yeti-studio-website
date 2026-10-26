"""Drunk Yeti account contract v1 for Buddy/PlaySpace native integrations.
Run network calls off the GUI thread. Supply an access token from the host's
PKCE/session manager; this module does not store tokens or implement login.
"""
import json
from urllib.request import Request, urlopen

API = 'https://rgafawpucqdhjrzodayl.supabase.co'
PUBLIC_KEY = 'sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy'
ACCOUNT_URL = 'https://www.drunkyetistudio.com/account/'
SECTION_TYPES = {'wallets', 'achievements', 'unlocks', 'store', 'connections', 'notice'}
PROVIDERS = {'google', 'apple', 'facebook'}


def normalize_manifest(raw):
    if raw.get('schema_version') != 1 or raw.get('minimum_client_schema', 1) > 1:
        raise ValueError('Account client update required; open ' + ACCOUNT_URL)
    result = dict(raw)
    result['sections'] = [s for s in raw.get('sections', [])
                          if isinstance(s, dict) and s.get('type') in SECTION_TYPES
                          and isinstance(s.get('title'), str)][:30]
    return result


def login_methods(manifest, settings, surface='desktop'):
    return [{'id': p['id'], 'name': p['name']}
            for p in manifest.get('auth', {}).get('providers', [])
            if p.get('id') in PROVIDERS and surface in p.get('ready_surfaces', [])
            and settings.get('external', {}).get(p['id']) is True]


class AccountClient:
    def __init__(self, get_access_token=lambda: None):
        self.get_access_token = get_access_token

    def _request(self, path, body=None, authenticated=False):
        headers = {'apikey': PUBLIC_KEY, 'Accept': 'application/json'}
        if authenticated:
            token = self.get_access_token()
            if not token:
                raise ValueError('Sign in before reading your account.')
            headers['Authorization'] = 'Bearer ' + token
        data = None if body is None else json.dumps(body).encode('utf-8')
        if data is not None:
            headers['Content-Type'] = 'application/json'
        with urlopen(Request(API + path, data=data, headers=headers), timeout=15) as response:
            return json.load(response)

    def manifest(self):
        return normalize_manifest(self._request('/rest/v1/rpc/dy_account_manifest', {'p_schema': 1}))

    def login_methods(self, surface='desktop'):
        # Re-fetch on sign-in screen open / foreground. On errors keep email and
        # hide provider buttons rather than displaying stale enabled providers.
        return login_methods(self.manifest(), self._request('/auth/v1/settings'), surface)

    def revision(self):
        return self._request('/rest/v1/rpc/dy_account_revision', {}, True)

    def snapshot(self):
        result = self._request('/rest/v1/rpc/dy_account_snapshot', {'p_schema': 1}, True)
        if result.get('schema_version') != 1:
            raise ValueError('Unsupported account response')
        return result

    def redeem(self, offer_id, offer_version, request_id):
        # Persist request_id before sending; retry the identical ID after timeout.
        # A new intentional order needs a new UUID. Only enable after fresh data.
        return self._request('/rest/v1/rpc/dy_redeem_offer', {
            'p_offer': offer_id, 'p_version': offer_version, 'p_request': request_id}, True)


def character_themes(manifest, account, surface='account'):
    """Ownership is shared; only ready integrations can be used by a client."""
    result = []
    for theme in manifest.get('character_themes', []):
        entitlement = theme.get('entitlement', {})
        if not entitlement.get('game_id') or not entitlement.get('item_id'):
            continue
        owned = any(u.get('game_id') == entitlement['game_id'] and
                    u.get('item_id') == entitlement['item_id']
                    for u in account.get('unlocks', []))
        integration = next((i for i in theme.get('integrations', [])
                            if i.get('surface') == surface), None)
        result.append(dict(theme, owned=owned, integration=integration,
                           available=bool(owned and integration and
                                          integration.get('status') == 'ready')))
    return result


def has_full_access(result, product_id, now=None):
    from datetime import datetime, timezone
    if not isinstance(result, dict) or result.get('schema_version') != 1 or result.get('product_id') != product_id or result.get('full_access') is not True:
        return False
    try:
        deadline = datetime.fromisoformat(result['valid_until'].replace('Z', '+00:00'))
        return deadline > (now or datetime.now(timezone.utc))
    except (ValueError, TypeError, KeyError):
        return False


class FrostpassClient(AccountClient):
    def status(self):
        return self._request('/functions/v1/subscription-account', {'action': 'status'}, True)

    def access(self, product_id):
        return self._request('/functions/v1/subscription-account',
                             {'action': 'access', 'product_id': product_id}, True)
