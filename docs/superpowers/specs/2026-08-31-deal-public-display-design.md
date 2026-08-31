# Deal-Top-Vorteil und öffentliche Darstellung – Design

**Datum:** 2026-08-31  
**Status:** Entwurf zur Prüfung  
**Betroffene Repositories:**

- `Benefitsi/Benefitsi-Master-Admin-Panel` (Admin-Panel und öffentliche Microsite)
- `Benefitsi/Benefitsi-Database` (Supabase-Schema und App-View)
- `Benefitsi/Benefitsi-App-publish` (Flutter-App)

## Ziel

Administratoren sollen pro Partner genau einen Deal als „Top-Vorteil“ markieren und den öffentlichen Titel sowie die öffentliche Unterzeile selbst festlegen können. App und öffentliche Microsite verwenden diese Auswahl gemeinsam. Die Nutzer-Detailansicht zeigt ausschließlich kundenrelevante Informationen und keine Zielgruppe, technische Deal-Metadaten, Anwendungslogik oder Mitarbeiterhinweise.

## Aktuelle Ursache

1. `deals` besitzt kein explizites Top-Deal-Feld. Die Flutter-App sortiert Deals anhand von Auswahlstatus, Kategorie, Typ und Priorität; die erste Karte erhält anschließend das Top-Badge. Die Microsite behandelt aktuell jeden `two_for_one`-Deal als Top-Deal.
2. Die Tabelle besitzt keinen öffentlichen Titel oder Untertitel. Die App erzeugt deshalb „2 für 1“ und „Zwei bekommen, eins bezahlen“ aus `type`, `discount_type` und `reward_item`.
3. Die Flutter-Detailansicht `_partnerDealInfoLines` listet technische Felder (`Deal-Typ`, `Vorteil`, `Anwendung`, `Zielgruppe`) und generierte Betriebs-/Stempelhinweise gemeinsam mit den kundenrelevanten Angaben auf.

## Datenmodell

Die Tabelle `public.deals` erhält drei nullable/boolean Felder:

| Feld | Typ | Semantik |
| --- | --- | --- |
| `is_top_benefit` | `boolean not null default false` | Genau ein ausgewählter Top-Vorteil je Partner; wird in App und Microsite priorisiert. |
| `display_title` | `text` | Optionaler öffentlicher Titel, z. B. „2 für 1 Döner“. Null/leer verwendet den bestehenden typbasierten Fallback. |
| `display_subtitle` | `text` | Optionaler öffentlicher Untertitel. Null bedeutet automatische Unterzeile; leerer Text bedeutet bewusst keine Unterzeile. |

Die Migration ergänzt außerdem die Spalten der `deals_app_view`. `staff_instructions` wird aus der öffentlichen App-View entfernt; technische Metadaten bleiben nur in der für Eligibility und Laufzeitlogik benötigten, bereits bestehenden Form verfügbar. Die Server-/RPC-Flows für Partner-Scanner und Redemption behalten ihre internen Hinweise.

Die Admin-Aktion validiert, dass ein markierter Deal zum Partner gehört. Beim Speichern eines markierten Deals werden die übrigen Deals desselben Partners entmarkiert und anschließend der ausgewählte Deal markiert. Beim Abwählen bleibt kein Top-Vorteil gesetzt. Die vorhandene Reihenfolge-/Prioritätslogik für Deal Drops bleibt unverändert.

Für Bestandsdaten wird kein destruktiver Backfill benötigt. Wenn kein aktiver Deal `is_top_benefit = true` besitzt, verwendet die Darstellung als Übergangs-Fallback den bisherigen aktiven `two_for_one`-Deal. Ein explizit markierter, aber deaktivierter/abgelaufener Top-Deal wird nicht angezeigt; in diesem Fall greift ebenfalls der aktive Legacy-Fallback, bis der markierte Deal wieder verfügbar ist.

## Admin-Panel

Im bestehenden Deal-Editor kommt unterhalb der Grundlagen ein Bereich **„Öffentliche Darstellung“** hinzu:

- Checkbox **„Als Top-Vorteil anzeigen“**
- Textfeld **„Anzeigetitel“** mit Beispiel `2 für 1 Döner`
- Textfeld **„Anzeigebeschreibung / Unterzeile“**
- Option **„Automatische Unterzeile verwenden“**, die bei Aktivierung `display_subtitle = null` speichert. Bei deaktivierter Option kann ein leerer Wert gespeichert werden, um die Unterzeile auszublenden.
- Kleine Vorschau mit exakt den Werten, die App und Microsite verwenden.

Die Deal-Karten zeigen einen sichtbaren „Top-Vorteil“-Badge. Das neue Feld wird in Create-, Edit- und Draft-/Fehlerzuständen erhalten. `customer_description` bleibt der längere kundenöffentliche Beschreibungstext und wird im Admin als solcher bezeichnet; `staff_instructions` bleibt ausdrücklich intern.

## Öffentliche Darstellung

### Flutter-App

- `PartnerDetailDeal` liest `is_top_benefit`, `display_title` und `display_subtitle`.
- `formatPartnerDetailDeal` verwendet `display_title`, wenn gesetzt; andernfalls bleibt der bisherige Fallback erhalten.
- Für `subtitle` gilt: expliziter Text anzeigen, leerer Text ausblenden, `null` typbasiert erzeugen.
- Der Sortierer priorisiert einen explizit markierten Top-Vorteil innerhalb der normalen auswählbaren Deals. Der aktive Nutzer-Deal darf weiterhin temporär vorangestellt werden; das Top-Badge richtet sich dennoch nach der expliziten Markierung.
- `formatRedeemedDealTitle` verwendet denselben öffentlichen Titel-Fallback, damit Auswahl-/Redemption-Bestätigungen konsistent bleiben.

### Öffentliche Microsite

- Die Public-Deal-Spalten und `Deal`-Typen führen die drei neuen Felder.
- Ein Resolver bestimmt pro Partner die explizite Top-ID und fällt bei fehlender aktiver Auswahl auf den bisherigen aktiven `two_for_one`-Deal zurück.
- Banner-Titel und Beschreibung verwenden `display_title`/`display_subtitle`, sofern vorhanden. Leere Untertitel erzeugen keinen typbasierten Satz.
- Die bestehende Microsite-Textkonfiguration (`deals.topDealLabel`, Button usw.) bleibt unverändert und steuert weiterhin die redaktionellen Labels des Banners.

## Detailansicht in der App

„Details ansehen“ wird auf kundenrelevante Angaben reduziert:

- öffentlicher Anzeigetitel bzw. Benefittext
- öffentliche Beschreibung
- öffentliche Bedingungen (`terms`), sofern vorhanden
- verständlicher Zeitraum bzw. Ablaufdatum, sofern für den Deal relevant
- ggf. nutzerrelevante Einlösebegrenzung in Alltagssprache

Nicht mehr in dieser Nutzeransicht erscheinen:

- Zielgruppe/Audience
- interner Deal-Typ
- technische Benefit-Kategorie und Anwendung („direct selectable“, „automatic fallback“ usw.)
- Mitarbeiterhinweise
- interne Stempel-/Betriebsnotices und technische Metadaten

Eligibility bleibt funktional erhalten: Premium-Sperren, Ablauf und Auswahlstatus werden weiterhin auf der Deal-Karte als verständlicher Status bzw. Button erklärt, aber nicht als technische Detailzeilen wiederholt.

## Datenfluss und Sicherheit

1. Admin-Formular sendet die drei neuen Werte an `saveDeal`.
2. `parseDealPayload` validiert Längen, Normalisierung und die Top-Auswahl; die bestehende Copy-Erhaltung für abgelehnte Saves wird erweitert.
3. Die Datenbankmigration erweitert Tabelle und App-View. Die Public-Microsite-Abfrage nimmt nur die für Nutzer erforderlichen Felder auf und setzt `staff_instructions` beim Sanitizing weiterhin auf `null`.
4. Flutter und Microsite verwenden dieselben Fallback-Regeln, damit ein nicht gepflegter Alt-Deal unverändert funktioniert.

## Fehlerfälle

- Mehr als ein Top-Deal wird serverseitig verhindert bzw. atomar bereinigt.
- Wird der markierte Top-Deal deaktiviert oder läuft er ab, bleibt die Markierung gespeichert, erscheint aber nicht als aktiver Top-Vorteil; der Resolver fällt bis zur Reaktivierung auf den aktiven Legacy-Deal zurück.
- Zu lange Titel/Untertitel werden wie die übrigen Deal-Texte mit den bestehenden Admin-Limits abgewiesen und der Formular-Draft bleibt erhalten.
- Leerer `display_subtitle`-Text wird nicht mit dem typbasierten „Zwei bekommen, eins bezahlen“-Text überschrieben.

## Tests und Abnahmekriterien

### Admin-/TypeScript-Tests

- Payload-Parsing liest die neuen Felder korrekt und bewahrt sie bei Validierungsfehlern.
- Top-Auswahl entmarkiert zuvor markierte Deals desselben Partners.
- Null/leer beim Titel und Null/leer/benutzerdefiniert beim Untertitel folgen den definierten Fallback-Regeln.
- Deal-Editor zeigt Top-Schalter, Titel, Untertitel und Vorschau.

### Flutter-Tests

- Öffentlicher Titel überschreibt die generierte „2 für 1“-Überschrift.
- Benutzerdefinierter Untertitel überschreibt „Zwei bekommen, eins bezahlen“; leerer Untertitel blendet ihn aus; null behält den Fallback.
- Expliziter Top-Vorteil wird unabhängig vom Deal-Typ zuerst sortiert und erhält das Top-Badge.
- Detail-Sheet enthält keine Zielgruppe, technischen Typ-/Kategoriezeilen oder Mitarbeiterhinweise und enthält weiterhin Beschreibung/Bedingungen.

### Microsite-/Datenbank-Tests

- Public-Deal-Query liefert die drei neuen Felder.
- Expliziter Top-Deal gewinnt gegen den Legacy-2-für-1-Fallback.
- Public-Sanitizing entfernt weiterhin `staff_instructions` und interne Metadaten aus der Microsite-Antwort.

Die Abnahme gilt als erfüllt, wenn die bestehenden Tests plus die neuen Regressionstests, Lint/Analyse und Produktions-Build in den jeweils betroffenen Repositories erfolgreich laufen und ein manueller Smoke-Test in Admin, Microsite und App die drei Beispiele bestätigt: „2 für 1 Döner“, Unterzeile entfernen und technikfreie Detailansicht.
