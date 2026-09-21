# Benefitsi Runtime Observer

Der Observer erzeugt alle 30 Minuten einen bereinigten Metadaten-Snapshot für die private Admin-Übersicht. Er liest Profile, freigegebene Benefitsi-Zeitpläne und bekannte Statusartefakte. Er startet keine Hermes-Aufträge, Prompts, Worker, Ticks oder Modelle.

## Sicherheitsgrenzen

- Standardmodus ist `--dry-run`. Er initialisiert keine Zugangsdaten und schreibt ausschließlich den bereinigten JSON-Snapshot nach stdout.
- Nur `--publish` lädt den vorhandenen privaten Credentialpfad aus `city-annweiler/config.yaml` und ruft anschließend `_admin_configuration()` aus dem bestehenden Benefitsi-MCP-Modul auf. Der Collector liest oder protokolliert keinen Schlüsselwert selbst.
- Veröffentlichung ist ausschließlich an `https://slscoqdhbxftcournvut.supabase.co` erlaubt. Abweichende Hosts, URL-Credentials, Queryparameter und Redirects werden abgelehnt.
- Profile außerhalb von Benefitsi erhalten keine Cron- oder LaunchAgent-Metadaten. Prompts, Deliveries, Sessions und Memory-Inhalte werden nie übertragen.
- Kontextdateien werden nur unter den fünf Vertragsnamen innerhalb eines echten Profilverzeichnisses gelesen. Symlinks und Traversalpfade werden nicht verfolgt.
- Fehlende oder fehlerhafte erwartete Cron-/LaunchAgent-Quellen ergeben `automation: "unknown"`. Ein deaktivierter, aber valide konfigurierter Benefitsi-Zeitplan bleibt `scheduled` mit `enabled: false`.
- `queue_empty` ist ein belegter Leerlauf ohne Modellstart. Ben-Laufzeiten stammen nur aus dem validierten UTC-Zeitstempel des Laufartefakt-Namens. City-Status `partial` mit `technical_ok: true` wird nicht als generischer Absturz dargestellt.
- Ben-Laufverzeichnisse werden streamend mit höchstens 2.048 Einträgen geprüft. Überschreitet ein Verzeichnis diese Grenze, bleibt der Laufstatus unbekannt; es wird kein beliebiger Teilausschnitt als letzter Lauf verwendet.

## Lokale Prüfung

Aus dem Admin-Repository:

```sh
/Users/patrick/.hermes/hermes-agent/venv/bin/python -m unittest -v ops/agent-runtime/test_collect_runtime.py
/Users/patrick/.hermes/hermes-agent/venv/bin/python ops/agent-runtime/collector_admin_integration.py
/Users/patrick/.hermes/hermes-agent/venv/bin/python ops/agent-runtime/collect_runtime.py --dry-run
plutil -lint ops/agent-runtime/ai.benefitsi.agent-runtime-observer.plist
```

Die Ausgabe des zweiten Befehls darf nur Snapshot-v1-Felder enthalten. Sie darf nicht in allgemeine Diagnosearchive mit Zugangsdaten oder Rohinhalten zusammengeführt werden.

## Datenbank-Gate

Die Migration `20260921210623_add_private_agent_runtime_snapshots.sql` ist additiv. Sie erstellt genau eine RLS-geschützte Tabelle und eine `SECURITY INVOKER`-RPC. `PUBLIC`, `anon` und `authenticated` erhalten weder Tabellen- noch RPC-Rechte; `service_role` erhält den schmalen Lese-/Schreibzugriff.

Vor Production wird die Migration auf Stage angewendet. Danach wird `supabase/tests/benefitsi_agent_runtime_snapshots_acl.test.sql` über den freigegebenen Stage-Datenbankkanal als zusammenhängendes SQL-Skript ausgeführt. Das Gate benötigt keine Test-Extension und erzeugt keine Hilfsfunktionen oder anderen Schemaobjekte. Es prüft 66 Bedingungen mit expliziten `DO`-/`RAISE`-Kontrollen, darunter ACL, Rollen-Impersonation, einen echten `service_role`-Schreib-/Leseweg, RLS, RPC-Validierung, UTF-16-/Whitespace-/Safe-Integer-Grenzen, semantische Zeitstempel, Größen- und Arraylimits sowie monotone Schreibvorgänge. Alle synthetischen Daten liegen in einer Transaktion und werden vor dem abschließenden Marker `check_count=66, status=complete` zurückgerollt. Jede falsche oder unbekannte Bedingung bricht vorher ab. Keine Datenbank-URL oder Zugangsdaten in Befehle, Logs oder Dateien dieses Ordners schreiben. Erst nach erfolgreichem Stage-Test und Review wird dieselbe Migration auf Production angewendet.

Ein einmaliger Publish-Test ist erst erlaubt, nachdem die Production-Migration vorhanden und geprüft ist:

```sh
/Users/patrick/.hermes/hermes-agent/venv/bin/python \
  /Users/patrick/.hermes/projects/benefitsi/agent-runtime/collect_runtime.py \
  --publish
```

Erwartet wird nur eine knappe JSON-Bestätigung mit Host, Beobachtungszeit und HTTP-Status. Fehlerausgaben enthalten ausschließlich eine Fehlerklasse beziehungsweise einen HTTP-Status, keine Response-Payload.

## Installation nach Review

Die Dateien in diesem Repository sind Vorlagen und wurden durch Task 2 nicht auf dem M1 installiert. Der Controller übernimmt nach Review:

1. Vorhandene Zieldateien sichern und Hashes von Quelle, Sicherung und installiertem Stand dokumentieren.
2. `collect_runtime.py` und `profile-registry.json` nach `/Users/patrick/.hermes/projects/benefitsi/agent-runtime/` kopieren; Script nur für den Benutzer ausführbar, Registry nicht gruppen- oder weltweit beschreibbar machen.
3. Die Plist-Vorlage nach `/Users/patrick/Library/LaunchAgents/ai.benefitsi.agent-runtime-observer.plist` kopieren und mit `plutil -lint` prüfen. Die Repository-Vorlage bleibt absichtlich `Disabled=true`.
4. Erst nach erfolgreichem Dry Run, Production-RPC-Test und Readback in der Admin-Projektion in der installierten Kopie `Disabled=false` setzen, dann den Dienst in der Benutzer-Domain laden. Die Vorlage startet alle 1.800 Sekunden und bei erfolgreichem Laden einmal sofort.
5. Nach dem ersten Lauf Snapshot-Zeit, Profilliste, private Tabellenrechte und Admin-Freshness zurücklesen. Ein neuer Beobachtungszeitpunkt darf einen alten Laufstatus nicht künstlich gesund machen.

Eindeutige Logpfade der Vorlage:

- `/Users/patrick/.hermes/logs/agent-runtime-observer.stdout.log`
- `/Users/patrick/.hermes/logs/agent-runtime-observer.stderr.log`

## Rollback

Den Observer aus der Benutzer-Domain entladen, anschließend ausschließlich seine installierte Plist, sein Script und seine Registry aus der dokumentierten Sicherung wiederherstellen oder entfernen. Bestehende Hermes-Scheduler, Profile, Memories, Modelle und Credentials bleiben unberührt. Die neue Snapshot-Tabelle ist von Produktdaten getrennt und kann bis zu einer eigenen geprüften Rückbaumigration leer beziehungsweise ungenutzt bestehen bleiben.
