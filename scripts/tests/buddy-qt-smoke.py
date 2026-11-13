import os,sys
os.environ['QT_QPA_PLATFORM']='offscreen'
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'desktop-buddy/bridge'))
from types import SimpleNamespace
from PySide6.QtWidgets import QApplication,QMenu
from website_link import WebsiteLink,add_website_link
app=QApplication([])
class Buddy:
 owner=None;presenting=False;quiet=False;focus_end=None;party_play_active=False;drag_origin=None
 care=SimpleNamespace(asleep=False);break_coach=SimpleNamespace(active=False)
 def __init__(self):self.seen=[]
 def isVisible(self):return True
 def greet(self):self.seen.append('wave')
 def express(self,kind):self.seen.append(kind)
b=Buddy();menu=QMenu();add_website_link(b,menu);assert len(menu.actions())==1
panel=WebsiteLink(b);panel.start();assert panel.bridge is not None;panel.tick()
token=panel.bridge.token
assert panel.bridge.request('/v1/action','Bearer '+token,{'action':'wave'})[0]==202
panel.tick();assert b.seen==['wave']
b.quiet=True;panel.tick();assert panel.bridge.request('/v1/action','Bearer '+token,{'action':'wave'})[0]==409
panel.show();app.processEvents();panel.close();assert panel.bridge is None and not panel.code.text()
print('Qt smoke passed: adapter opens, dispatches on UI thread, respects quiet and closes listener.')
