# Partner-Dashboard: Oberfläche und Datenvertrag

Stand: 6. Oktober 2026. Diese Anleitung beschreibt die reale Implementierung, keine Demo. Gemeinsame Nutzerentscheidungen liegen zusätzlich im Workspace unter `docs/benefitsi/ux/README.md`. Native Referenz: Dashboard-Umsetzung `878630727e198382c4f0cd7ca7c08e20fef3abd8`.

## Einstieg und Erhaltungsregeln

Bestehenden Partnerbereich ergänzen. Originalmarke, helles Layout, weiß/kühle Neutraltöne, Blau `#118CFF`, Türkis `#17D4D7`; eine Tarifmarkierung am Account. Web zeigt Start, Vorteile, Statistik, Betrieb sowie bewusste Zugänge zu Kundenbindung und Abo. Die native Hauptnavigation samt Scanner bleibt unabhängig erhalten. Keine Smartphone-Rahmen, Tarif-Demoschalter oder künstlichen Betriebsdaten in Produktion.

`components/partner/partner-dashboard.tsx` enthält Rahmen/Start; `partner-statistics.tsx` die sieben Themen mit zugänglichen Tabellen; `lib/partners/insights.ts` die explizite Aggregatprojektion. `PartnerWorkspace` bleibt Eigentümer der vorhandenen Speichervorgänge. Portal-Erweiterungen müssen über `portalMode` abgegrenzt bleiben. Admin-Tarife, effektive Rechte, Founder, Billing/Provider und der Microsite-Builder dürfen dadurch nicht verändert werden.

| Thema | Datenquelle und erhaltene Bedeutung |
| --- | --- |
| Besuche | Vier Start-KPIs; Tages-, Wochen-, Monatsverlauf mit echten Nulltagen; vollständige Besuchszeitwochen und Datenschutzgranularität; Mittelwert je Kalendertag, Besuche mit Einlösung, Einlösungen je Besuch, echte Besuchsabstände |
| Gäste | Zeitraum-Gäste, überlappende Erst-/Wiederkehrgäste, gereifte 30-Tage-Rückkehr; aktive Stammgäste und vier Besuche im festen 720-Stunden-Fenster; Lifetime-/Wochenfrequenz; historischer Consumer-Premium-Ereignisstatus |
| Gäste-Level | Fünf Gruppen, 14 Unterstufen, Anteil/Anzahl/Quelle; drei separat überlappende Abzeichen. B4 bleibt unbekannt, da die bestätigte Nullbesuch-Beziehungspopulation fehlt |
| Angebote | Tatsächliche Katalognamen, Typen getrennt aggregiert, Einlösungen/eindeutige Gäste, erste/wiederkehrende Einlöser, gewichtete Lifetime-Besuche; keine erfundene Conversion oder Kausalrangliste |
| Treue | Zeitraum-Stempel, aktueller Kartenbestand und zielnormalisierter Fortschritt, gespeicherte Gesamtzyklen, reale Konfiguration; alte Serienschritte und Kalendermechanik je Einheit getrennt |
| Wachstum | Sechs Kennzahlen mit vorherigem Wert, absoluter und relativer Änderung sowie genauen Fenstern; Monatsbericht und geschützter CSV-Export |
| Feedback | Nur effektive Backend-Freigabe; letzte vollständig abgeschlossene Kalenderwoche, mindestens fünf Antworten; Bewertung und geschützte Kategorien |

## Vertrag, Schutz und Export

Nur `get_partner_dashboard` und separat berechtigungsgeprüftes `export_partner_dashboard`, vier unveränderte Parameter inklusive `Europe/Berlin`. Root bleibt `partner-dashboard-v1`; additive Insights sind ausschließlich `partner-dashboard-insights-v1`. Unbekannte/fehlende Versionen zeigen die alten Kennzahlen weiter und neue Bereiche als nicht verfügbar. Keine Rohkundentabellen oder clientseitigen Ersatzmetriken. Alte freigegebene `breakdowns.weeks[].offers` bleiben bei fehlenden/unbekannten additiven Angebotsversionen als Wochenwerte sichtbar. Diese UI-Fallback-Daten haben keine öffentlichen Katalognamen und heißen ehrlich „Name nicht verfügbar“; interne IDs werden nicht angezeigt. Root-, Wochen-, Dimensions- und Bucket-Sperren sowie ungültige Zählwerte werden respektiert. Unterstützte, aber gesperrte additive Abschnitte aktivieren keinen Fallback. Die gemeinsame CSV-Projektion bleibt davon unverändert.

Jeder Abschnitt, jede Woche, Dimension und jedes explizit markierte Bucket kann eingeschränkt sein. Ein gesperrter Vorfahr sperrt alle Nachfahren, auch bei zurückgebliebenen Zahlen. Nur endliche freigegebene Zahlen; unbekannt, geschützt und Fehler sind keine null. Diagramme mit ausschließlich zurückgehaltenen/ungültigen Buckets zeigen fehlende freigegebene Abdeckung. „Keine Besuche“ erfordert eine explizite leere Serverdimension. Zeitreihen mit fehlerhaften Punkten werden nicht durch Weglassen verbunden.

Bestandswerte ignorieren den gewählten Zeitraum und zeigen den Stichtag. Gespeicherte Kartenzyklen sind Lifetime-Snapshots, keine Prämienausgabe. Abzeichen: erster Besuch > 0; Stammgast mindestens 10 Lifetime-Besuche; Serie gespeicherter `current_streak > 0`, ohne gesicherten Ablauf. Aktive Stammgäste verwenden eine andere Definition. Lifetime-Stufen sinken nicht allein durch Inaktivität. Premium-Gast ist nicht Partner-Pro. Kalender- und alte Partner-Serienschritte haben verschiedene Einheiten. Kein Interessentenwert, ROI, Versand oder Funnel-Nenner wird erfunden.

`lib/partners/csv.ts` entspricht der nativen expliziten Projektion: UTF-8 BOM, Komma, acht vollständig zitierte Spalten, CRLF inklusive Abschluss. Werte bleiben ungerundet; Anteile sind 0–1. Alle endlichen ganzzahligen Zahlen werden zentral als Integer-Dezimalzahl serialisiert (auch große Werte, ohne Exponentenschreibweise); typisierte negative Vergleiche bleiben numerisch; Formelinhalte aus Text werden mit Apostroph geschützt. Kein rekursiver Rohdatenexport, keine persönlichen IDs. Exakte SQL-Fixtures `rich-free.json`/`rich-pro.json` und unabhängige native Vergleichsdateien liegen unter `tests/fixtures/partner-dashboard/`: 118 bzw. 440 Datenzeilen. Alte Fixtures bleiben erhalten. Neue vertragliche Felder benötigen zuerst einen beidseitigen Projektionsentscheid.

## Tatsächliche Betriebswege

Alle Wege benötigen den ausgewählten Partner und seine effektiven Rechte. Free enthält unbegrenzte normale Angebote/Happy Hour und einen Drop pro Kalendermonat/Standort; bestehende Quoten und Readiness-Prüfungen bleiben serverseitig wirksam.

- Start: Angebot erstellen öffnet den vorhandenen Deal-Dialog über `section=deals&tab=deals&action=create`. Zeiten bearbeiten führt zu `section=business&tab=hours`.
- Betrieb: `tab=details` für Profil/Kontakt und Bilder; Anker `#partner-contact`/`#partner-media`. Bilder bezeichnet die echte Bildpflege, keine neue Video-/360-Produktion.
- Öffnungszeiten: vorhandenes `OpeningHoursPanel` mit Wochenplan, mehreren Zeitfenstern und Ausnahmen; keine zweite Mutation.
- Happy Hour: `section=deals&tab=deals&filter=happy_hour`; der tatsächliche Angebotseditor besitzt Zeiten und Bedingungen.
- Menü: **`/partner?section=business&tab=menu&partner=<id>` bleibt stabil** für native Verweise. Nur unterstützte Betriebstypen; gleiche Normalisierung in `lib/partners/management.ts` und Editor.
- Team: `tab=access` nur bei effektiver `team.manage`-Freigabe.
- Kundenbindung: `/partner/crm?partner=<id>`; echte Entwürfe und Zielgruppenvorschau. Kein Versand oder laufende Automatisierung behauptet.
- Abo: `/partner/billing?partner=<id>` bewahrt bestehende Angebote, Verträge und Module. Free-Stadteintrag und Pro-Microsite bleiben getrennt; veröffentlichter Zustand kommt aus Workspace-Daten. Microsite-Bearbeitung bleibt im Portal deaktiviert.

Angebotskarten zeigen tatsächlichen Aktiv-/Pausiert-/Geplant-/Beendet-Status und öffnen den vorhandenen Editor. `active=false` ist keine belegte Entwurfssemantik und heißt deshalb „Pausiert“. Keine zusätzliche Publikationsbehauptung oder Mutation.

## Kleine reproduzierbare Prüfungen

Node 22, gesperrte Abhängigkeiten aus `package-lock.json` verwenden. Auf dem lokalen 16-GiB-Mac keine zusätzliche Toolchain starten; SSD/Prozesse vor schweren Prüfungen kontrollieren.

```sh
node --import tsx --test --test-concurrency=2 tests/partner-dashboard-contract.test.mjs tests/partner-dashboard-ui.test.mjs tests/partner-chart-data.test.mjs tests/partner-dashboard-csv.test.mjs tests/partner-dashboard-insights.test.mjs tests/partner-dashboard-rich-ui.test.mjs tests/form-save-ui.test.mjs
npm exec -- tsc --noEmit
```

Die Partnergruppe in `.github/workflows/security.yml` enthält die selbstständigen Dashboard-/Chart-/CSV-Tests. Bestehende Build-, Audit-, Sicherheits- und Node-Checks bleiben erhalten. Cross-Repository-Vertragsprüfungen laufen separat im gemeinsamen Workspace.

Offline-SSR darf nur Transport-/Laufzeitgrenzen ersetzen. `scripts/partner-preview-loader.mjs` deaktiviert Mutationen und den Browser-Bildworker. Synthetic-Fixtures gehören ausschließlich in Tests/Harness. DOM-/SSR-Tests beweisen keine Pixelqualität, reale Browser-Sitzung, Berechtigung am Live-System oder erfolgreich gespeicherte Betriebsänderung. Diese Abnahme folgt durch den Parent im unterstützten Browser; keine Live-Daten nur zum UI-Test ändern.
