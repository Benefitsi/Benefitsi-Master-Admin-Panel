# Stadtmessung im Admin

`/analytics` zeigt für eine ausgewählte Stadt zwei unabhängige Quellen: Stadtnutzung und Anfragen sowie Web-Betrieb. Die vorhandene Unternehmensanalyse bleibt erhalten. Fällt ihre Quelle aus, bleibt die Stadtsektion mit eigenen Auswahlfeldern erreichbar.

## Zugriff und Anfrage

`app/analytics/page.tsx` beendet `requireAdmin()` vor beiden Loadern. Der neue Server-Loader prüft zusätzlich `getAdminSession()` und `get_my_analytics_permissions_v1().business_analytics_read`. Erst danach liest er mit dem Sitzungsclient die Stadtoptionen und erzeugt bei gültigem Scope einen Service-Client. Finanzrechte werden für die Stadtaggregate nicht benötigt.

Es entsteht kein neuer öffentlicher API-Endpunkt. `lib/analytics/city-measurement-loader.ts` ist mit `server-only` markiert und ruft ausschließlich diese beiden RPCs parallel auf:

```ts
city_conversion_readout({ p_city_slug, p_from, p_until, p_environment })
city_web_operations_readout({ p_city_slug, p_from, p_until, p_environment })
```

Der Scope verwendet die Stadt-ID aus den vorhandenen Filtern und löst sie über die berechtigte Stadtliste zum Slug auf. Zeiträume umfassen maximal 90 Berliner Kalendertage; das Ende ist die Mitternacht nach dem letzten ausgewählten Tag, exklusiv. Der Datenbankvertrag erlaubt 93 tatsächliche Tage und deckt damit auch den zusätzlichen Herbst-DST-Zeitraum ab. `production`, `staging` und `test` bleiben getrennt. Partner-, Kanal- und Planfilter führen zu einem erklärten ungültigen Scope und einem angebotenen Rücksetzlink. Sie werden nicht stillschweigend ignoriert.

Alle neuen PostgREST-Anfragen haben ein Abort-Signal nach acht Sekunden. Ein Fehler oder fehlender RPC betrifft nur seine Quelle. Unauswertbare Antworten ergeben keine Ersatzwerte; interne Fehlertexte werden nicht dargestellt.

## Quellen und Aussagegrenzen

| Anzeige | Kanonische Quelle | Bedeutung |
| --- | --- | --- |
| Stadtaufrufe und Actors | `city_conversion_readout.web_observations` aus `analytics.reportable_product_event_facts_v1` | Einwilligungsgebundene Beobachtungen nach Quellausschlüssen. Actors sind keine Personenzählung; Stadtaufrufe umfassen Detailrouten. |
| Partneranfragen und Qualifikation | `partner_requests` aus `private.city_partner_interests` | Operative, nicht als Test markierte Anfragen im Scope. Kein Einwilligungsnenner. |
| Bestätigte Besuche und Einlösungen | `backend_consented` aus bestätigten Outbox-Fakten | Serverbestätigt, im Einwilligungs- und Testausschlussbereich der RPC. Keine Ableitung aus einem Klick. |
| Zustellstatus | `web_observations.provider_delivery` | Status bereits gespeicherter Beobachtungen. Ablehnungen vor ihrer Speicherung fehlen in dieser Quelle. |
| Ladezeiten, Fehler und Alarme | `city_web_operations_readout` Version 1 | Separate technische Aggregate. 30 Tage Aufbewahrung; ältere Auswahlzeiträume sind unvollständig. |
| Google-Auswertung | Links auf GA4 und Search Console | Die Produktverknüpfung ist bestätigt. Der Admin importiert derzeit keine Google-API-Statistiken. |

`ready` und `empty` setzen eine gültige Quellantwort voraus. Nur dann kann ein gemessener Zähler `0` sein. `setup_required` und `unavailable` zeigen einen ausdrücklichen Hinweis. Ein fehlendes Web-Aggregat bleibt `null`, selbst wenn operative Anfragen vorhanden sind. Technische `no_observations` belegt keine Fehlerfreiheit. Abfragezeit, Auswertungszeit und letzte Beobachtung werden getrennt angezeigt.

Die Oberfläche berechnet keine Gesamt-Conversion aus Einwilligungsbeobachtungen und operativen Anfragen. Stadtbezogene Konten, Installationen, vollständige Besucherzahlen und Sessions werden nicht erfunden. Kontrollierte anonyme QA-Läufe benötigen eine Testumgebung; sie können nicht über einen Account-Ausschluss aus der Produktionsquelle herausgerechnet werden.

## Technischer Vertrag

Die vollständige DTO-Struktur steht in `docs/superpowers/specs/2026-09-22-city-measurement-admin.md`. Die Projektion überprüft Schema-Version, Stadt, Umgebung, beide Zeitgrenzen, endliche Zahlen, Ganzzahlzähler, Summenkonsistenz und eindeutige Gruppen. Unbekannte Zusatzfelder werden verworfen. Route und Fehlercode müssen den festen Vokabularen in `city-measurement-contracts.ts` entsprechen; URLs, Queries, freie Fehlerklassen und Stacks sind keine Anzeigefelder.

Die Grenzen passen zur Version-1-Migration `20260922083528_city_web_operations.sql`: 22 Routentypen × 3 Geräte × 5 Metriken ergeben maximal 330 Vital-Gruppen; 22 Routen × 3 Fehlerarten × 7 Fehlercodes ergeben maximal 462 Fehlergruppen. Hinzu kommen maximal 100 gespeicherte und 330 abgeleitete Alarme. Wird das Quellvokabular erweitert, müssen Reader und Vertrag gemeinsam angepasst werden.

LCP, INP, TTFB und FCP werden als p75 in Millisekunden gezeigt, CLS ohne Einheit. Unter 100 Stichproben je Gruppe bleibt die Einordnung vorläufig. Die guten Grenzen für Core Web Vitals sind LCP ≤ 2.500 ms, INP ≤ 200 ms und CLS ≤ 0,1. TTFB und FCP erhalten die Einordnung „Gemessen“; die Datenbank darf dazu diagnostische Alarme liefern. Es gibt keinen pauschalen Gesundheitsstatus.

Alarme zeigen den Zustand und die festen Titel der Quelle. Verweise öffnen die zugehörigen Tabellen und die bestehende Prüfwarteschlange. Diese Oberfläche legt keine Automationsaufträge an und verschickt keine Benachrichtigungen. Für Quellenprüfung und fehlgeschlagene Aufträge werden die vorhandenen Seiten mit passendem Stadtparameter verlinkt.

Google-Ziele sind GA4 Property `516005474` und die GSC-URL-Prefix-Property `https://benefitsi.de/`. Ihre Verknüpfung wurde am 22.09.2026 im Hauptauftrag bestätigt. Der fehlende API-Reader ist ein eigener Integrationsschritt und kein Fehler dieser Produktverknüpfung.

## Lokale Prüfung am 22.09.2026

- 27 neue Verhaltenstests: Autorisierung vor Servicezugriff, Scope, DST, Quelle fehlt, Teilfehler, gültige 0 gegen unbekannt, Datenprojektion, maximale Gruppierung, p75/Stichprobe und echte Server-Rendering-Integration der Analytics-Seite.
- `npm test`: 466 bestanden, 0 fehlgeschlagen.
- `npm run lint`: erfolgreich, 0 Fehler. Vorhandene Warnung `NewDealCard` in `app/partner-admin.tsx` bleibt außerhalb dieser Änderung.
- `npx tsc --noEmit`: erfolgreich; der abschließende Produktionsbuild hat TypeScript nochmals geprüft.
- `NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack`: erfolgreich mit installiertem Next.js 16.3.3, einschließlich dynamischer `/analytics`-Route. Der Standard-Turbopack-Build scheiterte an einer lokalen Prozess-/Portbeschränkung; die Bundler-Konfiguration wurde nicht geändert.

Die Tests verwenden synthetische DTOs und inerte Auth-/Transportgrenzen. Es wurden keine Geheimnisse kopiert und keine Live-Kennzahlen oder Browser-Abnahme behauptet. Datenbankmigration, produktive Anbindung, unabhängige Integrationsprüfung und Browseransicht erfolgen im Hauptauftrag.

Gezielte Wiederholung:

```sh
node --import tsx --test tests/city-measurement-contracts.test.mjs tests/city-measurement-loader.test.mjs tests/city-measurement-render.test.mjs
```

Vor der Freigabe im Hauptauftrag: Mit einer berechtigten Admin-Sitzung einen realen Stadt-Scope öffnen; fehlende/neue Messungen prüfen; QA ausschließlich getrennt erfassen; gegen die beiden RPC-Aggregate abgleichen; mobile Tabellen und Warteschlangenlinks im Browser prüfen. Eine leere technische Quelle bleibt bis zu echten Beobachtungen ausdrücklich ohne Messnachweis.
