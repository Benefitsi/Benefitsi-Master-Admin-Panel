import unittest,tempfile,pathlib,importlib.util,uuid
s=importlib.util.spec_from_file_location('knowledge',pathlib.Path(__file__).with_name('benefitsi_knowledge.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Knowledge(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name).resolve();self.data={'schemaVersion':1,'action':'note-create','kind':'task','title':'Prüfen','content':'Eine neue Aufgabe.','requestId':str(uuid.uuid4()),'profileId':'ben','dueDate':'2026-10-14'}
 def call(self,data=None):return m.benefitsi_knowledge_request(data or self.data,vault_root=self.root)
 def test_create_readback_and_retry(self):
  receipt=self.call();self.assertTrue(receipt['created']);self.assertTrue(receipt['readbackVerified']);p=self.root/receipt['path'];first=p.read_bytes();self.assertEqual(self.call()['created'],False);self.assertEqual(p.read_bytes(),first)
  tasks=self.call({'schemaVersion':1,'action':'task-list'});self.assertEqual(tasks['items'][0]['title'],'Prüfen');self.assertEqual(tasks['items'][0]['dueDate'],'2026-10-14')
 def test_scoped_note_read(self):
  receipt=self.call();note=self.call({'schemaVersion':1,'action':'note-read','id':self.data['requestId']});self.assertEqual(note['sha256'],receipt['sha256']);self.assertIn('Eine neue Aufgabe.',note['content'])
  for data in [{'schemaVersion':1,'action':'note-read','id':'../secret'},{'schemaVersion':1,'action':'note-read','id':self.data['requestId'],'path':'config.yaml'}]:
   with self.assertRaisesRegex(ValueError,'knowledge_invalid_input'):self.call(data)
  with self.assertRaisesRegex(ValueError,'knowledge_file_missing'):self.call({'schemaVersion':1,'action':'note-read','id':str(uuid.uuid4())})
 def test_same_id_other_content_cannot_overwrite(self):
  self.call();bad={**self.data,'content':'different'}
  with self.assertRaisesRegex(ValueError,'knowledge_conflict'):self.call(bad)
 def test_bad_scope_and_fields(self):
  for change in [{'profileId':'viki'},{'kind':'personal'},{'path':'../secret'},{'dueDate':'2026-02-30'},{'requestId':'../secret'},{'content':'x'*12001}]:
   with self.assertRaisesRegex(ValueError,'knowledge_invalid_input'):self.call({**self.data,**change})
 def test_symlink_folder(self):
  other=self.root/'outside';other.mkdir();(self.root/'96 Aufgaben').symlink_to(other,target_is_directory=True)
  with self.assertRaisesRegex(ValueError,'knowledge_symlink'):self.call()
 def test_decision_no_task_or_original_source_write(self):
  data={**self.data,'kind':'decision'};data.pop('dueDate');r=self.call(data);self.assertTrue(r['path'].startswith('95 Agenten/Entscheidungen/'));self.assertEqual(self.call({'schemaVersion':1,'action':'task-list'})['items'],[])
 def test_manual_task_done_no_longer_open(self):
  r=self.call();p=self.root/r['path'];p.write_text(p.read_text().replace('status: open','status: done'))
  self.assertEqual(self.call({'schemaVersion':1,'action':'task-list'})['items'],[])
if __name__=='__main__':unittest.main()
