# Benefitsi Agentenübersicht – Spezifikation

Stand: 21.09.2026. Auftrag: Patrick möchte während seines Urlaubs eine verständliche, visuelle Übersicht seiner vorhandenen Agenten, belastbare Tests und möglichst wenig manuellen Betrieb. Abnahme und Erklärung erfolgen danach.

## Ergebnis

Die neue Admin-Seite `/agents` beantwortet: Welche Profile gibt es wirklich? Welche sind Benefitsi zugeordnet? Was ist automatisch geplant? Welche Ausführungen sind belegt? Wo fehlen Anmeldung, Kontext oder frische Daten? Was darf erst nach menschlicher Freigabe veröffentlicht werden?

Eine vorhandene Konfiguration ist kein Nachweis eines laufenden Agenten. Ein erfolgreicher technischer Lauf ist keine redaktionelle Freigabe. Fehlende Quellen werden als unbekannt angezeigt, niemals als null oder gesund. Zeitangaben verwenden Europe/Berlin und nennen ihren Beobachtungszeitpunkt.

## Daten und Sicherheit

Ein deterministischer M1-Collector liest ausschließlich freigegebene Metadaten. Er startet keine Agenten, führt keine Prompts aus und benötigt keine LLM-Kosten. Er sendet mit dem bereits auf dem M1 vorhandenen Serverzugang einen bereinigten Snapshot in eine neue private Supabase-Tabelle. Kein Schlüssel wird kopiert. Kein öffentlicher Ingest-Endpunkt wird gebaut. Admin-Authentifizierung erfolgt vor Erstellung des privilegierten Datenbankclients.

Tabelle: `benefitsi_agent_runtime_snapshots`, Spalten `host_id text primary key`, `observed_at timestamptz not null`, `schema_version integer not null`, `snapshot jsonb not null`, `received_at timestamptz not null default now()`. RLS aktiv; PUBLIC, anon und authenticated erhalten keine Tabellenrechte. Nur service_role darf lesen/schreiben. Schreiben über SECURITY INVOKER RPC `record_benefitsi_agent_runtime_snapshot(p_host_id text,p_observed_at timestamptz,p_snapshot jsonb)` mit festem search_path, nur service_role EXECUTE. RPC validiert Schema/Größe/Host/Datum und ersetzt keine neuere Beobachtung durch eine ältere. Keine bestehenden Tabellenrechte werden erweitert.

Snapshot-Vertrag v1:

```ts
type RuntimeSnapshot = {
  schemaVersion: 1; hostId: "m1-benefitsi"; observedAt: string; collectorVersion: string;
  profiles: Array<{
    id: string;
    scope: "benefitsi" | "general" | "other" | "unknown";
    purpose: string; provider: string | null; model: string | null;
    citySlug: string | null;
    automation: "scheduled" | "manual" | "unknown";
    contextFiles: Array<{
      path: string; exists: boolean; chars: number | null; limit: number | null;
      sha256: string | null; modifiedAt: string | null;
      loadedBy: "system" | "reference" | "unknown";
    }>;
    schedules: Array<{
      id: string; source: "hermes" | "launchd"; enabled: boolean | null;
      cadence: string | null; lastRunAt: string | null; lastStatus: string | null;
    }>;
  }>;
};
```

Maximal 64 Profile, 16 Kontextdateien/Profil, 16 Zeitpläne/Profil und 128 KiB Snapshot. Keine Datei-Inhalte, Nutzer-Memories, Prompts, Cron-Payloads, Sessiontexte, Tokens oder Zugangsdaten übertragen. Pfade nur innerhalb des Profils und bekannte Kontextnamen; keine absoluten persönlichen Pfade. Unbekannte Felder werden im Admin verworfen. Snapshot ist nach 90 Minuten veraltet; Beobachtungen mehr als fünf Minuten in der Zukunft sind ungültig. Unplausible Datumswerte oder fehlende Profile dürfen keine positive Betriebsanzeige erzeugen.

Die Seite ergänzt höchstens drei schmale Leseabfragen: `city_agent_city_controls` (Stadt/Profile/Modus/Freigabe/Gesundheit), `city_agent_schedules` (Takt/Aktivierung/letzter Status) und `annweiler_event_pipeline_health` (letzter technischer Lauf/Recherchezeit/Gesundheit). Fällt eine Quelle aus, bleiben andere sichtbar. Keine Dispatch-, Tick-, Worker-, Scan- oder Watchdog-Funktionen aufrufen.

## Oberfläche

- Navigation „Agenten“ und Link aus der Founder-Tagesübersicht.
- Überschrift, Datenstand und Warnhinweis bei alten/fehlenden Daten.
- Kompakte Zusammenfassung vorhandener Profile, Benefitsi-Zuordnung und beobachteter automatischer Pläne; Zahlen beziehen sich ausdrücklich auf Konfiguration, nicht auf gleichzeitig aktive Prozesse.
- Visueller Ablauf „Auftrag → Recherche → Prüfung → Freigabe → Veröffentlichung“ mit Erklärung der menschlichen Freigabe.
- Benefitsi-Profile zuerst, weitere Profile getrennt. Für jedes Profil Aufgabe, Modell/Provider, Automation, Zeitpläne, Kontextdateien mit Größe/Limit und tatsächlicher Ladeart. Zugängliche native `<details>` für technische Einzelheiten.
- Stadtbetrieb separat: technische Aktualität und Inhaltsfreigabe getrennt. Link zu bestehendem Städte-Review und Automation Control.
- Keine neuen Start-, Lösch-, Modellwechsel- oder Veröffentlichungsaktionen; keine fiktiven „online“-Animationen.
- Bestehende Satoshi-/Navy-/Türkis-Gestaltung verwenden, auf Mobilgeräten ohne horizontales Überlaufen. Keine neuen UI-Pakete.

## Wissenspflege und Skalierung

Bestehende Profile nicht blind löschen oder umbenennen. Fehlen Benefitsi-spezifische Rollendateien, werden nur geprüfte, knappe operative Regeln ergänzt, nach Backup und Inhaltsvergleich. Systematisch unterscheiden: automatisch injizierte `memories/MEMORY.md`, Identität und nur bei Bedarf gelesene Referenzdokumente. Keine Behauptung von Modelltraining. Lernen heißt belegte Fehlerkorrektur → Test → datierte Regel → begrenzte Memory.

Neue Städte bekommen eine Vorlage mit Stadt-ID/Slug/Zeitzone/Quellen/Prüfregeln und standardmäßig gesperrter Veröffentlichung. Keine Zugangsdaten, Sessions, laufenden Jobs oder Stadtinhalte blind klonen. Fehlende Rollen zunächst als Verantwortlichkeiten/SOPs dokumentieren; nicht automatisch kostenpflichtige LLM-Agenten starten.

## Abnahme

Sicherheits- und Parser-Tests inklusive Nicht-Admin, fehlender Quelle, alter/future Daten, ungültiger Daten und eingeschleuster zusätzlicher Inhalte. Collector-Tests mit temporären synthetischen Profilen, ohne Netzwerk/LLM. Datenbank-ACL- und RPC-Tests zuerst auf Stage. Authentifizierte Seite soweit vorhandener Zugang erlaubt; reine Komponentenprüfung mit synthetischen Daten ausdrücklich so kennzeichnen. Web/App-Prüfung separat mit getesteten und offenen Interaktionen, Quellversion und Beleg. Echte Kunden-/Partner-/Zahlungstests bleiben gesperrt, noindex bleibt erhalten.
