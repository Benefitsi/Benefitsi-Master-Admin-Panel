# Benefitsi Workspace und Partnergespräche

Stand: 05.10.2026 · Abgestimmter Entwurf · Implementiert im Review-Branch, noch nicht produktiv

## Das Ergebnis für Patrick

Im Master-Admin entsteht ein eigener Bereich **Workspace**. Hier lassen sich Arbeitsbereiche, Seiten und Unterseiten anlegen, Ideen sammeln, Dateien verlinken und Partnergespräche vorbereiten, durchführen und nachbereiten. Jede Partnerakte verbindet freie Notizen mit einem anpassbaren Fragebogen und den vorhandenen Admin-Funktionen.

Der wichtigste Ablauf: Partner öffnen → Gespräch starten → Fragen beantworten und frei mitschreiben → abweichende Partnerwünsche festhalten → Vereinbarungen prüfen → passende Admin-Bearbeitung öffnen → Umsetzung dokumentieren.

Die Fragen, Erklärtexte und Vorschläge sind im [vollständigen Gesprächsleitfaden](onboarding-fragen.md) ausgearbeitet. Alle Antwortfelder beginnen leer. Vorschläge werden nicht als Aussagen des Partners gespeichert.

**Abgestimmte Sichtbarkeit:** interner Bereich für Patrick und berechtigte Admins. Partner erhalten durch ihre Zuordnung zu einer Akte keinen Zugriff. Es werden keine Einladungen oder Nachrichten verschickt.

## Welche Form passt zu Benefitsi?

| Ansatz | Vorteil | Nachteil |
| --- | --- | --- |
| **Eigener Workspace im Master-Admin – empfohlen** | Partner, Berechtigungen, Bearbeitungsseiten und Gespräch liegen in derselben Anwendung; keine doppelte Partnerverwaltung | Editor und zuverlässige Speicherung müssen implementiert und geprüft werden |
| Bestehendes Notion als Gesprächsoberfläche | Seiten und Vorlagen stehen bereits zur Verfügung | Integration und Rechte liegen in zwei Systemen; Partnerwechsel und Datenabgleich bleiben zusätzliche Arbeit |
| Eigenständige neue Workspace-App | Unabhängige Oberfläche und eigener Ausbau | Zusätzliche Anmeldung, Betrieb und Pflege ohne unmittelbaren Vorteil für den ersten Ablauf |

Die Empfehlung übernimmt die für diesen Auftrag relevanten Notion-Muster: Seiten mit Unterseiten, strukturierte Eigenschaften, Vorlagen und mehrere Ansichten derselben Datensätze. Grundlage: [Notion-Seitenhierarchie](https://www.notion.com/help/create-a-subpage), [Datenbanken als Seitensammlungen](https://www.notion.com/help/intro-to-databases) und [Datenbankvorlagen](https://www.notion.com/help/database-templates). Gestaltung und Umsetzung erfolgen als eigener Benefitsi-Bereich.

## Oberfläche und Funktionen

### 1. Arbeitsbereiche und freie Seiten

- Arbeitsbereiche erstellen, benennen und archivieren, etwa „Benefitsi“, „Partnergespräche“ und „Produktideen“.
- Seiten und Unterseiten erstellen, umbenennen, verschieben, duplizieren und archivieren; archivierte Seiten wiederherstellen.
- Seitentypen: Notiz, Idee, Partnerakte und Gespräch. Derselbe Editor dient allen Typen.
- Bearbeitbare Blöcke: Absatz, Überschrift, Aufzählung, nummerierte Liste, Checkliste, Hinweis sowie Link-/Dateiverweis. Blöcke lassen sich hinzufügen, umordnen und entfernen.
- Eigenschaften: Status, Tags, verantwortliche Person und optionaler Termin. Favoriten gelten je Benutzer.
- Suche über Titel, Text und Antworten; Filter nach Partner, Seitentyp, Status und Tags.
- Seitenbaum für Notizen sowie Tabellen- und Boardansicht für Partnerakten. Das sind Ansichten derselben Datensätze; Verschieben im Board erzeugt keine Kopie.
- Eigene Vorlagen aus einer Seite anlegen. Bei einer Gesprächsvorlage bleiben Partnerantworten, Gesprächsdatum und Erledigungsnachweise leer.
- Eine einzelne Seite einschließlich Antworten und Links als Markdown und JSON exportieren.

### 2. Partnerakte

Der Kopf zeigt den verknüpften Partner, Ansprechpartner, aktuellen Onboardingstatus und nächste Aufgabe. Verlässliche Partnerstammdaten werden aus der vorhandenen Partnerquelle gelesen. Gesprächsnotizen enthalten keine unabhängig gepflegte zweite Kopie von Adresse, Tarif oder Öffnungszeiten.

Die Akte bündelt:

1. **Überblick:** Ziele, Ansprechpartner, letzte Vereinbarung, nächste Schritte.
2. **Gespräche:** einzelne Termine mit eigenem Protokoll und Fragebogen.
3. **Notizen und Ideen:** freie Seiten, auch außerhalb eines Gesprächs.
4. **Dateien und Links:** benannte Verweise auf Logo, Fotos, Speisekarte, Unterlagen, Vorschau und freigegebene Medien.
5. **Umsetzung:** vereinbarte Änderungen mit Zuständigkeit, Datum und Verweis auf die betreffende Admin-Funktion.

Die Zuordnung benutzt die Partner-ID. Ein geänderter Name oder Slug löst keine neue Akte aus. Ein neuer Interessent kann zunächst eine unverknüpfte Akte haben; nach Anlage des Partnerdatensatzes wird sie ausdrücklich verbunden. Es wird dadurch kein zweiter Partner automatisch angelegt.

### 3. Gesprächsansicht

Auf dem Desktop stehen links Themen und Fragen, in der Mitte Antwortfelder und freie Notizen, rechts die Partnerlinks und noch offenen Entscheidungen. Auf schmalen Bildschirmen werden diese Bereiche umschaltbar angezeigt. Ein Fokusmodus blendet die sonstige Admin-Navigation aus.

Oben bleiben Partnername, Gesprächstermin und Speicherstatus sichtbar. Tastaturbedienung, ausreichend große Antwortfelder und ein direkter Wechsel zur nächsten offenen Frage sind Teil der ersten Umsetzung.

Jede Frage enthält:

| Feld | Bedeutung |
| --- | --- |
| Frage | Vorformulierter, je Gespräch anpassbarer Wortlaut |
| Warum fragen? | Kurze Hilfe für Patrick; auf Wunsch einklappbar |
| Vorschlag | Diskussionsgrundlage von Benefitsi, ausdrücklich noch keine Vereinbarung |
| Antwort | Tatsächliche Aussage des Partners; Freitext, Zahl, Auswahl, Datum oder Link |
| Änderungswunsch | Abweichung vom Vorschlag mit Begründung und ggf. Prüfbedarf |
| Vereinbart | Zusammenfassung dessen, was beide tatsächlich festgelegt haben |
| Bearbeitungsstand | Offen, beantwortet, zu klären, vereinbart oder nicht relevant; letzteres mit Grund |
| Nächster Schritt | Zuständigkeit, Termin, Admin-Verweis und Umsetzungsnachweis |

Anzahl beantworteter Fragen und Anzahl umgesetzter Vereinbarungen werden getrennt gezeigt. Eine übersprungene Frage zählt nicht als beantwortet. Eine vereinbarte Einstellung ist noch kein veröffentlichter Deal.

Neue eigene Fragen können während des Gesprächs ergänzt, Fragen umsortiert und für diesen Partner ausgeblendet werden. Standardänderungen für zukünftige Gespräche erfolgen über „Als Vorlage speichern“. Bestehende Protokolle werden dabei nicht verändert.

### 4. Dateien und Links

In der ersten Fassung können bestehende Dateien und Seiten mit Titel, URL, Kategorie und kurzer Notiz verknüpft werden. Beispielkategorien: Logo, Bilder, Speisekarte, Medienfreigabe, Vertragsunterlage, 360°-Tour und sonstige Datei.

Es gibt keine Behauptung, dass ein verlinktes Dokument hochgeladen oder in Benefitsi gesichert sei. Bei einem externen Dateiverweis gelten die Zugriffsrechte des Dateianbieters. Die Oberfläche nennt Quelle und Linkstatus; Links werden nicht ungefragt an Partner weitergegeben.

Für allgemeine Dateilinks werden sichere HTTP(S)-Adressen akzeptiert. Skript- und lokale Dateipfade werden abgelehnt. Linktexte werden als Text dargestellt. Fremde Webseiten werden nicht automatisch in einem ungeschützten Frame eingebettet. Vorhandene, ausdrücklich unterstützte Medienvorschauen können später über denselben Freigabepfad erscheinen.

## Direkte Admin-Integration

Diese Einstiege sind im lokal vorhandenen `origin/main` des Master-Admin belegt. Platzhalter werden ausschließlich mit dem ausgewählten Partner gefüllt und URL-kodiert.

| Aktion im Workspace | Vorhandener Einstieg |
| --- | --- |
| Partnerdetails bearbeiten | `/partners?partner={partnerId}&tab=details` |
| Deals, Stempelkarte und Meilensteine bearbeiten | `/partners?partner={partnerId}&tab=deals` |
| Menü / Leistungen bearbeiten | `/partners?partner={partnerId}&tab=menu` |
| Team und Zugänge bearbeiten | `/partners?partner={partnerId}&tab=access` |
| Besuche und Einlösungen prüfen | `/partners?partner={partnerId}&tab=activity` |
| Tarif und Module prüfen | `/partners?partner={partnerId}&tab=plan` |
| Microsite im Partnerbereich bearbeiten | `/partners?partner={partnerId}&view=microsite` |
| Vollständigen Builder öffnen | `/microsite-builder/{builderIdentifier}`; bestehende Auflösungslogik wiederverwenden |
| Öffentliche Partnerseite | `https://benefitsi.de/partner/{canonicalSlug}`; nur bei belegter öffentlicher Seite als verfügbar darstellen |

Der bestehende Editor erhält umgekehrt „Workspace öffnen“ für genau diesen Partner. Die Gesprächsansicht hält ihren gespeicherten Zustand beim Hin- und Rückwechsel.

Der Builder-Identifier folgt dem bestehenden Code: Microsite-Slug, Partner-Slug, Subdomain, anschließend ID. Für öffentliche Links wird die bestehende Canonical-Funktion wiederverwendet. Fehlt die öffentliche Seite, steht dort „Noch nicht veröffentlicht“ mit einem Builder-/Vorschaulink, keine erfundene öffentliche URL.

**Erste Fassung:** Änderungen werden in den vorhandenen Editoren ausgeführt. Der Workspace dokumentiert Vereinbarungen und verlinkt zur Bearbeitung. Eine Aktion „Vereinbarung direkt übernehmen“ wäre eine spätere Erweiterung mit Änderungsvorschau, Feldzuordnung und denselben Validierungen. Dadurch ist der erste Ablauf vollständig nutzbar, ohne einen zweiten Deal- oder Partnereditor zu schaffen.

## Gesprächsinhalte und Produktwahrheit

Der [Leitfaden](onboarding-fragen.md) enthält die ausformulierten Fragen und Vorschläge für Betrieb, Ziele, Stempelkarte, Deals, Microsite, Medien, Team, Pro-Funktionen und Abschluss.

Die Erklärkarten verwenden die bestehende Leistungsfassung `2026-10-03.1` aus `lib/partners/benefits-v1.json`. Tarifumfang und technische Verfügbarkeit sind getrennte Angaben. Partner Pro und Consumer Premium werden nicht gleichgesetzt.

Für den aktuellen Entwurf gelten insbesondere:

- Setup und Onboarding für Free und Pro; normale Angebote und Happy Hour ohne Tarif-Mengenlimit.
- Free: ein Deal Drop pro Kalendermonat und Standort. Pro: aktuell vorläufig ohne Monatslimit; endgültiger Umfang ist im Katalog gekennzeichnet.
- Eigene Microsite, Besuchsfeedback und erweiterte Auswertung sind Pro-Funktionen.
- Eine freigegebene Videoquelle und eine 360°-/Tourquelle können in Pro eingebunden werden. Neue Aufnahmen, Schnitt und Tourproduktion werden gesondert angefragt. Ein kostenloser Aufnahmebonus wird nicht zugesagt.
- Kampagnenentwürfe, Artikel- und Interviewanfragen sind von automatischem Versand oder automatischer Veröffentlichung zu unterscheiden. Der gelesene Katalog kennzeichnet Marketingversand als noch nicht verfügbar.
- Keine Wiedereinführung von Content-Paket, QR-Postern, Mitarbeiterkarten, angebotenen Mitarbeiterschulungen, Social-/WhatsApp-Vorlagen oder Websitechecks.
- Der gelesene Stempelkarteneditor verwendet zehn Stempel als Kartenziel; Meilensteine liegen innerhalb dieses Rahmens. Ein Partnerwunsch nach einem anderen Kartenmodell bleibt als Wunsch mit Prüfbedarf erhalten.

Preise und Vertragsphasen werden aus der vorhandenen Tarifansicht verlinkt. Der neue Fragebogen enthält keine zweite Preis- oder Vertragsberechnung.

## Datenmodell und zuverlässiges Speichern

Vorgesehene Verantwortung der Einheiten:

| Einheit | Inhalt |
| --- | --- |
| Workspace | Titel, Beschreibung, interner Zugriff, Archivierung |
| Seite | Workspace, optionale Elternseite, Typ, optionaler Partnerbezug, Titel, Eigenschaften und Inhaltsblöcke |
| Gespräch | Seite, Datum, Teilnehmende, verwendete Vorlagenversion, Zusammenfassung und Abschlussstatus |
| Frage / Antwort | Stabiler Schlüssel, gespeicherter Fragetext, Vorschlag, Antworttyp, tatsächliche Antwort, Partnerwunsch und Vereinbarung |
| Datei-/Linkverweis | Zugeordnete Seite, Titel, URL, Kategorie und Beschreibung |
| Aufgabe | Seite oder Frage, Beschreibung, Zuständigkeit, Termin, Status und Nachweis |
| Vorlage | Versioniertes Seitengerüst und Fragen ohne ausgefüllte Partnerantworten |
| Seitenversion | Inhalt, Bearbeiter, Zeitpunkt und Versionsnummer für nachvollziehbare Änderungen |
| Favorit | Benutzer und Seite |

Gemeinsame Admin-Seiten sind als intern gekennzeichnet. Persönliche, nur für Patrick sichtbare Bereiche und Partner-Gastzugänge sind eigenständige Berechtigungsstufen und nicht stillschweigend aus „Workspace“ abzuleiten.

Speicherverhalten:

1. Änderungen erscheinen sofort im Editor; Speicherung folgt nach kurzer Eingabepause und zusätzlich beim bewussten Wechsel der Seite.
2. „Gespeichert“ wird erst nach erfolgreicher Serverbestätigung angezeigt. Fehler erhalten den Entwurf und bieten „Erneut speichern“ und Export an.
3. Die Versionsnummer wird beim Speichern geprüft. Bei paralleler Bearbeitung wird keine neuere Serverfassung unbemerkt überschrieben; beide Fassungen bleiben zum Vergleich erhalten.
4. Bei Verbindungsabbruch bleibt der aktuelle Entwurf in der geöffneten Ansicht. Verlassen mit ungespeicherten Änderungen wird abgefangen. Eine vollständige Offline-App wird nicht behauptet.
5. Versionswiederherstellung erzeugt eine neue Version und löscht die Historie nicht.
6. Doppelte Klicks beim Erstellen dürfen keine doppelten Gesprächsseiten erzeugen.

Interne Daten werden in der vorhandenen Supabase-Infrastruktur gespeichert. Jede Lese- und Schreiboperation prüft die Admin-Berechtigung; Datenbankzugriffe erhalten passende RLS-/RPC-Grenzen. Die bestehende Partnerdomain bleibt für diese internen Seiten gesperrt. Links aus einer Partnerakte umgehen keine Berechtigungsprüfung. Ein gelöschter Partner hinterlässt eine klar markierte, nicht mehr aktive Verknüpfung; das interne Protokoll wird nicht mitgelöscht.

## Einbau in den vorhandenen Code

Geplante Admin-Erweiterung:

- `app/workspace/page.tsx`: authentifizierter Einstieg und Auswahl.
- `app/workspace/actions.ts`: validierte Erstell-/Speicher-/Archivierungsaktionen.
- `components/workspace/`: Seitenbaum, Editor, Partnerakte, Gesprächsansicht, Frageneditor, Linkliste und Speicherstatus als getrennte Komponenten.
- `lib/workspace/`: Datentypen, validierte Ein-/Ausgabe, Vorlagen, Suche, Export und generierte Partnerlinks.
- Bestehende Navigation und `app/partner-admin.tsx`: Einstieg in den Workspace und Rückverweis je Partner.
- Datenbankmigration im verbindlichen `Benefitsi-Database`-Repository, mit Berechtigungen, Versionsprüfung und gezielten Integrationstests.

`/wissen` bleibt der vorhandene schreibgeschützte Wissensspiegel. Der Workspace erhält Quellverweise dorthin, schreibt aber keine importierten Notion-/Wissensdokumente unbemerkt um. Globale Produktregeln bleiben an ihrer bestehenden Quelle; Gesprächsvereinbarungen gelten für die jeweilige Partnerakte.

## Abnahme

Die Erweiterung ist erst fertig, wenn diese Wege praktisch belegt sind:

1. Arbeitsbereich, Seite und Unterseite anlegen; ändern, verschieben, archivieren und wiederherstellen.
2. Freie Notiz mit Checkliste und Dateilink schreiben, Browser neu laden und gespeicherten Inhalt wiederfinden.
3. Partnerakte verknüpfen; alle Bearbeitungslinks zeigen auf denselben richtigen Partner und die richtige Registerkarte.
4. Zwei Gespräche desselben Partners behalten getrennte Antworten und Datumsangaben.
5. Standardfrage umformulieren, eigene Frage ergänzen und Partnerwunsch erfassen; andere Gespräche bleiben unverändert.
6. Vorschläge werden erst durch eine bewusste Übernahme zu einem Antwort-/Vereinbarungstext.
7. Deal-/Stempelvereinbarung erfassen, vorhandenen Editor öffnen, Änderung speichern und Umsetzung mit Nachweis abhaken.
8. Speicherung unterbrochen und zwei Tabs gleichzeitig bearbeitet: kein falscher Erfolgsstatus und kein stiller Datenverlust.
9. Ein nicht berechtigter Nutzer und ein Partnerkonto können interne Akten weder über die Oberfläche noch über direkte Datenzugriffe lesen oder verändern.
10. Suche und Filter finden Inhalte aus Notizen und Antworten; Export enthält dieselbe Fassung und sichere Links.
11. Tastatur sowie ein schmaler Bildschirm erlauben das vollständige Gespräch ohne abgeschnittene Antwortfelder.
12. Leerer Bestand, fehlende Migration, ungültiger Partnerlink und nicht verfügbare Tarifdaten erhalten verständliche Zustände.

## Vorbereitung und Grenzen dieses Dokuments

Gelesen wurden die lokale Workspace-Zuordnung, bestehende Onboarding-Unterlagen, der Leistungsüberblick vom 02.10. mit späteren Ergänzungen und die lokal verfügbaren Remote-Tracking-Dateien des Master-Admin. Der gelesene Admin-Stand war `origin/main` bei `4caaac4`. Das ist ein Codebeleg, kein neuer Live-Test der Produktionsumgebung.

Der Mac hatte bei der ersten Prüfung rund 27 GiB freien SSD-Platz. Es wurden keine Toolchains, Browser, Buildcaches oder Worktrees neu gestartet beziehungsweise angelegt. Vor der Implementierung muss der aktuelle Repo-Stand erneut gelesen und eine passende isolierte Arbeitskopie gewählt werden; vorhandene fremde Änderungen bleiben erhalten.

Dieser Entwurf und der Fragebogen sind erstellt. Anwendung, Migration, Veröffentlichung und praktische Abnahme sind noch offen. Vor Implementierung steht gemäß dem verwendeten Brainstorming-Workflow die Freigabe dieses konkreten Entwurfs aus.

## Quellen

- [Verbindliche Workspace- und Deployment-Zuordnung](../../../BENEFITSI_WORKSPACE_STRUCTURE.md)
- [Partnerleistungen und Beschlüsse vom 02.10.](2026-10-02-partner-leistungsueberblick.md)
- [Bisherige Onboarding-Checkliste; ältere Abschnitte gegen aktuelle Beschlüsse prüfen](../../benefitsi-founder-os-2026-09-19/onboarding-checklist.md)
- [Entscheidungsregister](../../benefitsi-founder-os-2026-09-19/decisions-2026-09-19.md)
- Admin-Code: `app/partners/page.tsx`, `app/partner-admin.tsx`, `lib/admin.ts`, `lib/portal-routing.ts`, `lib/partner-paths.ts`, `lib/reward-config.ts`, `lib/partners/benefits-v1.json`, jeweils aus dem oben genannten lokalen `origin/main`.
