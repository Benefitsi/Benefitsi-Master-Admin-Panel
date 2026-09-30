import json,os,tempfile,unittest,uuid,threading,time
from unittest.mock import patch
from bounded_menu_adapter import extract_v2,provider_draft,post_json,MODEL,MAX_BODY
DRAFT={'name':'Synthetic','currency':'EUR','complete':True,'warnings':[],'categories':[{'name':'Food','items':[{'name':'Test','description':'','price':1,'allergens':[],'tags':[],'note':''}]}]}
class Adapter(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.db=self.tmp.name+'/journal.db';self.calls=[]
  self.data=dict(action='menu-extract',profile='benefitsi-menu',task='extract-menu',schemaVersion=2,requestId=str(uuid.uuid4()),files=[])
 def rpc(self,name,data):
  self.calls.append(name)
  if name.startswith('begin'): return dict(dispatch=True,model=MODEL,service_tier='standard',max_tokens=24000,max_body_bytes=MAX_BODY)
 def extract(self,data,agent):return {**{k:v for k,v in data.items() if k!='files'},'draft':DRAFT}
 def test_success_db_failure_recovers_cached_without_generation(self):
  def fail_finish(name,data):
   result=self.rpc(name,data)
   if name.startswith('complete'):raise RuntimeError('db unavailable')
   return result
  with self.assertRaises(RuntimeError):extract_v2(self.data,rpc=fail_finish,extract=self.extract,database=self.db)
  def no_generation(*a,**k):self.fail('must not generate again')
  recovered=extract_v2({k:('menu-recover' if k=='action' else v) for k,v in self.data.items() if k!='files'},rpc=self.rpc,extract=no_generation,database=self.db)
  self.assertEqual(recovered['draft'],DRAFT);self.assertEqual(self.calls.count('begin_partner_menu_ai_attempt'),1)
 def test_uncertain_attempt_never_retries(self):
  def timeout(*a,**k):raise RuntimeError('timeout')
  with self.assertRaises(RuntimeError):extract_v2(self.data,rpc=self.rpc,extract=timeout,database=self.db)
  with self.assertRaisesRegex(ValueError,'pending_review'):extract_v2(self.data,rpc=self.rpc,extract=self.extract,database=self.db)
  self.assertEqual(len(self.calls),1)
 def test_all_metadata_prompt_and_ocr_count_toward_body_and_single_call(self):
  calls=[]
  def transport(host,path,body,headers):
   calls.append(json.loads(body));return dict(model=MODEL,stop_reason='end_turn',usage=dict(input_tokens=123,output_tokens=321),content=[dict(type='text',text=json.dumps(DRAFT))])
  with patch.dict(os.environ,{'MENU_MINIMAX_PAYG_ACCEPTED':'true','MINIMAX_API_KEY':'synthetic-not-a-key'}):
   self.assertEqual(provider_draft({'pages':[]},transport=transport),DRAFT)
   self.assertEqual(calls[0]['service_tier'],'standard');self.assertEqual(calls[0]['max_tokens'],24000)
   with self.assertRaisesRegex(ValueError,'too_large'):provider_draft({'metadata':'x'*MAX_BODY},transport=transport)
   self.assertEqual(len(calls),1)
 def test_unknown_rate_acceptance_never_calls_provider(self):
  with patch.dict(os.environ,{},clear=True):
   with self.assertRaisesRegex(RuntimeError,'verified_payg'):provider_draft({},transport=lambda *a:self.fail())
 def test_stalled_connect_returns_at_deadline_and_never_sends_late(self):
  connected=threading.Event();finished=threading.Event();calls=[]
  class Connection:
   sock=None
   def __init__(self,*a,**k):pass
   def connect(self):connected.wait(1)
   def request(self,*a,**k):calls.append('request')
   def getresponse(self):raise RuntimeError('should not read')
   def close(self):
    if connected.is_set():finished.set()
  with patch('bounded_menu_adapter.http.client.HTTPSConnection',Connection):
   start=time.monotonic()
   with self.assertRaises(TimeoutError):post_json('synthetic.invalid','/',b'{}',{},seconds=.03)
   self.assertLess(time.monotonic()-start,.3)
   connected.set();self.assertTrue(finished.wait(.3))
   self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
