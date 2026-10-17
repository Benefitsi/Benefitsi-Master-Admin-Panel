# Partner → Akquise & Kontakte

Stand: 17.10.2026. Implementierung auf einem eigenen Feature-Branch; Main und Produktion sind noch nicht geändert.

## Verhalten

Die Admin-Unterseite `/partners/acquisition` verbindet Bestandsbetriebe und separat erfasste Interessenten mit privaten Workspace-Akten. Kontaktstatus, datierte Kontakte, nächster Schritt, Wiedervorlage, Gesprächstermin und Interesse an 360°, Speisenfotos und Drohnenaufnahmen sind dort gemeinsam pflegbar. Suche sowie Stadt-, Branchen- und Statusfilter wirken kombiniert; Kennzahlen beziehen sich auf die gefilterte Auswahl.

Die Partnernavigation enthält Partnerübersicht und Akquise & Kontakte. Die sieben Hauptbereiche bleiben erhalten. Ein Unterpfad aktiviert genau einen Unterpunkt. Ein E-Mail-Entwurf wird nicht als versendeter Kontakt gewertet; Bestand ohne Nachweis bleibt unbekannt. Akquiseänderungen aktivieren keinen öffentlichen Partner und versenden keine Nachricht.

Die vier Server Actions prüfen Admin-Rechte und verwenden die vorhandenen Workspace-Speicherfunktionen mit Revision und Historie. Dafür ist keine neue Tabelle oder Migration erforderlich. Normale Notizen, Ressourcen, Aufgaben und andere Workspace-Inhalte bleiben erhalten. Kontakte werden über diese Oberfläche nur ergänzt.

## Prüfung

- Abschließender kombinierter lokaler Lauf: **77 gezielte Tests erfolgreich** (Akquisemodell, Datenanbindung, tatsächliche Oberfläche, Navigation und Workspace-Modell/Pagination). Geänderte Dateien bestehen ESLint; der In-Memory-Browserfixture kompiliert.
- Reale React-Komponenten über die tatsächliche Modell-/Datenanbindung mit synthetischer externer Speichergrenze geprüft: Speichern/Neuladen, neue Interessenten, kombinierte Filter, Fehler, Konflikte, doppelte Klicks, verspätete Antworten und verlorene Setup-Antworten.
- Chrome-Prüfung mit tatsächlichen Komponenten/CSS: Desktop und 390 Pixel, genau ein aktiver Navigationslink, kein horizontaler Seitenüberlauf, Kontakt/Medieninteresse/Wiedervorlage nach vollständigem Neuladen vorhanden; ein Speicherfehler erhält den Entwurf.
- Native Browser-Verlaufsprüfung: Abbrechen der Rückwärtsnavigation erhält Seite und Eingaben. Bestätigtes Verlassen sowie Vorwärtsnavigation funktionieren. Die Testseite verwendet einen Seitenumschaltungsadapter; ein vollständiger Next-Router-Integrationstest ist dadurch nicht belegt.
- Produktionsschema und bestehende Workspace-RPCs wurden ausschließlich lesend geprüft. Keine Testkontakte in Produktionsdaten angelegt. Eigene lokale Prüfserver und Browser-Tabs beendet; keine neue Toolchain oder Abhängigkeiten installiert.

Die vollständige lokale Suite vor dem letzten gezielten UI-Fix lief mit **1.701 Tests: 1.688 erfolgreich, 13 fehlgeschlagen**. Drei Testdateien fanden den separaten Web-Checkout aus dem isolierten Arbeitsverzeichnis nicht; mit `BENEFITSI_WEB_ROOT` auf den vorhandenen Web-Checkout bestanden alle 28 zugehörigen Tests. Sechs Sprachprovider-Tests und ein Kartentest scheiterten identisch im unveränderten Ausgangscommit. Drei weitere Fehler betreffen die alte `braces`-Kopie in den wiederverwendeten lokalen Abhängigkeiten; Test, Manifest und Lockdatei sind gegenüber dem Ausgangsstand unverändert. Die lokale Suite wird deshalb nicht als vollständig grün ausgewiesen.

Der lokale Typecheck meldet fehlendes `leaflet` und `onnxruntime-web/webgpu` in unveränderten Bestandsdateien. Die wiederverwendeten Abhängigkeiten enthalten Next 16.3.6, die Lockdatei verlangt 16.3.8. Für die Freigabe sind deshalb zusätzlich die Cloud-Prüfungen mit exakt installierter Lockdatei maßgeblich.

## Technische Entscheidungen und Grenzen

- Isolierte Git-Arbeitskopie direkt aus dem verifizierten Admin-Repository, weil das Desktop-Werkzeug das übergeordnete leere Repository statt des eingebetteten Admin-Repositories adressierte. Risiko bei einer falschen Zuordnung wäre das falsche Projekt; Remote und Basiscommit wurden geprüft.
- Vorhandene Abhängigkeiten über einen temporären Symlink wiederverwendet. Das spart lokale Kopien; lokale Prüfungen ersetzen wegen der Versionsabweichungen keinen Cloud-Build.
- Die neue Testsuite ist in den vorhandenen CI-Prüfschritt aufgenommen. Ein Fehler stoppt denselben bestehenden Prüfjob.
- App Router bietet keinen universellen Abbruchhook für Browser-Zurück. Abbrechbare native Verlaufsnavigation fragt deshalb nach; andere Browser behalten einen wiederherstellbaren Entwurf im Arbeitsspeicher der laufenden Sitzung. Dieser Ersatz übersteht keinen vollständigen Dokument-Neustart. Links und Dokumentverlassen behalten ihre Bestätigung. Es werden keine History-Schleifen oder zusätzlichen Navigationszustände zur Sperrung erzeugt.

## Veröffentlichung

Feature-Branch: `codex/partner-acquisition-20261017`. Finaler Review, CI-Stand und Entwurfs-PR werden nach Abschluss ergänzt. Eine produktive Veröffentlichung ist hierdurch noch nicht belegt.
