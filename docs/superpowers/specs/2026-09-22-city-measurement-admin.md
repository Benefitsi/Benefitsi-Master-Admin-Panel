# Stadtmessung und Web-Betrieb im Admin

Die Umsetzung ist vom Nutzer freigegeben. Sie erweitert ausschließlich den vorhandenen Bereich `/analytics` um eine ausgewählte Stadt und verwendet bestehende globale Admin- und Analytics-Rechte. Datenbank, Web-Erfassung, Veröffentlichung und Browser-Abnahme erfolgen im Hauptauftrag.

## Verhalten

- `/analytics` behält Unternehmensanalyse und Filter. Die neue Stadtsektion bietet echte Stadtoptionen; ohne ausgewählte Stadt verlangt sie eine Auswahl.
- Stadtmessung gilt für maximal 90 Berliner Kalendertage, halb offen von Mitternacht bis Mitternacht nach dem letzten Tag. Partner-, Kanal- und Planfilter werden von den Stadt-RPCs nicht unterstützt; die UI erklärt das und bietet einen Link ohne diese Zusatzfilter.
- Der Server prüft Admin-Sitzung und `get_my_analytics_permissions_v1().business_analytics_read`, bevor er einen Service-Client erzeugt. Finanzrechte sind für diese Aggregate nicht erforderlich.
- `city_conversion_readout` liefert beobachtete Web-Aufrufe/Actors, operative Partneranfragen, bestätigte einwilligungsgebundene Besuche/Einlösungen und Providerzustellung. Keine Ableitung von Installationen, Gesamtbesuchern oder einer Misch-Conversion-Rate.
- `city_web_operations_readout` liefert Core Web Vitals und zusätzliche Ladezeitmetriken, gruppierte technische Fehler und Alarme. Fehler einer Quelle lassen die andere lesbar. Keine Messung/fehlender RPC ist kein Nullwert und kein gesunder Betrieb.
- Rohdaten, Actor-/Benutzer-IDs, Queries, freier Stack und interne Fehlermeldungen gelangen nicht in die UI. Antwortscope muss zur Anfrage passen. Einwilligungs-/QA-Separation bleibt Sache der kanonischen RPCs und wird benannt.
- Technische Metriken werden je Metrik, Gerät und Routentyp gezeigt. p75 LCP/INP/TTFB/FCP in Millisekunden, CLS einheitenlos. Weniger als 100 Stichproben ist vorläufig; TTFB/FCP erhalten keinen Core-Web-Vitals-Passstatus.
- Verlinkt werden GA4 Property `516005474` und die bestätigte GSC-URL-Prefix-Property `https://benefitsi.de/`. Ihre Verknüpfung ist vom Hauptauftrag bestätigt; der Admin importiert keine Google-API-Daten. Alarme/Quellenprüfung führen zu bestehenden Admin-Queues. Keine Empfänger oder Nachrichtenkanäle werden erfunden.

## Bestätigter technischer RPC-Vertrag

`city_web_operations_readout(p_city_slug text,p_from timestamptz,p_until timestamptz,p_environment text)` wird im Hauptauftrag erstellt und ist nur für `service_role` lesbar. Die Antwort ist:

```ts
type WebOperationsReadout = {
  schema_version: 1
  city_slug: string
  environment: 'production' | 'staging' | 'test'
  from: string
  until_exclusive: string
  generated_at: string
  last_observed_at: string | null
  coverage: 'observed_subset' | 'no_observations'
  vitals: Array<{ metric: 'LCP'|'INP'|'CLS'|'TTFB'|'FCP'; device: 'mobile'|'desktop'|'unknown'; route_kind: string; sample_count: number; p75: number|null; last_observed_at: string|null }>
  errors: Array<{ error_kind: 'client_error'|'unhandled_rejection'|'server_error'; error_code: string; route_kind: string; count: number; last_observed_at: string|null }>
  alerts: Array<{ key: string; severity: 'warning'|'critical'; state: 'open'|'resolved'; title: string; observed_value: number|null; threshold: number|null; sample_count: number|null; last_observed_at: string|null }>
  limitations: string[]
}
```

Dieser Vertrag ist ein Aggregat, kein öffentlicher Schreibvertrag. Quelle, Zeitraum, Abfragezeit und letzte Beobachtung sind getrennt. Eine erfolgreich leere technische Quelle heißt „Noch keine Beobachtungen“.

## Dateien und Abnahme

Neue Dateien: `lib/analytics/city-measurement-{contracts,filters,normalize,loader}.ts`, `components/analytics/city-measurement-dashboard.tsx`, passende `tests/city-measurement-*.test.mjs`. Einbindung in `app/analytics/page.tsx`. Keine Änderungen an City-Agent-Dateien des parallelen Arbeitspakets.

Abnahme durch Verhaltenstests für Rechte vor Servicezugriff, DST/Zeiträume, Scope-Verwechslung, Quelle fehlt/Timeout, echte 0 gegen unbekannt, minimale DTOs, partielle Quellen, Metrikstichprobe und gerenderte UI. Lint, Typecheck und Build schließen lokale Prüfung ab; Live-Daten und Browser bleiben dem Hauptauftrag vorbehalten.
