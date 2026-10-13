import unittest
from unittest.mock import patch
import benefitsi_menu_http as seam
class MenuHTTP(unittest.TestCase):
 def test_schema2_only_busy_and_sanitized_errors(self):
  with patch.object(seam,'extract_menu',side_effect=AssertionError('must reject v1 first')):
   self.assertEqual(seam.handle_menu({'schemaVersion':1})[1],400)
  for error,status,message in [(seam.MenuAgentBusy('private'),429,'Der Menü-Agent ist ausgelastet.'),(ValueError('secret'),400,'Ungültiger Menü-Auftrag.'),(RuntimeError('secret'),503,'menu_operation_unavailable')]:
   with patch.object(seam,'extract_menu',side_effect=error):
    self.assertEqual(seam.handle_menu({'schemaVersion':2}),({'error':message},status))
 def test_fixed_known_validation_and_success(self):
  with patch.object(seam,'extract_menu',side_effect=ValueError('menu_validation_failed')):
   self.assertEqual(seam.handle_menu({'schemaVersion':2}),({'error':'menu_validation_failed'},400))
  with patch.object(seam,'extract_menu',return_value={'schemaVersion':2,'draft':{}}):
   self.assertEqual(seam.handle_menu({'schemaVersion':2})[1],200)
if __name__=='__main__':unittest.main()
