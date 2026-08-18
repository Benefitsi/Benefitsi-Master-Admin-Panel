# Benefitsi Operating System

**Stand:** 2026-08-16  
**Status:** Architecture alignment; keine Runtime- oder Produktionsumschaltung  
**Owner:** Benefitsi-Infrastruktur unter `admin.benefitsi.de` und Supabase

Dieses Dokument ist die verbindliche Einordnung von Ben, City Ops und den
späteren Benefitsi-Read-Models. Es ergänzt die City-Agent-Dokumentation; es
ersetzt nicht die fachlichen City- oder Content-Verträge.

## Architekturentscheidung

Benefitsi besitzt ein eigenes **Benefitsi Operating System**. Die operative
Logik, Sicherheitsgrenzen, Queue-/Review-Verträge und Source of Truth bleiben
in der Benefitsi-Infrastruktur. Arc ist ein externes Founder Command Center.
Arc kann später sichere Read-Models beobachten und explizit freigegebene
Commands senden, darf aber niemals operative Source of Truth oder Trust
Boundary werden.

```text
PATRICK
└── BENEFITSI OPERATING SYSTEM
    └── BEN
        ├── Product / Strategy
        ├── Partner Ops
        ├── Growth
        ├── Content / SEO
        └── CITY OPS ORCHESTRATOR
            ├── Annweiler
            ├── Landau
            ├── Edenkoben
            └── weitere Städte
```

Ben ist damit **Benefitsi Orchestrator, Chief of Staff sowie Plan-/Review-/
Prioritization-Agent**. Ben fasst Fachsysteme zusammen, priorisiert
Ausnahmen, bereitet Entscheidungen vor und eskaliert Risiken. Ben dupliziert
nicht die Facharbeit der City-, Partner-, Content- oder Product-Systeme.

## Ownership im aktuellen System

| Bereich | Aktueller Owner | Source of Truth | Rolle von Ben |
| --- | --- | --- | --- |
| City-Quellen, Runs, Snapshots, Findings, Freshness, Schedules | City Ops | bestehende `city_agent_*`-Tabellen | zusammenfassen, priorisieren, eskalieren |
| City-Drafts, Reviews und Veröffentlichungsgates | City Ops + Human-Gate | City-Content- und Review-Tabellen | Review-Empfehlung/Entscheidungsvorlage |
| Partner, Standorte, Öffnungszeiten und Benefits | Partner Ops | bestehende Partner-Tabellen | später Business-/Partner-Summary konsumieren |
| Public City Web | City-Web-Codebase | freigegebene City-Content-Projektion | keine direkte Rohdaten- oder Browsersteuerung |
| Admin Operations | Master Admin unter `admin.benefitsi.de` | serverseitige DAL-/Actions- und Supabase-Zugriffe | zentrale Operations-Oberfläche |
| Arc / Founder Command Center | extern | keine Benefitsi-Source-of-Truth | optionaler, authentifizierter Beobachter/Command-Client |

Die City-Web-Codebase bleibt ein eigenständiges Webprodukt. Sie liefert
Templates, City-Konfiguration, Public Rendering und Content-Struktur. Die
operative City-Automation gehört dagegen zu City Ops innerhalb der
Benefitsi-Infrastruktur.

## City Ops: die heutige Einordnung

Das bestehende generische City-Agent-System ist die erste Implementierung von
**City Ops** bzw. dem **City Ops Orchestrator**. Es ist nicht der oberste
Benefitsi-Orchestrator und keine Annweiler-Sonderarchitektur.

Bereits passend sind insbesondere:

- der gemeinsame Modul-Katalog in `lib/city-agent/modules.ts`;
- der city-scoped Runner in `lib/city-agent/runner.ts`;
- Quellen-, Run-, Snapshot-, Proposal-, Finding-, Baseline-, Health- und
  Scheduler-Verträge;
- die serverseitige Operations-/Review-Ansicht unter `/automation`;
- die harte Trennung über `city_id`, `city_profile` und city-spezifische
  Controls/Schedules;
- die gemeinsame Pipeline `Queue → Run → Source → Snapshot/Diff → Finding/
  Proposal → Review/Audit`.

Die Begriffe `City-Agent`, `orchestrator_profile` und `city-{slug}`
bleiben aus Kompatibilitätsgründen zunächst im Code und Schema erhalten.
Inhaltlich ist `city-{slug}` der City Context und
`orchestrator_profile=ben` die aktuelle Ausführungs-/Review-Identität.
Diese Felder bedeuten **nicht**, dass Ben ein separater Annweiler-Agent oder
dass jede Stadt ein eigenes Softwareprodukt besitzt.

Der optionale Hermes-/M1-Adapter ist eine Integrationsschicht für Recherche
und Review. Er ist nicht der Besitzer der Benefitsi-Daten und keine
Voraussetzung für die Benefitsi-Operationslogik. Ein nicht erreichbarer
Adapter darf die Trust Boundary nicht umgehen.

## Multi-City-Isolation

Die fachliche Einheit ist immer:

```text
Shared Agent Definition
  + City Context
  + City Sources
  + City State
  + City Policies
  = City Ops Instance
```

Für jede Stadt bleiben mindestens getrennt:

- Quellenregister und Quellenstatus
- Runs, Snapshots und Audit-Einträge
- Schedules und Health
- Findings, Proposals und offene Reviews
- Freshness, SEO-Chancen, Media Needs und QA-Befunde
- Publication State und city-spezifische Policies

Der Runner filtert bereits über `city_id` und nimmt den City Context explizit
entgegen. Ein Fehler in Annweiler darf deshalb weder Daten noch Metriken einer
anderen Stadt verändern. Landau und Edenkoben brauchen später primär Setup,
Quellen, Daten und Shadow Validation – keine neue Agent-Plattform.

## City Ops Read Model

Ben soll keine tausenden Roh-Runs lesen. Als nächste Architekturphase wird ein
verdichtetes, aus bestehenden Tabellen abgeleitetes Read Model benötigt. Es
ist zunächst ein Vertrag bzw. eine serverseitige Projektion, keine zweite
Datenwelt und keine zusätzliche Raw-Data-Source-of-Truth.

### `CityOpsSummary`

```text
city_id, city_name, operating_mode, publication_state, overall_health
critical_count, attention_count, open_reviews, open_conflicts
source_total, source_healthy, source_degraded, source_failed
stale_entities, recent_real_changes, seo_opportunities, high_priority_seo
qa_issues, media_needs, last_successful_cycle, next_expected_cycle, missed_jobs
```

Die Werte werden aus bestehenden City-Control-, Source-, Run-, Schedule-,
Finding-, Proposal-, Baseline- und Health-Daten abgeleitet. Ein materialisierter
Snapshot ist erst nötig, wenn Abfrage- oder Netzwerkgröße es verlangen.

### `CityAttentionItem`

```text
id, city_id, source_domain, agent_type, category, severity
title, summary, requires_human, decision_id?, created_at, deep_link
```

Das Attention-Modell normalisiert offene Findings, Source Failures, stale
Entities, Konflikte, QA-Probleme und verpasste Jobs. Es ersetzt nicht die
Detaildaten und darf erledigte/abgelehnte Einträge nicht unsichtbar machen;
die Audit-Kette bleibt erhalten.

Weitere spätere Projektionen:

- **City Network Summary:** `CityOpsSummary[]` plus Netzwerk-Zähler für
  healthy, attention und critical.
- **Ben Briefing:** priorisierte Zusammenfassung aus City Ops, Partner Ops,
  Product, Growth, Content/SEO, Decisions und Alerts.
- **Decision Summary:** ein einheitlicher Blick auf bestehende Reviews,
  Proposals und spätere domänenübergreifende Entscheidungen.

## Decision Layer

Die vorhandenen City-Review-/Proposal-Strukturen decken lokale Human-Gates
bereits ausreichend ab. Ein generischer Decision Layer ist daher ein späteres,
additives Modell und wird nicht während des laufenden Shadow-Fensters migriert.

Langfristig kann ein `DecisionItem` folgende Form besitzen:

```text
id, domain, entity, city_id?, severity, title, context
recommended_action, allowed_actions, created_by, requires_human, status
created_at, resolved_at, resolved_by
```

City-Agent-Konflikte, SEO-Publish-Entscheidungen, Partnerentscheidungen,
Product-Entscheidungen und Content Approvals können dann in einem Ben-Briefing
zusammenlaufen. Bis dahin bleiben bestehende City-Reviews und Proposals die
Source of Truth; es wird keine parallele Decision-Datenwelt angelegt.

## Arc Boundary und spätere API

Für eine spätere externe Anbindung sind versionierte, read-only bzw. separat
geschützte Schnittstellen vorgesehen:

```text
GET Benefitsi Summary
GET Ben Briefing
GET City Network Summary
GET City Summary
GET Attention Items
GET Decisions
```

Commands werden technisch und sicherheitlich getrennt von Read Models
behandelt. Für jeden späteren Command validiert Benefitsi selbst Authentication,
Authorization, Input, erlaubte Aktion, aktuellen Zustand, Human-Gate und Audit.
Eine Arc-Integration wird jetzt nicht implementiert.

## Status und nicht veränderte Grenzen

Die laufende Annweiler-Abnahme bleibt die aktuelle operative Priorität. Dieses
Alignment ändert nicht:

- `SHADOW`-Mode und `auto_publish_enabled=false`;
- Scheduler-Cadences, Jobs, bestehende Runs, Proposals oder Baselines;
- Publication Policies, PRELAUNCH, `noindex` oder Agent Health;
- die laufende 48-Stunden-Messung und ihre Vergleichbarkeit;
- die City- und Partner-Source-of-Truth.

Nach erfolgreicher Shadow-Validierung folgt als nächste Architekturphase
**Benefitsi Operating System – Phase 1**: Ben Core, City Network View, City
Summary Read Model, Attention Layer, Decisions Aggregation und eine
Benefitsi-Operations-Home. Weitere Departments werden erst danach schrittweise
angebunden.

## Canonical references

- City Ops-/Agent-Verträge und Runner: `lib/city-agent/`
- Admin-Daten-/Operations-Verträge: `lib/automation/`
- City-Review-Oberfläche: `lib/city-operations/` und `app/city-operations/`
- Agent Operations: `app/automation/`
- City-Seiten- und Public-System: separate `benefitsi-web`-Codebase
- Gemeinsame operative Persistenz: Supabase, serverseitig über Service Role

