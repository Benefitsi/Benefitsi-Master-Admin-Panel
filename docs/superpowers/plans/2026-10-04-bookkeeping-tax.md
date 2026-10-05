# Benefitsi Buchhaltung & Steuern: Umsetzung

**Auftrag:** Eigener nutzbarer Finanzagent, echtes Hermes-Profil auf dem M1, manuell aufrufbarer Prüfworkflow und private Admin-Integration. Der detaillierte Nutzerauftrag bestimmt den Umfang; keine zusätzliche Designfreigabe nötig.

**Architektur:** Die bestehende authentifizierte M1-Bridge ruft einen begrenzten lokalen Prüfdienst unter benefitsi-finance auf. Native Hermes-Registrierung mit eigener SOUL und enger MCP-Anbindung, ohne Ben-Credentials oder Schreibrechte in Produktdaten. Vorhandener Finanzstarter und SOP werden als Quellen inventarisiert. Ein privates Manifest plus unveränderte Originaldateien dienen als freigegebener Eingang. Ein Lauf erzeugt private versionierte Prüfarbeitsunterlagen und eine bereinigte Statusantwort.

**Technik:** vorhandene Python/Hermes-Runtime, Next 16.3.6/React 19, bestehende Admin-Auth und financeRead-RPC. Keine neuen Pakete, Caches, Scheduler oder Listener.

## Grenzen
- Höchstens 20 Belege pro Auftrag, begrenzte Datei-/Manifestgrößen; Authfehler stoppen.
- Keine finalen Buchungen, Steuerklassifizierung, Finanzamtübermittlung, Zahlungen oder Drittkommunikation.
- Unbekannte Rechtsform, Erfassungsstatus, Istzahlungen und Fristen bleiben unbekannt. Historische Planung ist kein aktueller Gründungsnachweis.
- Nur privat bereitgestellte Originale lesen; Symlinks/Traversal verweigern. Arbeitsberichte behalten Inputhash und Quellnachweise. Keine privaten Inhalte in Observer-Snapshots oder allgemeinen Logs.
- Zugriff auf Status, Start und Export erfordert Admin **und** financeRead; fehlende RPC-Rechte verweigern Zugriff.

## Arbeitsschritte
- [x] 1. Failing Tests für startbaren Lauf, fehlende Daten, Dubletten, Währungstrennung, Abgleich, sichere Pfade, unveränderte Originale und private Exporte. Dateien: ops/finance-agent/test_finance.py, finance_core.py, finance_cli.py.
- [x] 2. Lokalen Prüfdienst und MCP mit begrenzten Aktionen implementieren. Klare getrennte Status configured / blocked / needs_review / failed, echte Lauf-ID und UTC-Zeit; Wiederholung der gleichen Anfrage erzeugt keinen zweiten Lauf.
- [x] 3. Tests der Admin-Grenzen zuerst: tests/finance-agent.test.mjs. Dateien lib/finance-agent.ts, lib/finance-agent-server.ts und app/agents/finance/{page,actions,finance-workflow}.tsx. UI zeigt Quellen, offene Aufgaben, bestätigte Fristen und JSON/CSV-Prüfexport.
- [x] 4. Registry und vorhandene Agentenlinks ergänzen, ohne gemeinsame Admin-Shell zu ändern.
- [x] 5. Auf M1 vorhandene Hermes-Runtime verwenden, Profil sicher erstellen, eigene Konfiguration ohne Produkt-Credentials; nur vorhandenen Modellzugang gezielt wiederverwenden installieren, Bridge per geprüftem SHA ergänzen. Bestehende Dateien sichern, bei Abweichungen abbrechen.
- [x] 6. Profil/MCP/Bridge und ersten gefahrlosen Einrichtungscheck auf M1 prüfen. Bestehenden Runtime-Observer gezielt einmal publizieren und privat zurücklesen. Einrichtungscheck mit fehlendem Eingang bleibt fachlich blockiert.
- [ ] 7. Unabhängige Codeprüfung, gezielte Tests und Typecheck ohne großen Build; integrierbare Git-Änderung ausliefern. Eigene temporäre Arbeitsmittel entfernen, fremde Branches/Prozesse erhalten.

## Abnahme
Testbefehle: python3 -B -m unittest discover -s ops/finance-agent -p test_*.py; node --import tsx --test tests/finance-agent.test.mjs tests/agent-control.test.mjs tests/agent-control-data.test.mjs; vorhandenes TypeScript tsc --noEmit --incremental false. Netzwerk-Smoke prüft abgelehnte unautorisierte Anfragen und den autorisierten festen Profilaufruf. Fachliche Prüfung bleibt als Aufgabe ausgewiesen.
