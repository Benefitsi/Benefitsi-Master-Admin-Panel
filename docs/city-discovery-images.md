# Startseitenbilder für die Entdecken-Themen

Stand: 17.09.2026. Die Stadtverwaltung bietet unter `/city-pages/[citySlug]/discovery` eine Bildauswahl für Burgen & Aussicht, Wandern, Familie, Kultur, Essen & Trinken und Bei Regen. Der Einstieg heißt **Startseitenbilder**.

## Bedienung

1. Themenkarte öffnen und ein freigegebenes Stadtbild oder ein freigegebenes gemeinsames Bild wählen.
2. In der Vorschau im Format 2:1 den horizontalen oder vertikalen Ausschnitt anpassen.
3. **Bild speichern** übernimmt diese Auswahl auf die Startseite.
4. **Automatische Auswahl verwenden** entfernt ausschließlich diese Themenzuordnung. Bilddatei, Ortsbilder und andere Zuordnungen bleiben erhalten.

Noch nicht freigegebene Medien erscheinen nicht in der Auswahl. Upload und Rechtefreigabe sind nicht Bestandteil dieses Editors. Bei einem zurückgezogenen Bild verwendet das öffentliche Portal wieder seine automatische Auswahl.

## Gemeinsamer Datenvertrag

Die bestehende Tabelle `city_media_assignments` genügt; keine Migration ist erforderlich.

- `city_id`: ID der verwalteten Stadt
- `entity_type = CITY_HOMEPAGE`, `entity_id = null`, `role = CARD`
- `entity_key`: `discovery:viewpoints`, `discovery:hiking`, `discovery:family`, `discovery:culture`, `discovery:food`, `discovery:rain`
- `manual_lock = true`, `is_primary = true`; `focal_x/y` jeweils 0 bis 1
- Alle späteren Importe müssen diese manuell gesperrten Zuordnungen erhalten.

Der Server prüft die Admin-Sitzung vor privilegierten Zugriffen, erlaubt ausschließlich veröffentlichte Bilder aus derselben Stadt oder dem gemeinsamen Katalog und prüft die URL-Freigabe. Änderungen und Zurücksetzen vergleichen ID und exakten `updated_at`-Stand. Die vorhandene partielle Eindeutigkeit verhindert konkurrierende Erstzuordnungen. Ein Konflikt fordert zum Neuladen auf.

Erfolgreiche Änderungen erhalten einen `city_media_audit`-Eintrag und rufen die bestehende öffentliche Cache-Aktualisierung mit Stadt-Slug **und** Stadt-ID auf. Fehlende Cache-Konfiguration oder ein fehlgeschlagener Audit-Eintrag werden als Warnung bei bereits gespeicherter Auswahl ausgewiesen. Die Bildzuordnung und der Audit-Eintrag sind separate API-Aufrufe, keine gemeinsame Transaktion.

## Prüfung

- 12 gezielte Tests für Validierung, Admin-Grenze, Stadtbindung, Speichern, Versionskonflikte, Zurücksetzen und Cache-Fehler.
- Staging-Transaktion: Zuweisung, Unique-Constraint, versioniertes Update, Ablehnung eines veralteten Updates, Löschen der Zuordnung und Audit geprüft; vollständig zurückgerollt.
- Echter Admin-Lesezugriff auf Annweiler und 30 freigegebene Bilder geprüft. Keine produktive Bildauswahl als Test gespeichert.
- Vorschau, Filter, Ausschnitt, Escape und Fokus-Rückgabe auf Desktop sowie 390/320 px geprüft. Temporäre UI-Testseite vor dem Release entfernt.

Die Website muss den gleichnamigen Vertrag aus `Benefitsi/benefitsi-web` verwenden, bevor neue Zuordnungen auf der Startseite sichtbar werden.
