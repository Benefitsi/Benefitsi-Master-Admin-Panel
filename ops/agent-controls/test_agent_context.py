import unittest, tempfile, pathlib, os, importlib.util
p=pathlib.Path(__file__).with_name('benefitsi_agent_context.py')
s=importlib.util.spec_from_file_location('context',p); m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Context(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=pathlib.Path(self.tmp.name).resolve();self.profile=self.root/'ben';self.profile.mkdir();(self.profile/'SOUL.md').write_text('Rolle\n[Link](note.md)',encoding='utf-8')
 def call(self,action='context-read',**kw):return m.agent_context_request({'schemaVersion':1,'action':action,'profileId':'ben',**kw},profiles_root=self.root)
 def test_read_and_list(self):
  data=self.call(fileId='soul'); self.assertEqual(data['content'],'Rolle\n[Link](note.md)');self.assertEqual(data['byteLength'],21);self.assertEqual(data['hashVersion'],'sha256-bytes-v1');self.assertEqual(data['profileId'],'ben')
  self.assertEqual(self.call('context-list')['documents'][0]['fileId'],'soul')
 def test_scope_and_payload(self):
  for bad in ['viki','studio','stamp-curator','../ben']:
   with self.assertRaisesRegex(ValueError,'context_profile_forbidden'):m.agent_context_request({'schemaVersion':1,'action':'context-list','profileId':bad},profiles_root=self.root)
  for kw in [{'fileId':'soul','path':'config.yaml'},{'fileId':'config'},{'fileId':'../SOUL.md'}]:
   with self.assertRaises(ValueError):self.call(**kw)
 def test_symlinks_rejected(self):
  (self.profile/'SOUL.md').unlink();(self.root/'outside').write_text('secret');(self.profile/'SOUL.md').symlink_to(self.root/'outside')
  with self.assertRaisesRegex(ValueError,'context_symlink'):self.call(fileId='soul')
 def test_missing_unicode_and_size(self):
  (self.profile/'SOUL.md').unlink()
  with self.assertRaisesRegex(ValueError,'context_file_missing'):self.call(fileId='soul')
  (self.profile/'SOUL.md').write_bytes(b'\xff')
  with self.assertRaisesRegex(ValueError,'context_not_utf8'):self.call(fileId='soul')
  (self.profile/'SOUL.md').write_bytes(b'x'*65537)
  with self.assertRaisesRegex(ValueError,'context_too_large'):self.call(fileId='soul')
 def test_profile_directory_symlink(self):
  other=self.root/'other';other.mkdir();(self.profile/'SOUL.md').unlink();self.profile.rmdir();self.profile.symlink_to(other,target_is_directory=True)
  with self.assertRaisesRegex(ValueError,'context_symlink'):self.call('context-list')
if __name__=='__main__':unittest.main()
