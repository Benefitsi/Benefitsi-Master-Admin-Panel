# City-Agent Autonomous Operations

## Zielbild

Der City Agent erledigt wiederkehrende Recherche- und Prüfaufgaben selbstständig.
Menschen sehen nur Ausnahmen, die fachlich oder rechtlich nicht sicher
automatisiert entschieden werden können.

Automatisch ausgeführt werden:

- Scheduler-Aufträge planen, begrenzt abarbeiten und bei hängenden Läufen
  wieder in die Queue zurückführen
- freigegebene Quellen abrufen, semantische Änderungen erkennen und
  Quellen-Health mit echten Fetch-Ergebnissen aktualisieren
- Findings, Proposals und Duplikate über die vorhandenen Audit-/Queue-Tabellen
  nachvollziehbar speichern
- Freshness-, Event-, Business-, Route-, Media- und QA-Prüfungen ausführen
- aus belastbaren, freigegebenen Quellen deterministische Editorial-Entwürfe
  im bestehenden `editorial_posts`-Modell erzeugen und aktualisieren

Editorial-Entwürfe sind quellengebunden, dedupliziert und bleiben `draft`.
Der Agent erfindet keine Termine, Preise, Öffnungszeiten, Medien oder
Koordinaten. Ein bestehender menschlicher oder veröffentlichter Beitrag wird
nicht überschrieben.

Nach einem fachlich freigegebenen Admin-/Agent-Write wird die bestehende
öffentliche Web-Cache-Schicht best-effort über den authentifizierten
`/api/revalidate`-Endpunkt benachrichtigt. Die Zuordnung ist zentral begrenzt
und invalidiert nur bekannte Cache-Tags und City-Pfade; fällt die
Benachrichtigung aus oder fehlt der gemeinsame Server-Secret, bleibt der Write
gültig und die vorhandenen TTLs greifen weiter. Es werden keine Inhalte
veröffentlicht und keine Datenbanktabellen dupliziert.

## Ausnahmeprinzip

Eine Entscheidung landet bei Patrick bzw. in der Review-Queue, wenn sie zum
Beispiel:

- eine neue, entfernte oder zusammenzuführende Entity betrifft
- Event-Zeit, Event-Status, Preis, Öffnungszeiten oder Partner-/Deal-Daten
  verändert
- Medienrechte, Canonical/Slug, Löschen, Legal- oder Safety-Text berührt
- widersprüchliche Quellen, zu wenig Belege oder eine nicht freigegebene
  Quelle hat

Erst eine vorhandene Entity, Trust-Tier A, mindestens zwei Belege,
Konfidenz mindestens 0,98, niedriges Risiko und ein enges SEO-Metadaten-
Allowlist-Feld können später überhaupt als Guarded-Auto-Kandidat gelten.
Die Policy selbst führt keine geschützte Mutation aus; die bestehende zentrale
Write-/Publish-Gate und das Audit bleiben verpflichtend.

## Aktueller Rollout

Annweiler bleibt bewusst:

- `SHADOW`
- `PRELAUNCH` / `noindex`
- `auto_publish_enabled = false`
- `manualRunsAllowed = false`

Damit arbeitet die Automationskette bereits beobachtbar und erstellt bei
geeigneten Änderungen nur Entwürfe/Review-Fälle. Es werden keine Inhalte,
Events, Partner, Medien oder Blogbeiträge automatisch öffentlich geschaltet.
Ein späterer Guarded-Auto-Pilot braucht zuerst echte natürliche Scheduler-
Nachweise, vollständige Scheduler→Worker→Run→Result-Verknüpfung und eine
separate Freigabe. Es werden dabei keine neuen Städte aktiviert.

## Admin-Arbeitsweise

Die Automation-Control-Seite ist die Ausnahmezentrale:

1. **Aufmerksamkeit / Priorisierte Findings** zuerst bearbeiten.
2. **Quellenprobleme** nur bei echtem Fehler oder fehlender Recovery prüfen.
3. **Review** nur für sensible, widersprüchliche oder neue Inhalte öffnen.
4. **Automatische Redaktion** zeigt erzeugte Entwürfe; Veröffentlichung bleibt
   bis zur fachlichen Freigabe geschützt.
5. Gesundheit, Scheduler-Matrix und Audit-Spur dienen als Kontrollnachweis,
   nicht als tägliche manuelle Checkliste für jeden normalen Lauf.

Die write-getriggerte Cache-Revalidierung für Events, Places,
Partners/Benefits, Memories und Media ist technisch implementiert. Vor dem
öffentlichen Launch muss nur noch derselbe server-only Secret in Admin und Web
konfiguriert und der kontrollierte Production-Deploy geprüft werden. Das ist
Konfiguration/Verifikation, kein neuer City-Agent-Architekturblock.
