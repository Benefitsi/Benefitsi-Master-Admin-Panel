# Deal-Top-Vorteil und öffentliche Darstellung – Design

**Datum:** 2026-08-31  
**Status:** Entwurf zur Prüfung  
**Betroffene Repositories:**

- `Benefitsi/Benefitsi-Master-Admin-Panel` (Admin-Panel und öffentliche Microsite)
- `Benefitsi/Benefitsi-Database` (Supabase-Schema und App-View)
- `Benefitsi/Benefitsi-App-publish` (Flutter-App)

## Ziel

Administratoren sollen den öffentlichen Titel sowie die öffentliche Unterzeile eines Deals selbst festlegen können. Deals bleiben gleichwertig; ein Top-Vorteil-Badge oder eine Top-Auswahl wird nicht verwendet. Die Nutzer-Detailansicht zeigt ausschließlich kundenrelevante Informationen und keine Zielgruppe, technische Deal-Metadaten, Anwendungslogik oder Mitarbeiterhinweise.

## Aktuelle Ursache

1. Die Tabelle besitzt keinen öffentlichen Titel oder Untertitel. Die App erzeugt deshalb „2 für 1“ und „Zwei bekommen, eins bezahlen“ aus `type`, `discount_type` und `reward_item`.
2. Die Flutter-Detailansicht `_partnerDealInfoLines` listet technische Felder (`Deal-Typ`, `Vorteil`, `Anwendung`, `Zielgruppe`) und generierte Betriebs-/Stempelhinweise gemeinsam mit den kundenrelevanten Angaben auf.

## Datenmodell

Die Tabelle `public.deals` erhält zwei nullable Felder:

| Feld | Typ | Semantik |
| --- | --- | --- |
| `display_title` | `text` | Optionaler öffentlicher Titel, z. B. „2 für 1 Döner“. Null/leer verwendet den bestehenden typbasierten Fallback; bei alten 2-für-1-Deals wird der Artikelname ergänzt. |
| `display_subtitle` | `text` | Optionaler öffentlicher Untertitel. Null bedeutet automatische Unterzeile; leerer Text bedeutet bewusst keine Unterzeile. |

Die Migration ergänzt außerdem die Spalten der `deals_app_view`. Die bestehende View-Reihenfolge bleibt für ältere Scanner-/Redemption-Flows kompatibel; `staff_instructions` wird deshalb technisch weiterhin geliefert, aber nie in der kundenöffentlichen Detailansicht gerendert. Die Public-Microsite sanitisiert interne Hinweise weiterhin zu `null`.

Die vorhandene Reihenfolge-/Prioritätslogik für Deal Drops bleibt unverändert. Deals werden in der App und Microsite weiterhin nach den bestehenden Eligibility-/Typregeln dargestellt, aber kein Deal erhält ein Top-Vorteil-Badge.

## Admin-Panel

Im bestehenden Deal-Editor kommt unterhalb der Grundlagen ein Bereich **„Öffentliche Darstellung“** hinzu:

- Textfeld **„Anzeigetitel“** mit Beispiel `2 für 1 Döner`
- Textfeld **„Anzeigebeschreibung / Unterzeile“**
- Option **„Automatische Unterzeile verwenden“**, die bei Aktivierung `display_subtitle = null` speichert. Bei deaktivierter Option kann ein leerer Wert gespeichert werden, um die Unterzeile auszublenden.
- Kleine Vorschau mit exakt den Werten, die App und Microsite verwenden.

Die Deal-Karten zeigen keinen Top-Vorteil-Badge. Die neuen Felder werden in Create-, Edit- und Draft-/Fehlerzuständen erhalten. `customer_description` bleibt der längere kundenöffentliche Beschreibungstext und wird im Admin als solcher bezeichnet; `staff_instructions` bleibt ausdrücklich intern.

## Öffentliche Darstellung

### Flutter-App

- `PartnerDetailDeal` liest `display_title` und `display_subtitle`.
- `formatPartnerDetailDeal` verwendet `display_title`, wenn gesetzt; andernfalls bleibt der bisherige Fallback erhalten.
- Für `subtitle` gilt: expliziter Text anzeigen, leerer Text ausblenden, `null` typbasiert erzeugen.
- `formatRedeemedDealTitle` verwendet denselben öffentlichen Titel-Fallback, damit Auswahl-/Redemption-Bestätigungen konsistent bleiben.

### Öffentliche Microsite

- Die Public-Deal-Spalten und `Deal`-Typen führen die drei neuen Felder.
- Banner-Titel und Beschreibung verwenden `display_title`/`display_subtitle`, sofern vorhanden. Leere Untertitel erzeugen keinen typbasierten Satz.
- Die bestehende Microsite-Textkonfiguration (Bild, Button und Layout) bleibt für Legacy-Microsites kompatibel; im Banner wird kein „Top-Vorteil“-Badge mehr ausgegeben.

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
2. `parseDealPayload` validiert Längen und Normalisierung; die bestehende Copy-Erhaltung für abgelehnte Saves wird um die neuen öffentlichen Felder ergänzt.
3. Die Datenbankmigration erweitert Tabelle und App-View. Die Public-Microsite-Abfrage nimmt nur die für Nutzer erforderlichen Felder auf und setzt `staff_instructions` beim Sanitizing weiterhin auf `null`.
4. Flutter, Microsite und Admin verwenden dieselben Null-/Leer-/Override-Semantiken. Die etablierte Fallback-Formulierung bleibt für ältere Deal-Typen stabil; der 2-für-1-Artikelname wird in allen drei Oberflächen einheitlich ergänzt.

## Fehlerfälle

- Zu lange Titel/Untertitel werden wie die übrigen Deal-Texte mit den bestehenden Admin-Limits abgewiesen und der Formular-Draft bleibt erhalten.
- Leerer `display_subtitle`-Text wird nicht mit dem typbasierten „Zwei bekommen, eins bezahlen“-Text überschrieben.

## Tests und Abnahmekriterien

### Admin-/TypeScript-Tests

- Payload-Parsing liest die neuen Felder korrekt und bewahrt sie bei Validierungsfehlern.
- Null/leer beim Titel und Null/leer/benutzerdefiniert beim Untertitel folgen den definierten Fallback-Regeln.
- Deal-Editor zeigt Titel, Untertitel und Vorschau und enthält keinen Top-Vorteil-Schalter oder -Badge.

### Flutter-Tests

- Öffentlicher Titel überschreibt die generierte „2 für 1“-Überschrift.
- Benutzerdefinierter Untertitel überschreibt „Zwei bekommen, eins bezahlen“; leerer Untertitel blendet ihn aus; null behält den Fallback.
- Deal-Sheet enthält keinen Top-Vorteil-Badge, keine Zielgruppe, technischen Typ-/Kategoriezeilen oder Mitarbeiterhinweise und enthält weiterhin Beschreibung/Bedingungen.

### Microsite-/Datenbank-Tests

- Public-Deal-Query liefert die beiden neuen Felder.
- Public-Sanitizing entfernt weiterhin `staff_instructions` und interne Metadaten aus der Microsite-Antwort.

Die Abnahme gilt als erfüllt, wenn die bestehenden Tests plus die neuen Regressionstests, Lint/Analyse und Produktions-Build in den jeweils betroffenen Repositories erfolgreich laufen und ein manueller Smoke-Test in Admin, Microsite und App die drei Beispiele bestätigt: „2 für 1 Döner“, Unterzeile entfernen und technikfreie Detailansicht.
