# Partner → Akquise & Kontakte

Stand: 17.10.2026. Vom Nutzer freigegeben: Kontaktübersicht, Verlauf, Wiedervorlage und Medieninteresse. Nachträgliche Vorgabe: als Unterseite von Partner, nicht als weiterer Hauptbereich.

## Ergebnis

Unter `/partners/acquisition` stehen vorhandene Betriebe und separat erfasste Interessenten. Die Partner-Navigation erhält die Unterseiten „Partnerübersicht“ und „Akquise & Kontakte“. Ein Unterpfad aktiviert genau einen Unterpunkt. Die übrige Navigation und das Partnerportal bleiben erhalten.

Tabellenspalten: Betrieb mit Ort/Branche, Kontaktstatus, letzter tatsächlicher Kontakt, nächster Schritt und Wiedervorlage. Suche sowie kombinierbare Stadt-, Branchen- und Statusfilter. Über der Tabelle: heute fällig, überfällig, Rückmeldung ausstehend und kommende Gespräche für die gefilterte Auswahl. Leere Werte bleiben unbekannt. Keine Beispieldaten in Produktion.

Status: `unrecorded` Kontaktstatus nicht erfasst, `new` Noch nicht kontaktiert, `contacted` Kontaktiert, `meeting` Gespräch vereinbart, `negotiating` In Abstimmung, `accepted` Zugesagt, `later` Später, `declined` Abgesagt. Bestand ohne Akquisenachweis bleibt `unrecorded`; ein E-Mail-Entwurf ist kein Kontakt. Geschlossene Fälle accepted/declined zählen nicht als überfällige Nachfassfälle. Kontaktstatus ändert weder Freigabe noch öffentlichen Partnerstatus.

Die Detailansicht enthält Ansprechpartner, E-Mail, Telefon, Website, Notizen, nächsten Schritt, Wiedervorlage und Gesprächstermin. Kontakte lassen sich datiert als E-Mail, Telefon, Besuch, Gespräch oder Sonstiges mit Notiz erfassen. Der jüngste Kontakt ergibt sich aus tatsächlichen Einträgen, nicht aus updated_at. Für 360°, Speisenfotos und Drohne gibt es jeweils Nicht geplant, Interesse, Termin vereinbart, Erstellt, Veröffentlicht. Diese Felder beschreiben interne Arbeit, veröffentlichen keine Medien. Ein gespeicherter Akquisestatus ist keine automatisch verschickte Nachricht.

## Speicherung

Vorhandene Tabellen `admin_workspaces`, `admin_workspace_pages`, `admin_workspace_versions` und die bereits veröffentlichten Workspace-RPCs bleiben die einzige Speicherung. Keine neue Datenbanktabelle, kein neues SQL-Schema, kein Service-Role-Client und keine Migration erforderlich. Die produktiven Funktionen `workspace_private.content_valid` und `page_save` wurden am 17.10. lesend geprüft: normale Fragen/Blöcke sind zulässig; Speichern prüft Admin, Revision und schreibt Historie atomar.

Eine Akquiseakte ist eine normale Workspace-Partnerakte mit reserviertem Tag `benefitsi:acquisition:v1`. Eigene Felder verwenden Fragen-IDs `acq:<field>` mit lesbaren deutschen Beschriftungen. Werte bleiben Strings innerhalb des vorhandenen Content-Vertrags. Enum-Werte und Datumsfelder prüft das Akquisemodell zusätzlich. Fragen, Notizen, Ressourcen, Aufgaben, Vorlage und sonstige Metadaten außerhalb dieses Namespace bleiben beim Speichern unverändert erhalten.

Ein Kontakt ist ein normaler Absatzblock mit ID `acq-contact:<YYYY-MM-DD>:<channel>:<uuid>` und lesbarer Notiz als text. Datum/Kanal/ID erlauben eine strukturierte Timeline, und der normale Workspace kann die Notiz weiterhin anzeigen und exportieren. Erfasste Kontakte bleiben append-only im Akquiseeditor. Jeder Eintrag behält beim Wiederholen eines Speicherversuchs dieselbe ID. Ungültige Akquisefelder werden nicht still zu Standardwerten oder leeren Verläufen umgewandelt.

Bestehende Partner werden aus `partners` mit expliziten Anzeige-/Kontaktfeldern und Stadtzuordnung gelesen. Keine Owner-/PIN-/Accountdaten auswählen. Akquise liest aktuelle Partnernamen, Stadt und Branche als Grundlage und schreibt niemals in partners. Nicht verknüpfte Interessenten leben ausschließlich als private Workspace-Akte. Ein Akquiseeintrag erzeugt keinen öffentlichen Partner. Für bestehende Partner werden zusätzliche Akquiseakten nicht automatisch angelegt, sondern erst beim Speichern einer ausdrücklichen Änderung. Dafür eine stabile, namespaced UUID aus der Partner-ID erzeugen, damit konkurrierende Neuanlagen denselben Datensatz treffen. Bestehende verknüpfte Akquiseakten nach Partner-ID finden, bevor eine neue ID erzeugt wird. Mehrere historische Akquiseakten nicht still überschreiben oder löschen.

Aktive Workspaces stehen beim Anlegen zur Auswahl. Wenn noch keiner besteht, ist das explizite Einrichten eines Arbeitsbereichs möglich. Ein GET erstellt keine Daten. Das Setup verwendet eine vom Client einmal erzeugte ID und behandelt eine nach verlorener Antwort bereits identisch angelegte Workspace-Zeile als Erfolg.

## Öffentliche Schnittstelle für die UI

`lib/acquisition/model.ts` exportiert:

```ts
type AcquisitionStatus = 'unrecorded'|'new'|'contacted'|'meeting'|'negotiating'|'accepted'|'later'|'declined'
type MediaStatus = 'none'|'interested'|'scheduled'|'done'|'published'
type ContactChannel = 'email'|'phone'|'visit'|'meeting'|'other'
type AcquisitionFields = {
  name:string; city:string; industry:string; contactName:string; email:string; phone:string; website:string;
  status:AcquisitionStatus; nextStep:string; followUpDate:string; meetingDate:string;
  panorama:MediaStatus; food:MediaStatus; drone:MediaStatus; notes:string
}
type AcquisitionContact = {id:string;date:string;channel:ContactChannel;note:string}
type AcquisitionDocument = {page:WorkspacePage;fields:AcquisitionFields;contacts:AcquisitionContact[]}
type AcquisitionRow = {key:string;pageId:string|null;partnerId:string|null;fields:AcquisitionFields;lastContactDate:string}
type AcquisitionIndex = {rows:AcquisitionRow[];workspaces:Workspace[]}
type AcquisitionTarget = {pageId?:string;partnerId?:string;workspaceId?:string}
```

`app/partners/acquisition/actions.ts` exportiert ausschließlich async Server Actions:

```ts
loadAcquisitionIndex():Promise<ActionResult<AcquisitionIndex>>
loadAcquisitionDocument(target:AcquisitionTarget):Promise<ActionResult<AcquisitionDocument>>
saveAcquisitionDocument(input:AcquisitionDocument):Promise<ActionResult<AcquisitionDocument>>
createAcquisitionWorkspace(id:string):Promise<ActionResult<Workspace>>
```

Die konkrete Services-Prop der React-Komponente verwendet diese vier Signaturen. `newContact` ist kein separater Schreibaufruf: Der Editor ergänzt einen Kontakt in seinem Dokument und speichert Felder und Kontakte in derselben Workspace-RPC-Transaktion.

## Sicherheit und Zuverlässigkeit

Jede Server Action prüft `requireAdmin`, zusätzlich zu bestehenden RLS-Regeln. Partner-Hosts und gewöhnliche Nutzer erhalten weder Akquisedaten noch Schreibzugriff. Neue Aktionen prüfen Eingaben vor Datenbankzugriffen. Vollständige Pagination beim Laden. Ein Fehler liefert keine scheinbar vollständige Teilübersicht. UUIDs, Daten, E-Mail/HTTP(S)-Website, Enums, Textlängen und Dokumentgröße validieren. Keine automatische E-Mail, kein Kalendertermin, keine Partneraktivierung.

Der Editor speichert ausdrücklich per Button. Bei Fehler oder Versionskonflikt bleiben Eingaben erhalten. Ein Hinweis nennt den Konflikt; bewusstes Neuladen verwirft nur nach Bestätigung. Seiten-/Datensatzwechsel mit ungespeicherten Änderungen braucht ebenfalls eine Bestätigung. Submit sperrt doppelte Klicks. Ein Reload rekonstruiert gespeicherte Felder, Kontakte, nächsten Schritt und Medienstatus.

## Abnahme

Gezielte Verhaltenstests für Serialisierung/Erhalt fremder Inhalte, Bestand ohne erfundene Kontakte, ungültige Eingaben, Berliner Datumsgrenzen, letzte Kontakte, Abschlussstatus und Fälligkeit, Speichern/Neuladen, Konflikte und verlorene Antworten, Admin-Grenze und Navigation. Echte React-Komponenten mit injizierter Transportgrenze statt statischer UI-Mocks. Browserabnahme der neuen Oberfläche bei Desktop und 390 px mit synthetischen Daten. Keine Testkontakte bei realen Betrieben erzeugen.

Ressourcen: vorhandene Abhängigkeiten über einen temporären node_modules-Symlink wiederverwenden. Kein zusätzlicher Modulcache. Vor großen Builds Platz/Prozesse prüfen; lokal gezielte Tests, Typecheck und begrenzte Browserprüfung bevorzugen. Selbst gestartete Prüfserver beenden und temporäre Ordner entfernen. Änderungen in einem eigenen Branch sichern. Keine gemeinsame Main-Branch-Mutation oder produktive Veröffentlichung ohne abschließende Freigabe.
