# Neue Stadt: Vorlage für einen kontrollierten Start

Version 2026-09-21. Planungsvorlage, keine startfähige Konfigurationsdatei und keine automatische Freigabe. Annweiler bleibt der aktuelle Lernpilot. Eine Expansion wird weder mit einem neuen Profilnamen noch mit kopierten Inhalten abgeschlossen.

## Pro Stadt auszufüllen

| Feld | Ausgangswert / benötigter Nachweis |
|---|---|
| Name, tatsächliche Stadt-ID, Slug | Offen; vorhandene ID aus der richtigen Umgebung verwenden, keine Annweiler-ID kopieren |
| Zeitzone und geographischer Umfang | Für deutsche Städte gewöhnlich Europe/Berlin; tatsächlichen Geltungsbereich bestätigen |
| Umgebung | Synthetische Entwicklung oder Stage; Production separat benennen |
| Fachlicher Owner und Vertretung | Benannte zuständige Person, keine erfundene Agentenverantwortung |
| Erlaubte Quellen | Tatsächliche URLs, Anbieter, Inhaltstyp, Nutzungs-/Bildrechte und Aktualisierungsrhythmus |
| Inhaltsmodule | Nur benötigte Module: Orte, Veranstaltungen, Wissen, Partnerprofile/Deals usw. |
| Partner-/Deal-Verifikation | Je Eintrag eindeutige bestätigte Zusage und Bedingungen; bisher offen |
| Freigaben | Automatische Veröffentlichung aus; Suchfreigabe aus; kein echter Partner-/Kundenpilot und keine Zahlung vor dokumentierter UG- und Betriebsfreigabe |
| Zeit-/Kostenrahmen | Bestehendes ausdrücklich verfügbares Budget; unbekannt ist nicht unbegrenzt |
| Aufträge | Eindeutige Stadt-/Modul-/Quellen-ID; erwartetes Ergebnis, Fälligkeit, Versuchszähler |
| Betrieb | Messquelle, letzter fachlicher Erfolg, maximale erlaubte Datenalterung, Fehlerzustand und Rückfallweg |

## Was gemeinsam bleibt

Produktcode, Rollenvertrag, erlaubtes Datenformat, Datenqualitätstests, UI-Komponenten, Fehlerkategorien und Berechtigungsprüfungen werden gemeinsam gepflegt. Stadtdaten, erlaubte Quellen, räumlicher Scope und fachliche Freigaben bleiben voneinander getrennt. Kein Fork des gesamten Produkts je Stadt.

Die vorhandenen `annweiler_*`-RPCs, Runner und festen IDs sind **nicht automatisch stadtübergreifend**. Vor einer weiteren Stadt jede betroffene Leser-/Schreibergrenze prüfen und bei Bedarf bewusst verallgemeinern. Ein umbenanntes Hermes-Profil allein ist kein Mehrstadtbetrieb. Die Agentenübersicht kann unbekannte Stadt-IDs anzeigen; ein fehlender Stadtname darf nicht automatisch Annweiler heißen.

## Abnahme vor Aktivierung

1. Quelle in der Testumgebung lesen: Datum, Zeitzone, wiederkehrende Termine, fehlende Endzeiten, abgesagte Ereignisse und Duplikate prüfen. Unbekannte Felder bleiben unbekannt.
2. Scope beweisen: Ein Auftrag für Stadt A darf keine Daten von Stadt B ändern oder freigeben. Rollen-/Mandantengrenzen mit synthetischen IDs prüfen.
3. Auftrag zweimal zustellen: genau ein fachliches Ergebnis. Alten Erfolg, abgelaufene Lease, fehlende Quote und fehlerhafte Anmeldung kontrolliert behandeln. Keine unendliche Modell- oder Transportschleife.
4. Tatsächlichen Weg prüfen: Stadt → Profil → Microsite → vorgesehener App-/Pilot-Einstieg. Linkziele, Partner-/Benefit-ID, Inhaltsstatus und Suchsperre zusammen prüfen.
5. Betrieb nachweisen: aktueller Laufbeleg, kontrollierter leerer Zustand, Ausfall einer Quelle und sichtbarer Hinweis bei alten Daten. Statuslesen darf selbst keine Arbeit auslösen.
6. Fachliche Freigaben, Zuständigkeit, Support und Rückfall dokumentieren. Vor Aktivierung prüfen, dass der **konkrete** neue Zeitplan und Veröffentlichungsumfang vom bestehenden Auftrag oder einer dokumentierten ausdrücklichen Freigabe gedeckt sind. Bereits erteilte Freigaben gelten weiter. Weder vorhandene Jobs duplizieren noch andere Städte still mitfreigeben.

## Was niemals kopiert wird

Zugangsdaten, OAuth-Sitzungen, persönliche Memories, Kunden-/Partnerzustimmungen, erledigte Queue-IDs, aktive Locks, Laufhistorie, bereits geladene LaunchAgents oder fremde freigegebene Inhalte. Neue Profile bekommen eine kleine Rollenreferenz und einen frischen Auftrag, keinen unkontrollierten Chat-/Datenbestand.

Nach der ersten Probe Kosten und Betreuungsaufwand je akzeptiertem Ergebnis messen. Mehr Städte nur bei nachgewiesenem Nutzwert, ausreichender Angebotsqualität, Betriebskapazität und finanziellem Rahmen. Millionen Nutzer sind ein Ziel; die Vorlage behauptet keine bereits getestete Kapazität.
