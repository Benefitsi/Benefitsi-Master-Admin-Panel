import contextlib
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

DRAFT={'name':'Fixture','currency':'EUR','complete':True,'warnings':[],'categories':[{'name':'Food','items':[{'name':'Item','description':'','price':1,'allergens':[],'tags':[],'note':''}]}]}
class Completion(unittest.TestCase):
 def setUp(self):
  p=Path(__file__).with_name('hermes_menu_native.py');self.assertTrue(p.exists(),'Missing native one-request menu runtime')
  spec=importlib.util.spec_from_file_location('native_completion_fixture',p);self.mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.mod)
  self.calls=[];self.selection={'provider':'openai-api','model':'gpt-fixture'}
  def create(**kwargs):
   self.calls.append(kwargs)
   return types.SimpleNamespace(choices=[types.SimpleNamespace(finish_reason='stop',message=types.SimpleNamespace(content=json.dumps(DRAFT),tool_calls=[]))],
                                usage=types.SimpleNamespace(prompt_tokens=100,completion_tokens=200))
  class OpenAI:
   __module__='openai'
   max_retries=0
   def with_options(inner,**kwargs): return inner
  self.client=OpenAI();self.client.chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create))
  @contextlib.contextmanager
  def bounded(mode): yield object()
  self.httpmock=patch.object(self.mod,'_bounded_http',side_effect=bounded);self.httpmock.start();self.addCleanup(self.httpmock.stop)
  @contextlib.contextmanager
  def prepare(selection,messages):
   self.assertEqual(selection,self.selection)
   yield types.SimpleNamespace(client=self.client,kwargs={'model':'gpt-fixture','messages':messages,'max_tokens':24000,'tools':[]},resolved_api_mode='chat_completions',final_model='gpt-fixture')
  self.mock=patch.object(self.mod,'_prepared_request',side_effect=prepare);self.mock.start();self.addCleanup(self.mock.stop)
 def test_one_actual_completion_uses_selected_model_zero_tools_and_token_ceiling(self):
  result=self.mod.extract_native_once({'pages':[]},self.selection,400000)
  self.assertEqual(result,DRAFT);self.assertEqual(len(self.calls),1)
  self.assertEqual(self.calls[0]['model'],'gpt-fixture');self.assertEqual(self.calls[0]['tools'],[])
  self.assertEqual(self.calls[0]['max_tokens'],24000)
 def test_unknown_transport_outcome_has_no_second_request_or_provider_fallback(self):
  def fail(**kwargs):self.calls.append(kwargs);raise RuntimeError('unknown')
  self.client.chat.completions.create=fail
  with self.assertRaises(RuntimeError):self.mod.extract_native_once({'pages':[]},self.selection,400000)
  self.assertEqual(len(self.calls),1)
 def test_sdk_retry_or_oversized_body_is_rejected_before_dispatch(self):
  self.client.max_retries=2
  with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):self.mod.extract_native_once({'pages':[]},self.selection,400000)
  self.assertEqual(self.calls,[])
  self.client.max_retries=0
  with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):self.mod.extract_native_once({'metadata':'x'*262144},self.selection,400000)
  self.assertEqual(self.calls,[])
 def test_nested_extra_body_cannot_reenable_tools_or_raise_token_cap(self):
  @contextlib.contextmanager
  def malicious(selection,messages):
   yield types.SimpleNamespace(client=self.client,kwargs={'model':'gpt-fixture','messages':messages,'max_tokens':24000,
      'extra_body':{'tools':[{'type':'web_search'}],'max_tokens':999999}},resolved_api_mode='chat_completions',final_model='gpt-fixture')
  with patch.object(self.mod,'_prepared_request',side_effect=malicious):
   with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):
    self.mod.extract_native_once({'pages':[]},self.selection,400000)
  self.assertEqual(self.calls,[])
 def test_codex_native_wire_that_drops_caps_never_dispatches(self):
  @contextlib.contextmanager
  def unbounded(selection,messages):
   yield types.SimpleNamespace(client=self.client,kwargs={'model':'gpt-fixture','messages':messages,'max_tokens':24000},resolved_api_mode='codex_responses',final_model='gpt-fixture')
  with patch.object(self.mod,'_prepared_request',side_effect=unbounded):
   with self.assertRaisesRegex(ValueError,'native_menu_unbounded_provider'):
    self.mod.extract_native_once({'pages':[]},self.selection,400000)
  self.assertEqual(self.calls,[])

 def test_post_conversion_caps_tools_and_body_limits_fail_closed(self):
  valid={'model':'fixture','max_tokens':24000,'messages':[]}
  for changed in (dict(max_tokens=24001),dict(tools=[{'name':'tool'}]),dict(n=2),dict(service_tier='priority')):
   with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):
    self.mod._validate_wire(json.dumps(valid|changed).encode(),'chat_completions')
  with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):
   self.mod._validate_wire(json.dumps({'contents':[],'generationConfig':{'maxOutputTokens':65535}}).encode(),'gemini_native')
  self.mod._validate_wire(json.dumps({'contents':[],'generationConfig':{'maxOutputTokens':24000}}).encode(),'gemini_native')
  with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):
   self.mod._validate_wire(json.dumps(valid|{'messages':['x'*262144]}).encode(),'chat_completions')
 def test_anthropic_bypasses_native_stream_fallback_and_checks_converted_caps(self):
  class AnthropicAuxiliaryClient: pass
  inner=self.client;calls=[]
  inner.messages=types.SimpleNamespace(create=lambda **kw:calls.append(kw) or types.SimpleNamespace(usage=types.SimpleNamespace(input_tokens=1,output_tokens=2)))
  client=AnthropicAuxiliaryClient();client._real_client=inner
  client.chat=types.SimpleNamespace(completions=types.SimpleNamespace(_is_oauth=False,_base_url=None))
  req=types.SimpleNamespace(client=client,resolved_api_mode='anthropic_messages')
  module=types.ModuleType('agent.anthropic_adapter');module.build_anthropic_kwargs=lambda **kw:{'model':'fixture','max_tokens':kw['max_tokens'],'messages':kw['messages']}
  transport=types.ModuleType('agent.transports');transport.get_transport=lambda mode:types.SimpleNamespace(normalize_response=lambda *a,**kw:types.SimpleNamespace(content=json.dumps(DRAFT),tool_calls=[],finish_reason='stop'))
  with patch.dict('sys.modules',{'agent.anthropic_adapter':module,'agent.transports':transport}):
   self.mod._single_native_call(req,{'model':'fixture','messages':[]})
   self.assertEqual(len(calls),1);self.assertEqual(calls[0]['max_tokens'],24000);self.assertFalse(calls[0]['stream'])
   module.build_anthropic_kwargs=lambda **kw:{'model':'fixture','max_tokens':65535,'messages':[]}
   with self.assertRaisesRegex(ValueError,'native_menu_request_rejected'):
    self.mod._single_native_call(req,{'model':'fixture','messages':[]})
   self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
