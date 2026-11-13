import importlib.util
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'desktop-buddy/bridge'))
from web_bridge import Bridge, ORIGINS
from install import install

class BridgeTests(unittest.TestCase):
 def setUp(self):
  self.now=100;self.b=Bridge(lambda:self.now);self.auth='Bearer '+self.b.token
 def call(self,path,body=None,auth=None):
  return self.b.request('/v1/'+path,self.auth if auth is None else auth,{} if body is None else body)
 def test_requires_current_token_and_expiry(self):
  self.assertEqual(self.call('status',auth='')[0],401)
  self.assertEqual(self.call('status',auth='Bearer invalid')[0],401)
  self.assertEqual(self.call('status',auth='Bearer é')[0],401)
  self.assertEqual(self.call('status')[0],200)
  self.now=1900;self.assertEqual(self.call('status')[0],401)
 def test_no_account_fields(self):
  self.assertEqual(set(self.call('status')[1]),{'version','available','events','remaining'})
 def test_only_two_exact_cosmetic_actions(self):
  self.b.take_actions(True)
  for body in ({'action':'shell'},{'action':'wave','url':'https://example.com'},{'action':None},{'action':['wave']}):
   self.assertEqual(self.call('action',body)[0],400)
  self.assertEqual(self.call('action',{'action':'wave'})[0],202)
  self.assertEqual(self.b.take_actions(True),['wave'])
 def test_blocked_and_stale_actions_are_dropped(self):
  self.assertEqual(self.call('action',{'action':'wave'})[0],409)
  self.b.take_actions(True);self.call('action',{'action':'wave'})
  self.assertEqual(self.b.take_actions(False),[])
  self.now+=3;self.b.take_actions(True);self.call('action',{'action':'wave'});self.now+=4
  self.assertEqual(self.b.take_actions(True),[])
 def test_reactions_rate_limited(self):
  self.b.take_actions(True);self.call('action',{'action':'wave'})
  self.assertEqual(self.call('action',{'action':'doubletake'})[0],429)
 def test_disconnect_revokes_code_and_pending_actions(self):
  self.b.take_actions(True);self.call('action',{'action':'wave'})
  self.assertEqual(self.call('disconnect')[0],200)
  self.assertEqual(self.call('status')[0],401)
  self.assertEqual(self.b.take_actions(True),[])
 def test_outbound_only_connected_and_bounded(self):
  self.assertFalse(self.b.emit('snow'));self.call('status')
  self.assertFalse(self.b.emit('run'))
  for _ in range(20):self.assertTrue(self.b.emit('wave'))
  self.assertEqual(len(self.call('status')[1]['events']),8)
  self.now+=11;self.assertFalse(self.b.emit('snow'))

class HttpTests(unittest.TestCase):
 def setUp(self):
  self.b=Bridge();self.port=self.b.start(0);self.url='http://127.0.0.1:'+str(self.port)
 def tearDown(self):self.b.close()
 def req(self,method='POST',body=b'{}',**changes):
  headers={'Origin':'https://www.drunkyetistudio.com','Content-Type':'application/json','Authorization':'Bearer '+self.b.token}
  headers.update(changes)
  request=urllib.request.Request(self.url+'/v1/status',data=body if method=='POST' else None,headers=headers,method=method)
  try:return urllib.request.urlopen(request,timeout=3)
  except urllib.error.HTTPError as error:return error
 def test_real_status_and_cors(self):
  with self.req() as r:
   self.assertEqual(r.status,200);self.assertEqual(r.headers['Access-Control-Allow-Origin'],'https://www.drunkyetistudio.com')
   self.assertEqual(r.headers['Cache-Control'],'no-store');self.assertEqual(json.load(r)['version'],1)
 def test_origins_host_token_and_methods_rejected(self):
  for headers in ({'Origin':'https://evil.example'},{'Origin':'null'},{'Origin':''},{'Host':'attacker.example'}):
   with self.req(**headers) as r:self.assertEqual(r.code,403);self.assertIsNone(r.headers.get('Access-Control-Allow-Origin'))
  with self.req(Authorization='') as r:self.assertEqual(r.code,401)
  with self.req(method='GET') as r:self.assertEqual(r.code,405)
 def test_invalid_bodies_and_preflight(self):
  with self.req(body=b'x'*1025) as r:self.assertEqual(r.code,413)
  with self.req(body=b'bad json') as r:self.assertEqual(r.code,400)
  with self.req(**{'Content-Type':'text/plain'}) as r:self.assertEqual(r.code,415)
  with self.req(method='OPTIONS',**{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}) as r:
   self.assertEqual(r.status,204);self.assertEqual(r.headers['Access-Control-Allow-Private-Network'],'true')

class InstallTests(unittest.TestCase):
 def test_preserves_menu_and_git(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'buddy.py').write_text('# Buddy');(root/'.git').mkdir();(root/'.git/HEAD').write_text('unchanged')
   original='def compact_menu(b):\n    menu=b.menu;tools=menu\n    menu.addAction(b.presentation_action);menu.addAction(b.quit_action)\n'
   (root/'buddy_menu.py').write_text(original)
   install(root);install(root)
   self.assertEqual((root/'buddy_menu.py.before-website-link').read_text(),original)
   self.assertEqual((root/'.git/HEAD').read_text(),'unchanged')
   self.assertEqual((root/'buddy_menu.py').read_text().count('add_website_link(b, tools)'),1)
 def test_unknown_menu_is_unchanged(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'buddy.py').write_text('# Buddy');(root/'buddy_menu.py').write_text('different')
   with self.assertRaises(ValueError):install(root)
   self.assertEqual((root/'buddy_menu.py').read_text(),'different')
   self.assertFalse((root/'web_bridge.py').exists())

if __name__=='__main__':unittest.main()
