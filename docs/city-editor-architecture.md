# City Editor – Architektur und Betriebsmodell

Stand: 14.08.2026 · P1 Welle 2B.1

## Zweck

Der City Editor im Master Admin unter `admin.benefitsi.de` ist die sichere
Redaktionsoberfläche für die bestehende City-Plattform. Er ist kein freier
Page Builder, kein zweites CMS und speichert keine parallelen JSON-Inhalte für
Places, Events, Routen, Guides oder Partner.

Annweiler bleibt die Referenz-City und `PRELAUNCH`. In dieser Welle wird kein
City-Status auf `PUBLIC` gesetzt.

## Testzählung

Die frühere Zahl `152/152` und die spätere Zahl `111/111` stammen aus
unterschiedlichen Testprojekten bzw. Testständen. Die 111 waren die damalige
Admin-Suite; die City-Suite wurde separat gezählt und später umbenannt bzw.
weiterentwickelt. Es wurden keine Tests entfernt, um eine grüne Zahl zu
erhalten.

| Testprojekt | Testdateien | Aktueller Umfang | Ergebnis |
| --- | ---: | ---: | ---: |
| Master Admin | 24 | 118 | 118/118 |
| City Web | 35 | 161 | 161/161 |
| Gesamt | 59 | 279 | 279/279 |

Die authentifizierte Browser-Abnahme ist davon getrennt. Ohne eine eingeloggte
Admin-Session wird sie nicht als bestanden behauptet.

## Source of Truth

| Bereich | Source of truth | Editorstatus |
| --- | --- | --- |
| Stadtprofil / Homepage | `public.cities` plus additive `city_page_configs`-Overrides | editierbar |
| Places | `public.city_places` | editierbar, Review-Gate |
| Events + Serien | `public.city_events` + `public.city_event_schedules` | editierbar, Review-Gate |
| Routes | `public.city_routes` | editierbar, Review-Gate |
| Guides | `public.city_guides` | editierbar, Review-Gate |
| Playgrounds, Clubs, Challenges, Benefits | bestehende City-Tabellen | bestehende Module |
| Business / Partner | bestehende Partnerverwaltung und `partners` | verlinkt, nicht dupliziert |
| Media | City Media Library (`city_media_assets` / `city_media_assignments`) | zentrale Auswahl |
| Editorial Articles | bestehender Editorial-Bereich (`editorial_posts`) | verlinkt, nicht dupliziert |
| Collections / Hubs / Navigation | `city_page_configs` mit Code-Config-Fallback | strukturierter Surface Editor |
| Community / Stamps | bestehende Community-/Stamp-Module | bestehende Module |

Die additive Tabelle `public.city_page_configs` kennt die Scopes
`HOMEPAGE`, `HUB`, `COLLECTION` und `NAVIGATION`. Nur `ACTIVE`-Zeilen werden
öffentlich gelesen. DRAFT- und ARCHIVED-Werte bleiben privat. Wenn keine
aktive Zeile existiert, verwendet das City Web die bestehende kompatible
Konfiguration. Ein gespeicherter aktiver Wert überschreibt den Fallback und
wird nicht von ihm zurückgesetzt.

## City-Surfaces im Admin

Unter `/city-pages/[citySlug]/site/[surface]` stehen die strukturierten
Oberflächen bereit:

- Homepage: Hero-Titel, Beschreibung, Media-Referenz, Haupt-CTA, Featured-
  Auswahl und unterstützte Sichtbarkeit.
- Hubs: alle sechs City-Hub-Schlüssel (`current`, `discovery`,
  `events-community`, `routes-guides`, `city-service`, `benefits`) mit Titel,
  Intro, Hero-Alternativtext, CTA, sicheren Zielen, Featured-Referenzen und
  Sichtbarkeit.
- Collections: Titel, Subtitle, Beschreibung, SEO-Felder, Hero-Alttext,
  Featured-Entities und Reihenfolge, Related Collections, Guide-Relationen,
  erlaubte Filter sowie Index-Policy.
- Navigation: eine gemeinsame Datenquelle für Desktop und Mobile mit Label,
  Sichtbarkeit, Reihenfolge und validiertem Target.

Freies HTML, React, JavaScript und unbekannte Section Types sind nicht
zulässig. Targets werden nicht als beliebige URL gespeichert, sondern gegen
City-Hubs, Collections, Utility-Ziele und öffentliche City-Entities geprüft.
Draft-, unpublished- und Legacy-Ziele werden serverseitig abgelehnt.

Die Media Library bleibt der einzige Media-Picker. Der Surface Editor zeigt
die vorhandenen Zuordnungen und verlinkt für die Auswahl direkt in die
Media Library; es gibt keine parallele Bildquelle.

## Field Modes und manuelle Priorität

`city_content_field_controls` speichert den Pflegezustand, nicht den
öffentlichen Wert:

- `AUTO`: Automationen dürfen das Feld pflegen.
- `MANUAL`: der letzte Admin-Wert bleibt erhalten.
- `LOCKED`: Änderungen und automatisches Überschreiben sind gesperrt.

Die Entscheidung wird serverseitig geprüft. Ein manueller Save erzeugt einen
Audit-Eintrag; ein Wechsel zurück auf `AUTO` benötigt die Bestätigung im
Formular. Agenten dürfen `MANUAL` oder `LOCKED` nicht direkt überschreiben.

## Restore und Audit

Für Content-Entities und Page-Surfaces zeigt die Admin-Oberfläche die letzten
Änderungen mit vorherigem Wert, Zeitpunkt und Editor. `Restore` schreibt den
vorherigen Wert zurück und erzeugt einen neuen `RESTORE`-Audit-Eintrag; die
Historie wird nicht gelöscht. Schedule-Felder sind vom generischen Content-
Restore ausgeschlossen.

## Business, Editorial und Admin-Erlebnis

Der City Overview verlinkt Businesses zur bestehenden Partner-/Microsite-
Verwaltung sowie zur öffentlichen City-Darstellung. Editorial-Inhalte werden
über den bestehenden Editorial Editor geöffnet und mit Status sowie Public
Preview verknüpft. Es werden keine Business- oder Artikel-Duplikate erzeugt.

Der Overview zeigt die Arbeitsbereiche CONTENT, SITE und OPERATIONS und den
geschützten Status `ANNWEILER · PRELAUNCH`. Der Public-Wechsel bleibt eine
separate, berechtigte Freigabe und ist in dieser Welle nicht Teil des Editors.

## Section Visibility und P2

Die vorhandenen Template-Blöcke können über erlaubte Schlüssel ein- und
ausgeblendet werden, soweit die jeweilige bestehende Oberfläche dies bereits
unterstützt. Eine freie Blockkomposition wird bewusst nicht eingeführt.

Eine generische, persistierte Reihenfolge aller Hub-/Homepage-Blöcke ist in
der bisherigen City-Config nicht vorhanden. Sie wird deshalb nicht riskant
nachgerüstet und ist als separater P2-Punkt dokumentiert. Das aktuelle
Template und seine Reihenfolge bleiben unverändert.

## Sicherheit und Datenbank

Für `city_page_configs`, `city_content_field_controls` und
`city_editor_audit` ist RLS aktiv. Öffentliche Rollen können nur aktive Page
Configs lesen; Field Controls und Audit sind nicht öffentlich lesbar oder
schreibbar. Admin-Schreibzugriff verlangt `is_admin()`, interne Werte wie
`before_value`, `after_value` und Editor-Profile werden nicht in Public HTML
exponiert.

## Preview, Save und Veröffentlichung

Jeder wichtige Surface- und Content-Editor bietet einen Link zur echten
PRELAUNCH-Public-URL. Speichern unterscheidet DRAFT und ACTIVE und liefert
explizites Erfolgs-/Fehlerfeedback. Die Änderung wird in Supabase gespeichert;
für redaktionelle Änderungen ist kein Code, Codex, SQL oder Deployment nötig.

## Verbleibende Acceptance-Grenze

Technisch vorbereitet und durch Tests abgedeckt sind Place, Event, Route,
Guide, Homepage, Hub, Collection, Navigation, Media sowie die Business- und
Editorial-Integrationen. Der noch offene Schritt ist die manuelle, eingeloggte
End-to-End-Abnahme im Browser: mindestens ein Place-Feld, Event-SEO,
Collection-Featured-Reihenfolge, Hub-Text, Navigation Desktop/Mobile und ein
Restore müssen mit einem reversiblen Testwert geprüft und anschließend auf den
Originalzustand zurückgesetzt werden.

Bis diese Abnahme mit einer echten Admin-Session bestätigt wurde, lautet der
Status ausdrücklich:

`CITY_EDITOR_AWAITING_MANUAL_ACCEPTANCE`

Noch nicht Teil dieser Welle sind City-Agent, SEO-Agent, Media-Agent, neue
SEO-Artikel, Landau/Edenkoben und `PRELAUNCH → PUBLIC`.
