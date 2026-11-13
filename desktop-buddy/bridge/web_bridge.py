"""Opt-in, session-only cosmetic bridge for the official Drunk Yeti website."""
import collections
import hmac
import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

ORIGINS = frozenset(('https://www.drunkyetistudio.com', 'https://drunkyetistudio.com'))
PORT = 47864
ACTIONS = frozenset(('wave', 'doubletake'))


class Bridge:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.Lock()
        self.token = secrets.token_hex(16)
        self.expires = clock() + 1800
        self.actions = collections.deque(maxlen=8)
        self.events = collections.deque(maxlen=8)
        self.connected_until = 0
        self.last_action = -10
        self.sequence = 0
        self.available = False
        self.server = None
        self.thread = None

    def request(self, path, auth, body):
        with self.lock:
            if self.clock() >= self.expires or not hmac.compare_digest(auth.encode('utf-8'), ('Bearer ' + self.token).encode('ascii')):
                return 401, {'error': 'Pairing expired or incorrect. Reconnect from Buddy.'}
            if not isinstance(body, dict):
                return 400, {'error': 'Invalid request.'}
            if path == '/v1/status' and not body:
                self.connected_until = self.clock() + 10
                return 200, {'version': 1, 'available': self.available,
                             'events': list(self.events), 'remaining': max(0, int(self.expires-self.clock()))}
            if path == '/v1/action' and set(body) == {'action'} and isinstance(body['action'],str) and body['action'] in ACTIONS:
                if not self.available:
                    return 409, {'error': 'Buddy is resting, busy or hidden.'}
                if self.clock()-self.last_action < 2:
                    return 429, {'error': 'Give Buddy a moment between reactions.'}
                self.last_action = self.clock()
                self.actions.append((self.clock(), body['action']))
                return 202, {'queued': True}
            if path == '/v1/disconnect' and not body:
                self.actions.clear()
                self.connected_until = 0
                self.token = secrets.token_hex(16)
                return 200, {'disconnected': True}
            return 400, {'error': 'Unsupported cosmetic interaction.'}

    def take_actions(self, available):
        with self.lock:
            self.available = bool(available and self.clock() < self.expires)
            pending = list(self.actions)
            self.actions.clear()
            return [action for at, action in pending if self.available and self.clock()-at < 3]

    def emit(self, kind):
        if kind not in ('wave', 'snow'):
            return False
        with self.lock:
            if self.clock() >= self.expires or self.clock() >= self.connected_until:
                return False
            self.sequence += 1
            self.events.append({'id': self.sequence, 'kind': kind})
            return True

    def start(self, port=PORT):
        bridge = self
        class Handler(BaseHTTPRequestHandler):
            def setup(self):
                super().setup()
                self.connection.settimeout(2)
            def log_message(self, *_):
                pass  # Pairing tokens and requests are never logged.
            def allowed(self):
                return (self.headers.get('Origin') in ORIGINS and
                        self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port))
            def reply(self, status, result):
                raw = json.dumps(result).encode()
                self.send_response(status)
                if self.allowed():
                    self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                    self.send_header('Vary', 'Origin')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(raw)))
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(raw)
            def do_OPTIONS(self):
                if not self.allowed() or self.headers.get('Access-Control-Request-Method') != 'POST':
                    return self.reply(403, {'error': 'Origin or method not allowed.'})
                requested = {x.strip().lower() for x in self.headers.get('Access-Control-Request-Headers','').split(',') if x.strip()}
                if not requested <= {'content-type','authorization'}:
                    return self.reply(403, {'error': 'Headers not allowed.'})
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
                self.send_header('Vary','Origin')
                self.send_header('Access-Control-Allow-Methods','POST')
                self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization')
                self.send_header('Access-Control-Allow-Private-Network','true')
                self.send_header('Cache-Control','no-store')
                self.send_header('Content-Length','0')
                self.end_headers()
            def do_POST(self):
                if not self.allowed():
                    return self.reply(403, {'error': 'Origin not allowed.'})
                if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type','').split(';')[0] != 'application/json':
                    return self.reply(415, {'error':'JSON required.'})
                try:
                    length = int(self.headers.get('Content-Length','-1'))
                    if not 0 <= length <= 1024:
                        return self.reply(413, {'error':'Invalid request size.'})
                    body = json.loads(self.rfile.read(length))
                except (ValueError, UnicodeError, TimeoutError, OSError):
                    return self.reply(400, {'error':'Invalid request.'})
                status, result = bridge.request(self.path, self.headers.get('Authorization',''), body)
                self.reply(status, result)
            def do_GET(self):
                self.reply(405, {'error':'POST required.'})
        self.server = HTTPServer(('127.0.0.1',port),Handler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        return self.server.server_port

    def close(self):
        with self.lock:
            self.expires = 0
            self.token = secrets.token_hex(16)
            self.actions.clear()
            self.events.clear()
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
