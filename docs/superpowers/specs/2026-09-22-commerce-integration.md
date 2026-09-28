# Benefitsi Buchungen – lokale Umsetzung

## Auftrag und Grenzen

Freigegebener Auftrag vom 22.09.2026: Essensbestellungen zur Abholung, Tischreservierungen und Dienstleistungstermine vollständig lokal vorbereiten, in bestehende App/Web/Partnerverwaltung integrieren. Nicht pushen, deployen oder Produktionsdaten verändern. Keine echten Händlerkonten oder Zahlungen erzeugen.

## Architektur

Eine responsive Buchungsoberfläche unter `/buchen/{partnerId}` dient Website und Flutter-App. Das bestehende Partnerkonto und die Tabelle `booking_providers` bleiben die Zuordnung. Ein additives `commerce_*`-Modul kapselt die drei Abläufe, ohne die bestehenden Event-RPCs umzudeuten. Preise und Kapazitäten werden ausschließlich in einer Datenbanktransaktion geprüft. Explizite Slots pro Ressource, keine unkontrollierte Kalender-Synchronisation. Tische und Mitarbeiter exklusiv; Küchenfenster begrenzen Bestellanzahl.

Zahlungen erfolgen als Stripe Direct Charges auf einem Händlerkonto mit vollem Stripe-Dashboard und Stripe als Gebühren-/Verlustverantwortlichem. Benefitsi erhebt keine Application Fee; die Softwaregebühr wird separat vereinbart/abgerechnet. Offlinezahlung ist ein eigener Zustand, keine vorgetäuschte Onlinezahlung. Testmodus bleibt technisch erzwungen. Altbestände mit Plattformhaftung werden nicht stillschweigend wiederverwendet.

## Benutzerabläufe

- Abholung: Gerichte/Extras, Menge, verfügbares Abholfenster, Kontakt, vor Ort oder online bezahlen, verbindlicher Status nach Annahme.
- Tisch: passender Tisch und Zeitfenster, Gästezahl, Kontaktdaten, Reservierung und Storno.
- Termin: Leistung, Mitarbeiter und Zeitfenster; Dauer und Puffer gegen Ressourcenüberschneidung absichern.
- Partner: Leistungen, Speisekarte/Extras, Ressourcen und Zeitfenster zentral verwalten; Buchungen annehmen, abholbereit/fertig markieren, stornieren, Vor-Ort-Zahlung bestätigen.
- Bestätigung/Status: echte serverseitige Zustände; zufälliges Geheimnis schützt Gastzugriff. Änderungen erzeugen eine Benachrichtigungs-Outbox; Zustellung wird gesondert konfiguriert, nicht als erfolgt behauptet.

## Integrationsvertrag

`GET /api/commerce/catalog?partnerId=UUID` liefert `{provider,offerings}`. Angebote verwenden `kind=food_pickup|table|appointment`, `payment_modes=pay_on_site|online`; Slots enthalten `id,resource_id,starts_at,ends_at,capacity,remaining`; Speisekarte enthält Artikel und Extras mit Integer-Centpreisen.

`POST /api/commerce/bookings`: `{partner_id,offering_id,slot_id,quantity,items:[{menu_item_id,quantity,extra_ids}],customer:{name,email,phone,notes},payment_method,idempotency_key}`. Antwort `{ok,replayed,booking,checkout_url?}`. Browser sendet keine autoritativen Preise. `booking` enthält `public_reference` und `public_token`; Status und Gaststorno benötigen beide.

`GET/POST /api/commerce/status` liest/storniert mit Referenz und Token. Öffentliche Website proxyt mit serverseitigem Shared Secret zum Admin-Service. Payloadgröße, Herkunft, Eingaben, zeitliche Gültigkeit, Replay-Fingerabdruck und Mandantenzuordnung werden geprüft.

## Prüfung

Verhaltenstests vor Implementierung; echte isolierte PostgreSQL-Tests einschließlich konkurrierender Buchungen, falscher Preise, Replay-Konflikte, überlappender Ressourcen und verspäteter Zahlung. Stripe-Grenzen mit SDK-Testdouble auf Kontozuordnung, Null-Provision und Webhook-Account prüfen. Web TypeScript/Build und lokale Browserprüfung; Flutter fokussierte Tests/Analyse. Keine Produktionskonfiguration kopieren oder aktivieren.

## Arbeitsstände

Vier isolierte Worktrees in diesem Verzeichnis: `admin`, `web`, `app`, `database`, jeweils Branch `codex/booking-integration-20260922`. Vorhandene uncommittete Änderungen bleiben in den Ursprungsrepositories.

## Plan und Fortschritt

- [x] Ausgangsbestand, Sicherheitsgrenzen und Schnittstellen geprüft; 17 bestehende Buchungstests bestehen.
- [ ] Datenbank: additives Schema, atomare RPCs, Outbox, reale PostgreSQL-Verhaltenstests.
- [ ] Zahlungen: direkte Händlerzahlung, Händlerkonfiguration, Webhook-/Refund-Zuordnung, Tests.
- [ ] Server/Partner: Eingabevalidierung, geschützte APIs, zentrale Verwaltung und Konfiguration.
- [ ] Kunde/App: gemeinsame Oberfläche, sicherer App-Einstieg, lokale Demo und Tests.
- [ ] Integration: Builds/Analyse, Browserprüfung, unabhängige Review, Korrekturen.
- [ ] Handoff: Konfigurationsbeispiel, Migrationsreihenfolge, lokale Startbefehle und verbleibende Freischaltungsschritte.

## Entscheidungen

- Neue Module bleiben ohne Featureflag deaktiviert. Demonstrationsdaten ausschließlich lokal und sichtbar gekennzeichnet.
- SQL-Datei wird ausschließlich vorbereitet; keine Remote-Migration. Die Supabase CLI ist nicht installiert; SQL wird mit lokalem PostgreSQL geprüft.
- Keine automatische Abrechnung erfundener Benefitsi-Tarife. Technischer Kundenzahlungsfluss und eigene Softwareerlöse bleiben getrennt.
- Unabhängige Arbeitsbereiche: Datenbank, Stripe, Web/App; Root koordiniert Server/Partner-UI und Integration.
