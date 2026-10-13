import io,json,unittest,sys
from types import SimpleNamespace
from unittest.mock import patch
from benefitsi_control_http import handle_control_post
class Connection:
 def __init__(self):self.timeout=None
 def gettimeout(self):return self.timeout
 def settimeout(self,value):self.timeout=value
class Handler:
 def __init__(self,path='/hermes/profiles',data=None,authorized=True):
  self.path=path;self.raw=json.dumps(data or {'schemaVersion':1}).encode();self.rfile=io.BytesIO(self.raw);self.headers={'Content-Length':str(len(self.raw)),'Content-Type':'application/json'};self.connection=Connection();self.allowed=authorized;self.result=None
 def authorized(self):return self.allowed
 def send_json(self,payload,status=200):self.result=(status,payload)
class Tests(unittest.TestCase):
 def test_auth_first(self):
  h=Handler(authorized=False);calls=[]
  self.assertTrue(handle_control_post(h,None,lambda *args:calls.append(args)));self.assertEqual(h.result[0],401);self.assertFalse(calls)
 def test_exact_routes_content_type_and_limit(self):
  for path,headers in [('/hermes/profiles?file=/secret',{}),('/hermes/profiles',{'Content-Length':'-1'}),('/hermes/profiles',{'Content-Length':'8193'}),('/benefitsi/knowledge',{'Content-Length':'65537'}),('/hermes/menu-extract',{'Content-Length':'6291457'}),('/hermes/profiles',{'Content-Type':'text/plain'}),('/hermes/profiles',{'Transfer-Encoding':'chunked'})]:
   h=Handler(path);h.headers.update(headers);calls=[];handle_control_post(h,None,lambda *args:calls.append(args));self.assertEqual(h.result[0],400);self.assertFalse(calls)
 def test_normal_dispatch_restores_timeout_and_legacy_untouched(self):
  h=Handler();handle_control_post(h,'registered-source',lambda data,path,source:{'ok':data['schemaVersion']==1,'path':path});self.assertEqual(h.result,(200,{'ok':True,'path':'/hermes/profiles'}));self.assertIsNone(h.connection.timeout)
  h=Handler('/offers');self.assertFalse(handle_control_post(h,None));self.assertIsNone(h.result)
 def test_exact_menu_route_dispatches_once_with_status(self):
  h=Handler('/hermes/menu-extract',{'schemaVersion':2,'action':'menu-recover'});calls=[]
  def handle(data):calls.append(data);return ({'error':'busy'},429)
  with patch.dict(sys.modules,{'benefitsi_menu_http':SimpleNamespace(handle_menu=handle)}):handle_control_post(h,None)
  self.assertEqual(h.result,(429,{'error':'busy'}));self.assertEqual(len(calls),1)
 def test_error_sanitization_and_conflict(self):
  for message,status,code in [('knowledge_conflict',409,'knowledge_conflict'),('native_unavailable',503,'native_unavailable'),('/secret/key=value',400,'invalid_request')]:
   def fail(*args):raise ValueError(message)
   h=Handler();handle_control_post(h,None,fail);self.assertEqual(h.result,(status,{'error':code}))
if __name__=='__main__':unittest.main()
