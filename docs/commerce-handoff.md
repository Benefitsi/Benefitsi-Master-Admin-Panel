> Aktueller Review-/Rolloutstand: [commerce-rollout.md](commerce-rollout.md). Ältere Prüf- und Nicht-Push-Aussagen unten sind historische Entwicklungsschritte.

> 28.09.2026 – Per-partner ordering: `booking_providers.food_ordering_enabled` defaults to false. Admin `/commerce` owns the opt-in; the partner portal shows status and only admins see its switch. The public catalog hides food offers while disabled; `commerce_create_booking` rejects new food orders after locking the provider but preserves valid idempotent recovery and existing-order management. Tables/appointments are independent. Apply local migration `20260928104706_commerce_partner_ordering_gate.sql` before releasing this UI. Nothing has been applied remotely. See [commerce-rollout.md](commerce-rollout.md) for scope and validation.

# Benefitsi: Bestellen, Reservieren und Termine

Stand: 22. September 2026. Lokal vorbereitete Implementierung; nicht gepusht, nicht deployt, keine Remote-Migration und keine echte Zahlung oder Nachricht ausgelöst.

## Was vorbereitet ist

- **Essen zur Abholung:** Speisekarte, Extras, Warenkorb, Abholfenster, Kontakt, Vor-Ort-Zahlung oder Onlinezahlung, Annahme durch den Partner und Abholstatus.
- **Tischreservierung:** Gästezahl, physischer Tisch, freie Zeitfenster und Stornierung. Ein reservierter Tisch wird exklusiv belegt; die Sitzplatzanzahl ist keine Anzahl paralleler Reservierungen.
- **Dienstleistungstermin:** Leistung, Mitarbeiter/Ressource, Dauer und Puffer, freie Zeitfenster und Stornierung.
- **Partnerverwaltung:** Leistungen, Preise, Speisekarte/Extras, Ressourcen, Zeitfenster, Buchungseingang und Statuspflege unter `/partner/commerce`. Ein berechtigter Partnerinhaber kann seinen Betrieb einrichten; die Bestellfreischaltung selbst erfolgt ausschließlich durch Benefitsi-Admins. Mitarbeiter ohne Inhaberberechtigung erhalten keinen Verwaltungszugriff.
- **Website und App:** gemeinsame responsive Buchungsoberfläche unter `/buchen/{partnerId}`. Die Flutter-App zeigt den Einstieg nur bei freigeschaltetem, verfügbarem Angebot und öffnet denselben Ablauf im Systembrowser. Es gibt keinen zweiten Warenkorb in der App.
- **Bestätigung und Storno:** geschützte Statusseite unter `/buchung/{reference}?token=…`; Gastzugriff benötigt Referenz und zufälliges Geheimnis. Preise und Konditionen werden bei Buchung unveränderlich gespeichert.
- **Zahlungen:** Checkout und Erstattungen auf dem jeweiligen Stripe-Händlerkonto; keine Benefitsi-Provision aus der Kundenbestellung. Ein monatliches Benefitsi-Softwareabo wird separat beim Partner abgerechnet. Der Tarif wird über einen vorhandenen Stripe-Testpreis konfiguriert und hier nicht festgelegt.

Die erste Ausbaustufe arbeitet mit explizit angelegten Zeitfenstern. Lieferdienste mit Zustellgebieten/Fahrern, externe Kassensysteme, bestehende Lieferpate-/Salonkalender, wiederkehrende Dienstpläne und eine Übernahme fremder Bestelldaten sind nicht implementiert. Diese Schnittstellen setzen einen konkreten Anbieter und dessen Zugang voraus.

Die feste Stornoregel dieser Version erlaubt Kunden eine Stornierung bis zum Abschluss. Eine bereits online bezahlte Buchung wird vollständig zur Erstattung eingereicht. Individuelle Stornofristen, Ausfallgebühren und Teilstornos sind keine konfigurierbaren Regeln; zusätzliche Partnerhinweise ändern dieses Verhalten nicht.

Onlinebuchungen benötigen mindestens 35 Minuten Vorlauf. Dadurch endet die Zahlungsreservierung spätestens zum Beginn des Zeitfensters. Kurzfristigere Buchungen bleiben mit Zahlung vor Ort möglich, sofern der Partner diese Zahlungsart anbietet.

## Lokale Vorschau

Im Web-Worktree starten:

```sh
cd '/Users/patrick/Documents/New project/booking-integration-2026-09-22/web'
BENEFITSI_COMMERCE_ENABLED=true BENEFITSI_BOOKING_DEMO=true npm run dev -- --webpack --hostname 127.0.0.1 --port 3025
```

Danach öffnen: <http://127.0.0.1:3025/buchen/11111111-1111-4111-8111-111111111111>

Die sichtbar gekennzeichnete Demo umfasst alle drei Abläufe einschließlich Status und Storno. Sie speichert nur im Prozessspeicher, ruft weder Stripe noch eine Datenbank oder einen Versanddienst auf und ist im Produktionsmodus gesperrt. Nach einem Neustart sind die Demobuchungen weg. Die lokale Demo ersetzt keinen vollständigen Test mit Händlerkonto, Supabase und E-Mail-Zustellung.

## Ablage und Branches

Alle Änderungen liegen in vier isolierten Git-Worktrees, jeweils auf `codex/booking-integration-20260922`:

| Worktree | Ausgangscommit | Inhalt |
| --- | --- | --- |
| `admin/` | `9e6d03a` | Geschützte Buchungs-APIs, Partnerverwaltung, Stripe, Benachrichtigungen |
| `web/` | `e7d8a33` | Öffentliche Abläufe, Proxy, Partnerseiten-Einstieg, lokale Demo |
| `app/` | `ea79e12` | Flutter-Einstieg und Tests |
| `database/` | `fa4bc30` | Additive Migration, Datenbankvertrag, PostgreSQL-Tests |

Vorhandene Änderungen in den ursprünglichen Projektverzeichnissen wurden nicht übernommen oder überschrieben. `admin/node_modules` und `web/node_modules` verwenden die bereits installierten Abhängigkeiten über lokale Symlinks; neue Checkouts benötigen eine reguläre Installation. Webpack wird für diese Worktrees verwendet, weil Turbopack den externen Abhängigkeitspfad ablehnt.

Die Änderungen bleiben in diesen Worktrees zur Prüfung liegen, einschließlich neuer noch ungetrackter Dateien. Es wurden keine Commits, Merges oder Pushes erstellt. Die Verzeichnisse nicht löschen; sie enthalten die lokale Implementierung.

## Konfiguration und spätere Aktivierung

Admin/Web bleiben global standardmäßig ausgeschaltet; die bestehende App benötigt unabhängig von ihrem globalen Einstiegsschalter die ausdrückliche Backend-Freigabe pro Partner. Echte Zugangsdaten gehören ausschließlich in die bewusst konfigurierte Testumgebung, nicht in Git.

1. **Schema in einer Testumgebung prüfen:** Der kanonische Datenbankstand enthält bereits das bestehende Buchungsschema. Darauf folgt `database/supabase/migrations/20260922071813_commerce_booking_core.sql`. Nicht zusätzlich alte Juli-SQL-Dateien aus anderen Web-Arbeitsverzeichnissen replayen. Die lokalen Tests stellen die erforderlichen bestehenden Tabellen mit Testdaten bereit; sie ersetzen keinen vollständigen Baseline-/Staging-Migrationslauf.
2. **Admin und Web verbinden:** identisches serverseitiges `BENEFITSI_BOOKING_PROXY_SECRET` mit mindestens 32 Zeichen, `BOOKING_SERVICE_URL` im Web, `BENEFITSI_BOOKING_BASE_URL` im Admin und `BENEFITSI_BOOKING_WEB_ORIGIN` für die öffentliche Statusseite setzen. In einer veröffentlichten Umgebung HTTPS verwenden. Supabase-Zugriff getrennt und bewusst für diese Umgebung konfigurieren.
3. **Partner vorbereiten:** als Inhaber/Admin unter `/partner/commerce` den Partner wählen oder freischalten, Ressource und Leistung anlegen, Speisekarte ergänzen, Zeitfenster anlegen und das Angebot aktivieren. Pausierte Angebote werden nicht öffentlich buchbar.
4. **Onlinezahlungen im Sandbox-Modus prüfen:** `sk_test_`-Schlüssel, Connect-Plattformkonfiguration und separate Webhook-Secrets hinterlegen; Händler-Onboarding über die Verwaltung durchführen. Alte Händlerkonten mit ungeeignetem Haftungsmodell werden blockiert. Kontobereitschaft und Auszahlungsfähigkeit müssen von Stripe bestätigt sein. Zustandswechsel, doppelte Webhooks, Storno, verspätete Zahlung und vollständige Erstattung im Sandbox-Durchlauf prüfen.
5. **Eigene Softwaregebühr:** optional `BENEFITSI_SOFTWARE_PRICE_ID` auf einen vorhandenen aktiven, monatlichen EUR-Testpreis setzen; ein Portal benötigt zusätzlich eine bestehende Konfiguration. Es wird kein Preis von 99,99 € oder ein anderer Tarif angenommen.
6. **Benachrichtigungen:** Versandkonfiguration und einen authentifizierten Worker-Aufruf einrichten; Details in `admin/docs/commerce-notifications.md`. Ohne eingerichtete Zustellung bleibt die Outbox erhalten. Vor Aktivierung echte Sandbox-/Testzustellung einschließlich Wiederholung testen.
7. **Funktion gezielt freischalten:** `BENEFITSI_COMMERCE_ENABLED=true` auf Admin und Web; für Flutter zusätzlich `--dart-define=BENEFITSI_BOOKING_ENABLED=true` und `--dart-define=BENEFITSI_BOOKING_WEB_ORIGIN=https://<test-web-host>`. Das Demo-Flag bleibt dabei aus.
8. **Abnahme:** Browser- und Mobilgeräteprüfung sowie gemeinsamer Testpartner-Durchlauf. Ein späterer Livebetrieb braucht eine gesonderte, geprüfte Umschaltung; die vorbereitete Zahlungsimplementierung erzwingt aktuell Testmodus.

Die technische Trennung verhindert einen Benefitsi-Sammelgeldtopf. Sie ist keine rechtliche Bestätigung einer Erlaubnisfreiheit; Händlerverträge, Zahlungsdienstleister-Konfiguration und tatsächlicher Geschäftsablauf müssen vor Livebetrieb zusammen geprüft werden.

## Prüfungen

Aktueller Abschlussstand:

| Prüfung | Ergebnis |
| --- | --- |
| Admin: fokussierte Buchungs-, Zahlungs-, Wiederaufnahme- und E-Mail-Tests | 59 bestanden |
| Admin: Servergrenzen und Worker-Autorisierung | 6 bestanden |
| Datenbank: echte lokale PostgreSQL-Tests | 35 bestanden, einschließlich Konkurrenz, E-Mail-Receipts und Online-Vorlauf |
| Admin: Produktionsbuild mit Webpack | Bestanden |
| Web: Verhaltenstests | 19 bestanden, einschließlich Wiederaufnahme, Zahlungsgrenzen und Online-Vorlauf |
| Web: Produktionsbuild, TypeScript und fokussierte ESLint-Prüfung | Bestanden |
| Web: HTTP-Durchläufe auf aktueller lokaler Demo | Alle drei Arten: Katalog, Buchung, Status, Storno; unzulässige Wiederaufnahme lässt Buchung bestehen; unbekannte Aktion, fremde Herkunft und falsches Gast-Token abgewiesen |
| Flutter: fokussierte Tests und Analyse | 4 Tests bestanden, fokussierte Analyse sauber |
| Unabhängige Review | Vier Wiederaufnahmefehler korrigiert und separat geprüft; E-Mail-/Client-Ergänzungen geprüft; zusätzlicher Vorlauffehler durch SQL-/Web-/App-Tests abgesichert |

Admin-Prüfungen aus `admin/`:

```sh
node --import tsx --test tests/booking-contracts.test.mjs tests/booking-security.test.mjs tests/commerce-*.test.mjs tests/stripe-direct.test.mjs tests/stripe-reconciliation.test.mjs tests/software-billing.test.mjs
node --conditions=react-server --import tsx --test tests/server/*.test.mjs
npm run build -- --webpack
```

Die vorhandenen Legacy-Buchungstests benötigen den ursprünglichen Web-Checkout mit ihren alten SQL-Quelldateien; bei Bedarf `BENEFITSI_WEB_ROOT='/Users/patrick/Documents/New project/benefitsi-web'` setzen. Die neue kanonische Commerce-Migration bleibt ausschließlich im Datenbank-Repository. Für Web, Flutter und den isolierten PostgreSQL-Lauf gelten die unten verlinkten Anleitungen.

Der vollständige Admin-Testlauf hat **292 von 293** erfolgreiche Tests. Der eine Fehler (`menu-approval-regression.test.mjs`, erwartetes wörtliches `label="Menu status"`) ist in den unveränderten Dateien des Ausgangscommits isoliert ebenfalls reproduzierbar. Er betrifft die frühere Speisekartenverwaltung und wurde nicht als bestandene Prüfung gezählt. Die fokussierten Tests sind Teil dieses Gesamtlaufs und dürfen nicht doppelt gezählt werden.

Visuelle Browser- und Mobilgeräteprüfung sowie echte Stripe-, E-Mail- und gehostete Datenbanktests stehen noch aus. Der Mac war gesperrt und bot keine steuerbare Browseroberfläche; es werden deshalb keine Screenshots oder visuellen Abnahmetests behauptet.

## Weiterführende Dateien

- `IMPLEMENTATION.md`: Entscheidungen und Fortschritt
- `admin/docs/commerce-payments.md`: Zahlungsfluss, Stripe-Ereignisse und Kontomodell
- `admin/docs/commerce-notifications.md`: Zustellung und Wiederholungen
- `database/docs/COMMERCE_BOOKING_CONTRACT.md`: verbindlicher SQL-/RPC-Vertrag
- `database/tests/commerce/README.md`: lokale, isolierte Datenbankprüfung
- `web/docs/commerce-local-preview.md`: Demo und Frontend-Prüfungen
- `app/docs/booking-web-handoff.md`: native Freischaltung
