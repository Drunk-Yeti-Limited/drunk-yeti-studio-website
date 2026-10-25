"""Lobby contract v1. Host supplies Auth; run network calls off the UI thread."""
from account_client import AccountClient

class MultiplayerClient(AccountClient):
    def _rpc(self, name, body=None, authenticated=True):
        return self._request('/rest/v1/rpc/' + name, body or {}, authenticated)
    def manifest(self):
        result = self._rpc('dy_multiplayer_manifest', {'p_schema': 1}, False)
        if result.get('schema_version') != 1:
            raise ValueError('Multiplayer client update required')
        return result
    def snapshot(self):
        result = self._rpc('dy_multiplayer_snapshot')
        if result.get('schema_version') != 1:
            raise ValueError('Unsupported multiplayer response')
        return result
    def privacy(self, presence=False, coins=False):
        return self._rpc('dy_multiplayer_privacy', {'p_presence': presence, 'p_coins': coins})
    def heartbeat(self, game=None):
        return self._rpc('dy_multiplayer_heartbeat', {'p_game': game})
    def join(self, game, protocol, region='global', kind='public', room=None):
        return self._rpc('dy_multiplayer_join', {'p_game': game, 'p_protocol': protocol,
                         'p_region': region, 'p_kind': kind, 'p_room': room})
    def leave(self):
        return self._rpc('dy_multiplayer_leave')
    def invite(self, target):
        return self._rpc('dy_multiplayer_invite', {'p_target': target})
