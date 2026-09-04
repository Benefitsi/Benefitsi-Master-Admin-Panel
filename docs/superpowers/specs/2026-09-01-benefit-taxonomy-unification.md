# Benefitsi Benefit-Taxonomie — verbindlicher Stand

## Ziel

App, Partner-Dashboard/Admin, Microsites, Partnerseiten, Städte-Seiten,
Backend-Public-Resolver und Notion verwenden dieselbe fachliche Taxonomie und
dieselben deutschen öffentlichen Begriffe. Technische Legacy-Werte bleiben
während der Migration lesbar, werden aber nicht mehr direkt als UI-Label
verwendet.

## Verbindliche Ebenen

1. `reward_format`: `two_for_one`, `discount`, `free_item`, `bonus_stamp`
2. `trigger`: `welcome`, `time_bonus`, `comeback`, `birthday`, `streak`, `challenge`
3. `campaign_type`: `happy_hour`, `deal_drop`
4. `activation_mode`: `direct_selectable`, `automatic_background`, `automatic_fallback`
5. `audience`: `free`, `premium`, `both`
6. `public_title` und `public_subtitle`: konkrete, partnerbezogene Darstellung

`stempel_card`, `stamp_reward`, `badges` und `levels` bleiben eigenständige
Module und werden nicht als Deals behandelt.

## Öffentliche deutsche Begriffe

- Oberbegriff: `Vorteil`
- Belohnungsformate: `2 für 1`, `Rabatt`, `Gratisartikel`, `Bonusstempel`
- Auslöser: `Willkommen`, `Zeitbonus`, `Comeback`, `Geburtstag`, `Streak`, `Challenge`
- Kampagnen: `Happy Hour`, `Deal Drop`
- Loyalty: `Stempelkarte`, `Stempelbelohnung`
- Automatischer Fallback: `Dauerrabatt`

Ein direkter Erstbesuchs-Vorteil heißt `Willkommensdeal`; ein automatischer
Zusatzstempel heißt `Willkommensbonus`. Ein direkter Rückgewinnungs-Vorteil
heißt `Comeback-Deal`; ein automatischer Bonus heißt `Comeback-Bonus`.
`Happy Hour` und `Deal Drop` beschreiben Kampagne/Verfügbarkeit; der sichtbare
Titel muss trotzdem die konkrete Belohnung nennen.

## Titelregeln

- 2-für-1-Titel: `2 für 1 <reward_item>`; ohne Artikel nur `2 für 1`.
- Rabatt-Titel: `<amount> % Rabatt` oder `<amount> € Rabatt`.
- Gratisartikel: `Gratis <Artikel>`.
- Bonusstempel: `+<count> Bonusstempel`.
- Es gibt keinen globalen oder impliziten Artikel `Döner`.
- `Top Deal`, `Top-Vorteil` und `Hauptdeal` sind keine öffentlichen Labels.
  Eine optionale interne Priorität darf als `hervorgehobener Vorteil` geführt
  werden; der öffentliche Titel bleibt konkret.

## Abwärtskompatibilität

Die bestehenden Datenbankwerte (`two_for_one`, `welcome`, `comeback`,
`happy_hour`, `permanent_discount`, `limited_drop`, `birthday`, `free_item`,
`discount`, `bonus_stamp`, `streak`, `challenge`) werden nicht in einer
unkontrollierten Datenmigration umbenannt. Alle Oberflächen verwenden zunächst
einen zentralen Resolver und können alte Zeilen lesen. Neue und bearbeitete
Zeilen speichern zusätzlich die getrennten Dimensionen und den öffentlichen
Titel, sofern das jeweilige Backend diese Felder bereits unterstützt.

## Entfernte sichtbare Altbegriffe

`Daily Deal`, `Hauptdeal`, `Top-Vorteil`, `2-für-1-Deal`, `Rabattvorteil`,
`Dauervorteil`, `Automatischer Basisrabatt`, `Bonus-Stempel`, `Streak Bonus`,
`Welcome reward`, `Time-based bonus`, `Selectable discount` und ähnliche
englische Admin-Bezeichnungen dürfen in deutscher Nutzer- oder Partneransicht
nicht mehr als sichtbare Begriffe erscheinen. Sie bleiben höchstens als
technische Übersetzungs-/Migrationsschlüssel dokumentiert.

## Akzeptanzkriterien

- Derselbe Deal-Datensatz rendert auf App, Microsite, Partnerseite und
  Städte-Seite denselben konkreten Titel.
- Keine öffentliche Oberfläche rendert `Top Deal`, `Top-Vorteil`, `Hauptdeal`,
  `Daily Deal` oder einen erfundenen Standardartikel.
- Automatische Boni werden nicht als aktivierbare Deals beschrieben.
- Deutsche Admin-Ansichten zeigen keine englischen Deal-Optionen.
- Legacy-Enum-Werte bleiben lesbar und bestehende Einlösungslogik bleibt
  unverändert.
- Tests prüfen alle vier Reward-Formate, die Trigger-Splits und die
  Altbegriffs-Sperrliste.
