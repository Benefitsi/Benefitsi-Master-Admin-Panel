# Agentenübersicht und Betriebsnachweis – Implementierungsplan

> Execution: subagent-driven-development. Der Nutzer hat selbstständige Umsetzung und spätere gemeinsame Abnahme ausdrücklich beauftragt.

**Spec:** `docs/agent-control-spec-20260921.md`
**Ziel:** Private, verständliche Agentenübersicht mit beobachteten M1-Metadaten und nachvollziehbarer Testabdeckung.
**Architektur:** Next.js Server Components; bereinigter Snapshot in service-only Supabase-Tabelle; deterministischer M1-Collector; vorhandene Betriebsdaten nur lesend.
**Basis:** Admin `b07c8506d8b917fcfe815db78df55f1d05035f21`, Branch `codex/agent-control-20260921`.

## Global Constraints

- Änderungen nur im isolierten Admin-Worktree. Bestands- und Produktprüfer schreiben eigene Berichte außerhalb dieses Repos.
- Bestehende Authentifizierung, noindex, Business-Freigaben und Ausführungspläne bleiben erhalten.
- Keine Geheimnisse, Memories oder Prompt-Inhalte in UI, Logs, Commit oder Snapshot.
- Belegte Ist-Zustände von Vorschlägen trennen; fehlend/alt/ungültig darf nicht gesund erscheinen.
- Tests, Typecheck, Lint der Änderungen, Build und unabhängiger Review vor Veröffentlichung. Belege zu genauem Commit aufbewahren.

### Task 1: Admin-Seite und sichere Datenprojektion

**Dateien:** `lib/agent-control.ts`, `lib/agent-control-data.ts`, `app/agents/page.tsx`, `app/agents/agent-overview.tsx`, `tests/agent-control.test.mjs`, `tests/agent-control-data.test.mjs`; kleine Änderungen an `app/admin-shell.tsx`, `app/founder-overview.tsx`.

- [ ] Relevant installierte Next.js-Dokumentation und AGENTS.md lesen.
- [ ] Sicherheits-/Normalisierungstests zuerst schreiben und erwartetes RED dokumentieren. Produktions-Loader mit inertem Transport und echter Auth-Reihenfolge testen (Muster founder-overview-data.test.mjs).
- [ ] Snapshot v1 gemäß Spezifikation defensiv normalisieren; Ausgabefelder einzeln aufbauen. Größen/Arraylimits prüfen, ungültige Version ablehnen. Freshness und Kontextlimit-Warnungen getrennt von Laufgesundheit berechnen.
- [ ] Loader `loadAgentControl(client, now?)` prüft selbst `getAdminSession` vor privilegiertem Client und Datenzugriff; nur schmale Projektionen der vier spezifizierten Tabellen. Quelle ohne Zeile/mit Fehler zeigt unbekannt; andere Quellen bleiben sichtbar. Niemals Fehlerpayloads in UI geben.
- [ ] `/agents` mit `requireAdmin`, bestehendem AdminShell, noindex und Übersicht implementieren. Bei vollständigem Quellenausfall hilfreicher Zustand ohne falsche Profile. Native Details, zugängliche Links, keine Startaktionen. Stadtname Annweiler für bekannte ID, unbekannte IDs nicht als Annweiler darstellen.
- [ ] Navigationslink und Founder-Link ergänzen. Bestehende UI-Konventionen und installierte Icons verwenden.
- [ ] Fokus-Tests, Typecheck, Lint geänderter Dateien, einmal ganze Testsuite ausführen. Keine neuen Pakete. Selbstprüfung, Commit und Bericht mit RED/GREEN-Belegen.

### Task 2: Private Aufnahme und deterministischer Collector

**Dateien:** neue per `supabase migration new` erzeugte Migration unter `supabase/migrations/`; `ops/agent-runtime/collect_runtime.py`, `ops/agent-runtime/test_collect_runtime.py`, `ops/agent-runtime/README.md`, `ops/agent-runtime/ai.benefitsi.agent-runtime-observer.plist` (Vorlage), `ops/agent-runtime/profile-registry.json`.

**Geprüfte Schnittstellen:** Founder-OS `agent-control-20260921/m1-inventory.json` und `collector-interface-evidence.md`. MCP-Modul `/Users/patrick/.hermes/projects/benefitsi/mcp/server.py`, `_admin_configuration()` liefert `(base_url, service_key)` und verwendet den bereits vorhandenen privaten Credentialloader. Interpreter `/Users/patrick/.hermes/hermes-agent/venv/bin/python`. Bestehender Runner zeigt die sichere lokale Initialisierung in seiner `Runtime.__init__`; nur Initialisierung übernehmen, niemals Runner oder Arbeit ausführen. CLI für lokale Migrationserzeugung vorhanden: `/Users/patrick/.npm/_npx/6f1b058a4d9555af/node_modules/.bin/supabase` Version 2.117.0 (CLI benötigt bei ihrem lokalen Telemetriepfad ggf. Sandbox-Freigabe).

**Präzisierung:** Nur Benefitsi-Profile erhalten Zeitplan-Metadaten aus Cron/LaunchAgents; persönliche Jobdaten anderer Profile nicht übertragen. Dort Profile/Modell/Kontext-Dateimetadaten zeigen, Planung `unknown`. Runtime-Hermesjobs nur aus allowlisted Jobfeldern ohne Prompt/Delivery; LaunchAgents nur die bekannten Benefitsi-Labels. Den City-Exit21 als `partial` behandeln, nicht als generischen Absturz. Standard-Kurzmemorylimit2200 laut installiertem Code, per-profile Override/disabled Zustand beachten. `AGENTS.md` ist CWD-abhängig (`unknown`), `SOUL.md` automatisch; Wurzel-MEMORY nur Referenz. ISO-Zeiten mit expliziter UTC-Zone erzeugen. Publish-Ziel exakt vorhandenes Production-Projekt `slscoqdhbxftcournvut.supabase.co` prüfen und Redirects verweigern; keine Credentialübernahme zu anderen Hosts.

- [ ] Geprüften M1-Inventurbericht lesen und Parser an tatsächlich installierte Hermes-Dateiformate anpassen. Rollenkarte mit knappen deutschen Aufgabenbeschreibungen aus belegter Zuordnung, Unklarheiten `unknown`. Konfigurierte deaktivierte Benefitsi-Zeitpläne bleiben als geplante Automation mit `enabled:false` sichtbar, nicht fälschlich als aktive Prozesse oder rein manuelle Profile.
- [ ] Collector-Tests zuerst: allowlist, kein Inhalt/secret, Dateien außerhalb Profil/Symlinks ablehnen, Größenlimits, fehlende/fehlerhafte Konfiguration, Unicode-Limits, leere/missgebildete Zeitpläne, synthetische Credential-Sentinels dürfen nie erscheinen. Keine Modellaufrufe.
- [ ] Snapshotvertrag unverändert einhalten. Lesefehler werden unbekannt, nicht manuell/erfolgreich. JSON/YAML-Metadaten verwenden, keine Shellinterpretation. `--dry-run` ist Standard und schreibt nur bereinigtes JSON; `--publish` explizit mit vorhandenem lokalen Credentialloader. Keine Zugangsdatenwerte in Argumenten/Logs. Netztimeout und ohne unendliche Wiederholung.
- [ ] Private Tabelle und RPC mit Begrenzung/Monotonie nach Spezifikation. Keine bestehenden Policies verändern. ACL-Nachweistests vorbereiten; remote Ausführung und M1-Installation übernimmt Controller nach Review.
- [ ] Plist als geprüfte, standardmäßig noch nicht installierte Vorlage mit 30-Minuten-Metadatenlauf, RunAtLoad, eindeutigen Logpfaden und absolutem Interpreterpfad. Keine Agentenjobs auslösen.
- [ ] Fokus-Tests, Selbstprüfung, Commit, Bericht. Rollback: eigenen Observer entladen; eigene Dateien aus Backup; neue Snapshot-Tabelle ohne Auswirkungen auf Produktdaten.

### Task 3: Integration, Wissenspaket, sichere Betriebsabnahme

**Dateien:** `ops/agent-runtime/benefitsi-agent-contract.md`, `ops/agent-runtime/city-template.md`, `ops/agent-runtime/learning-workflow.md`, ergänzende Tests aus Review; Betriebsbelege unter Founder-OS `agent-control-20260921/`.

- [ ] Aus Inventur konkrete fehlende Rollen/Kontextdateien dokumentieren und kleine geprüfte Ergänzungen vorbereiten; keine unklare persönliche Profilidentität ersetzen.
- [ ] Stadtvorlage und geprüften Lernablauf erstellen: Quelle, Test, Datum, Owner, nächste Überprüfung, begrenzte Memory. Kein automatisches Anlegen aktiver neuer Städte.
- [ ] Datenbankmigration Stage → ACL-/RPC-Tests → Production nur nach sauberem Review; ausschließlich additive private Metadaten.
- [ ] Collector auf M1 trocken prüfen, vergleichen, mit Backup installieren und einmal Metadaten veröffentlichen; Observer nur nach erfolgreicher Prüfung aktivieren. Bestehende Scheduler und Modellwahl nicht ändern. End-to-End-Beleg bis Adminloader.
- [ ] Admin lokal bauen und sichere UI-/Authentifizierungsabnahme durchführen. Unabhängiger Gesamt-Review; dann autorisierte PR/Preview/Veröffentlichung mit Produktions-Readback, sofern sämtliche Gates bestanden. PR an Aufgabe anhängen.
- [ ] Founder-OS um Agentenkarte, Interaktionsabdeckung und priorisierte Ferien-Arbeitsliste aktualisieren. Bestehenden täglichen Follow-up passend zum neueren Nutzerauftrag aktualisieren, ruhig bei Routinefortschritt, keine wiederholten Rückfragen.
