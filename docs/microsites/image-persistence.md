# Bildwechsel, Entwurf und Veröffentlichung

Korrektur vom 08.10.2026. Die Builder-Vorschau bleibt die verbindliche Darstellung.

- Bilddateien werden beim Auswählen direkt über eine partnergebundene signierte Storage-Adresse übertragen. Der Server prüft Berechtigung, Pfad, Typ und tatsächliche Größe, optimiert das Bild und liefert eine dauerhafte öffentliche Adresse.
- Die Upload-Verwaltung gehört zum Editor. Ein Wechsel des ausgewählten Bildfelds verliert weder Datei noch laufenden Upload. Späte Antworten überschreiben keine neuere Auswahl. Fehler können wiederholt oder verworfen werden.
- Speichern, Veröffentlichen und die separate Vorschau warten auf fertige Uploads. Der Server weist verbliebene `blob:`-Bildadressen auch bei Entwürfen zurück. Bestehende beschädigte Entwürfe erhalten eine ausdrückliche Wiederherstellung pro Bild; andere Änderungen bleiben erhalten.
- Leere optionale Bildwerte aus älteren öffentlichen Snapshots bedeuten Vererbung aus der Builder-Vorlage. Bildplatzhalter behalten die Positionierung und mobile Sichtbarkeit des eigentlichen Bilds.

Die Regressionen laufen in der CI: echte Editorinteraktionen für Bild A → Bild B → Speichern → erneut Öffnen, Fehler/Wiederholen, Ersetzen/Verwerfen, späte Antworten, Bibliotheksauswahl und Altdaten-Reparatur; Serverprüfungen für Uploadgrenzen, Berechtigung, fremde Pfade, echte Bildoptimierung und Bereinigung.

Nach Änderungen am Renderer oder öffentlichen Vertrag den Web-Vendorbestand mit `scripts/sync-microsite-renderer.mjs` aus dem geprüften Admin-Commit synchronisieren. Der Web-Test mit leeren älteren Über-uns-Bildwerten prüft die tatsächlich gerenderten Bildadressen.
