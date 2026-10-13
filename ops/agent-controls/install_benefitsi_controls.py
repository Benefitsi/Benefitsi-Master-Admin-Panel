"""One-time installation into the existing bridge; no daemon, credential or model changes."""
from pathlib import Path
import datetime,hashlib,json,os,shutil
ROOT=Path.home()/'.arc-m1-bridge'
EXPECTED='27caf136925188d3259037c0a675e35bdb46e177e253c93d5894f95679acd552'
BLOCK='''        from benefitsi_control_http import handle_control_post
        if handle_control_post(self, source_root):
            return
'''
def atomic(path,raw):
 temp=path.with_name('.'+path.name+'.benefitsi-install.tmp')
 if temp.exists():raise RuntimeError('install_temporary_exists')
 try:
  with temp.open('xb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
  os.chmod(temp,0o600);os.replace(temp,path)
 finally:
  if temp.exists():temp.unlink()
def install():
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup=ROOT/'backups'/('benefitsi-controls-'+stamp);backup.mkdir(parents=True,mode=0o700)
 bridge=ROOT/'m1_bridge.py';raw=bridge.read_bytes();source=raw.decode()
 anchor='''    def do_POST(self):
        if not self.authorized():
            return self.send_json({"error": "Nicht autorisiert."}, 401)
'''
 if BLOCK not in source:
  if hashlib.sha256(raw).hexdigest()!=EXPECTED or source.count(anchor)!=1:raise RuntimeError('bridge_revision_changed')
  patched=source.replace(anchor,anchor+BLOCK)
  compile(patched,str(bridge),'exec');shutil.copy2(bridge,backup/'m1_bridge.py');atomic(bridge,patched.encode())
 else:patched=source
 for name in ['benefitsi_agent_context.py','benefitsi_agent_models.py','benefitsi_knowledge.py','benefitsi_control_http.py']:
  incoming=Path(__file__).parent/name;payload=incoming.read_bytes();compile(payload,str(incoming),'exec')
  target=ROOT/name
  if target.is_symlink():raise RuntimeError('module_symlink')
  if target.exists():shutil.copy2(target,backup/name)
  atomic(target,payload)
 # All native Hermes profiles load SOUL for new work. Append only the exact guide.
 vault=Path('/Users/patrick/Documents/Obsidian/Benefitsi')
 from benefitsi_agent_context import _read
 marker=json.loads(_read(vault,'','.arc-source.json')['content'])
 if marker.get('sourceId')!='benefitsi-obsidian' or marker.get('ownership')!='BENEFITSI_EXTERNAL':raise RuntimeError('source_marker_changed')
 from benefitsi_agent_context import PROFILES,_directory
 for p in [vault,Path.home()/'.hermes/profiles']:
  fd=_directory(p);os.close(fd)
 guide='''# Benefitsi – gemeinsames Wissen

Der gemeinsame Obsidian-Vault liegt auf dem M1 unter `/Users/patrick/Documents/Obsidian/Benefitsi`.
Lies `95 Agenten/START.md` und relevante verknüpfte Notizen vor Aufgaben. Bewahre bestehende SOUL-/MEMORY-Regeln und ältere Second-Brain-Verweise.
Speichere wichtige neue Aufgaben, Entscheidungen und Ergebnisse mit dem begrenzten Helfer `/Users/patrick/.arc-m1-bridge/benefitsi_knowledge.py` (JSON über stdin, schemaVersion 1, action note-create, kind task/decision/result, title, content, profileId, stabile requestId UUID; dueDate YYYY-MM-DD nur für Aufgaben).
Der Helfer bestätigt den Dateihash nach Lesen. Wiederhole bei unsicherem Ausgang mit derselben UUID und unverändertem Inhalt. Keine bestehenden Notizen überschreiben. Keine Geheimnisse, vollständigen Sitzungsprotokolle oder anderen Projektinhalte speichern.
Neue Aufgaben liegen in `96 Aufgaben`, Entscheidungen in `95 Agenten/Entscheidungen`, Ergebnisse in `95 Agenten/Ergebnisse`. Erledigte Aufgaben tragen in ihrer Obsidian-Notiz `status: done`.
Die Admin-Wissensansicht kann neue Notizen sofort lesen; der bestehende Wissensspiegel aktualisiert sich separat. Der Helfer verwaltet keine neuen Zeitpläne.
'''
 soul_block='\n<!-- BEGIN:benefitsi-shared-knowledge -->\n## Gemeinsamer Benefitsi-Wissensstand\nLies `KNOWLEDGE.md` dieses Profils und die verknüpften Benefitsi-Obsidian-Notizen vor neuen Aufgaben. Speichere wichtige Aufgaben, Entscheidungen und Ergebnisse nach den dort beschriebenen begrenzten Regeln.\n<!-- END:benefitsi-shared-knowledge -->\n'
 for profile in PROFILES:
  folder=Path.home()/'.hermes/profiles'/profile;fd=_directory(folder);os.close(fd)
  knowledge=folder/'KNOWLEDGE.md';content=(guide+'\nDieses Profil: `'+profile+'`.\n').encode()
  if knowledge.is_symlink():raise RuntimeError('knowledge_guide_symlink')
  if knowledge.exists() and knowledge.read_bytes()!=content:raise RuntimeError('existing_knowledge_guide_changed')
  if not knowledge.exists():atomic(knowledge,content)
  soul=folder/'SOUL.md'
  if soul.is_symlink():raise RuntimeError('soul_symlink')
  source=soul.read_text()
  if '<!-- BEGIN:benefitsi-shared-knowledge -->' not in source:
   shutil.copy2(soul,backup/(profile+'-SOUL.md'));atomic(soul,(source+soul_block).encode())
 start=vault/'95 Agenten/START.md'
 start.parent.mkdir(exist_ok=True)
 fd=_directory(start.parent);os.close(fd)
 if start.is_symlink():raise RuntimeError('start_guide_symlink')
 if not start.exists():atomic(start,('''# Benefitsi-Agenten und Wissensablage

Sechs Benefitsi-Profile: Ben, Content, Finanzen, SEO, Annweiler und Menü.
Auf Abruf heißt: Start durch eine passende Admin-Aktion. Es ist keine Aussage über einen momentan laufenden Prozess.

'''+guide+'''\n## Verknüpfungen
- [[96 Aufgaben]]
- [[95 Agenten/Entscheidungen]]
- [[95 Agenten/Ergebnisse]]
- [[95 Agenten/2026-10-13 Entfernung Stempel-Kurator und Studio]]

Ältere Benefitsi-Second-Brain-Notizen bleiben erhalten. Dieser Vault ist die gemeinsame Ablage für neue wichtige Arbeit.
''').encode())
 print(json.dumps({'installed':True,'backup':str(backup),'profiles':list(PROFILES),'bridgeSha256':hashlib.sha256(bridge.read_bytes()).hexdigest(),'modelsChanged':False}))
if __name__=='__main__':install()
