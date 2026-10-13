import json
import tempfile
import uuid
import unittest
from unittest.mock import patch
import bounded_menu_adapter as adapter

DRAFT={'name':'Fixture','currency':'EUR','complete':True,'warnings':[],'categories':[{'name':'Food','items':[{'name':'Item','description':'','price':1,'allergens':[],'tags':[],'note':''}]}]}
class NativeRouting(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.db=self.tmp.name+'/journal.db'
  self.data=dict(action='menu-extract',profile='benefitsi-menu',task='extract-menu',schemaVersion=2,requestId=str(uuid.uuid4()),files=[])
  self.calls=[]
 def rpc(self,name,args):
  self.calls.append((name,args))
  if name.startswith('begin'):
   return dict(dispatch=True,provider='openai-api',model='gpt-fixture',adapter='hermes-native-bounded-v2',max_tokens=24000,max_body_bytes=262144,max_input_tokens=400000,service_tier='native-default')
 def extractor(self,data,agent):return {k:v for k,v in data.items() if k!='files'}|{'draft':agent({'pages':[]})}
 def run_native(self,document,selection):
  self.assertEqual(selection,{'provider':'openai-api','model':'gpt-fixture'})
  self.assertEqual(document,{'pages':[]})
  return DRAFT
 def execute(self,**kwargs):
  try:return adapter.extract_v2(self.data,rpc=self.rpc,extract=self.extractor,database=self.db,
                 selection_reader=lambda:{'provider':'openai-api','model':'gpt-fixture'},native_runner=self.run_native,**kwargs)
  except TypeError as e:
   if 'unexpected keyword' in str(e):self.fail('Missing real selected-provider v2 routing')
   raise
 def test_saved_provider_selects_native_v2_and_is_bound_into_admission(self):
  with patch.object(adapter,'provider_draft',side_effect=AssertionError('Do not silently use MiniMax')):
   result=self.execute()
  self.assertEqual(result['adapter'],'hermes-native-bounded-v2')
  self.assertEqual(result['provider'],'openai-api')
  self.assertEqual(result['model'],'gpt-fixture')
  self.assertEqual(self.calls[0][0],'begin_partner_menu_ai_native_attempt')
  self.assertEqual(self.calls[0][1]['p_provider'],'openai-api')
  self.assertEqual(self.calls[0][1]['p_model'],'gpt-fixture')
 def test_wrong_admission_route_never_calls_native(self):
  original=self.rpc
  def wrong(name,args):
   r=original(name,args)
   if name.startswith('begin'):r['model']='different'
   return r
  self.rpc=wrong
  with self.assertRaisesRegex(ValueError,'dispatch_not_permitted'):self.execute()
 def test_uncertain_native_call_is_not_replayed(self):
  calls=[]
  def uncertain(*args):calls.append(1);raise RuntimeError('transport outcome unknown')
  try:
   with self.assertRaises(RuntimeError):
    adapter.extract_v2(self.data,rpc=self.rpc,extract=self.extractor,database=self.db,
     selection_reader=lambda:{'provider':'openai-api','model':'gpt-fixture'},native_runner=uncertain)
  except TypeError:self.fail('Missing real selected-provider v2 routing')
  with self.assertRaisesRegex(ValueError,'pending_review'):self.execute()
  self.assertEqual(calls,[1])
 def test_codex_selection_is_visible_and_rejected_before_cost_admission(self):
  with self.assertRaisesRegex(ValueError,'ChatGPT/Codex-Endpunkt'):
   adapter.extract_v2(self.data,rpc=self.rpc,extract=self.extractor,database=self.db,
    selection_reader=lambda:{'provider':'openai-codex','model':'gpt-fixture'},native_runner=self.run_native)
  self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
