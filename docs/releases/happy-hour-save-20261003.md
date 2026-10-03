# Admin: verlässliches Speichern, Happy Hour und Kalender-Serien

Vorbereitet auf `origin/main` `37dbc6bfdec89aaa2dbb9ea0f3fb260157e9af90`, Branch `codex/happy-hour-save-20261003`. Lokale Implementierung; noch kein Push, Merge, Deployment oder Schreiben echter Partnerdaten.

## Ergebnis

- Der Dashboard-Refresh lädt Tarifberechtigungen für den geöffneten Partner statt für alle 303 Partner. Andere Partner erhalten ihre geprüften Berechtigungen beim Öffnen; Fehler bleiben unbekannt und können erneut geladen werden. Die bereits geprüfte Sitzung wird wiederverwendet. Überlappende Refreshes werden zusammengeführt; während Formulare bearbeitet werden, wird Aktualisierung aufgeschoben. Supabase-Aufrufe haben begrenzte Wartezeiten.
- Happy-Hour-Wochentage: ausgewählt blau, ausgeschlossen rot mit ×, native Checkboxen mit Tastaturbedienung und Fokusmarkierung. Mindestens ein Tag muss ausgewählt sein; ältere Formulare ohne Tagesauswahl behalten täglich als Standard.
- Alle fünf HH-Formate bleiben erhalten: fester Betrag, Prozent, Gratisartikel, 2 für 1 und Bonusstempel. Die Anzeige erklärt automatische Anwendung, sofern kein anderer direkter Vorteil ausgewählt ist; die DB entscheidet über genau eine gültige HH.
- Stabile Anfragenummern und sofortige Pending-Sperren verhindern erneutes Anlegen durch Doppelklick oder unsicheren Retry. Bereits gespeicherte Requests werden bestätigt. Der zusätzliche DB-Guard serialisiert identische aktive Happy Hours mit unterschiedlichen IDs; vorhandene Duplikate werden nicht gelöscht.
- Beim Bearbeiten stammen gespeicherte Aktivierungs- und Auslöserfelder kanonischer HH/Serien aus der autorisierten DB-Zeile. HH-Stock-/Reservierungsfelder werden im UPDATE ausgelassen, damit parallele Einlösungen erhalten bleiben. HH bleibt auch mit einem Streak-Qualifier ein HH-Formular.
- Stempelbelohnungen erhalten bei leerem optionalem Titel automatisch beispielsweise „5 Stempel: Kaffee“. Feldfehler behalten sämtliche Eingaben; nur ein bestätigter Erfolg setzt das Formular zurück oder schließt es. Auch unsichere Milestone-Retries erzeugen höchstens eine Zeile.

## Kalender-Serienvertrag

Die vom Nutzer bestätigte Regel lautet: eine Serie erfüllter Kalenderzeiträume, beispielsweise mindestens zwei qualifizierte Käufe pro Woche über vier aufeinanderfolgende Wochen. Es gibt einen Bonus nach Abschluss der gesamten Serie und keine Zwischenprämien. Ein späterer Lauf kann erneut belohnt werden; kein implizites Lebenszeitlimit von einer Einlösung.

Neue Konfiguration schreibt separat:

```text
metadata.streak_mode = calendar_frequency
metadata.required_visits_per_period = 2
metadata.period_unit = days | weeks | months | quarters
metadata.required_consecutive_periods = 4
```

Ein erfolgreich bestätigter bezahlter QR-Scan zählt einen Kauf, unabhängig von der Artikelzahl. Mengenlose Scans und Offline-PIN zählen nicht. Kalendergrenzen kommen aus der Geschäftszeitzone; Wochen beginnen montags. Ein unvollständiger Zeitraum unterbricht die Serie. Die DB vergibt Bonusstempel nach Abschluss automatisch; direkte Belohnungen werden danach verdient und einmal ausgewählt/eingelöst. Alte Regeln ohne Modus werden nicht automatisch konvertiert.

Die App liest `get_streak_progress_for_partner(p_partner_id uuid)` als JSON-Array für `auth.uid()`. `series_completed` beschreibt den aktuellen Lauf; `eligible` kann eine noch nicht eingelöste Belohnung aus einem früheren Lauf betreffen. `reward_just_unlocked`, `was_reset`, `timezone` und `period_end_local` bleiben getrennte serverseitige Fakten.

## Nachweise

Gezielte echte React-19-Form-, Action-, Auth-, Refresh-, Timeout- und Race-Tests prüfen die beschriebenen Fehlerfälle. Die vollständige Suite und TypeScript-/Lint-Ergebnisse, die lokale Sichtprüfung und genaue Commit-IDs stehen im zugehörigen Übergabedokument unter `work/happy-hour-save-20261003/implementation-20261003.md` im übergeordneten Arbeitsbereich.

Zwei vorhandene Testvorlagen wurden an bestehende Produktionsverträge angepasst: Entitlement-Fixture mit erforderlicher Rolle und isolierter `PartnerDropUsage`-Import. Ihre 17 Fehler wurden zuvor mit den unveränderten HEAD-Actions reproduziert; Produktionsberechtigungen und Assertions wurden nicht gelockert.

## Gemeinsame Freigabe

DB-Arbeitskopie: `Benefitsi-Database-worktrees/happy-hour-auto-20261003`, lokale Commits `034cbd7` und `9d2aaa8`.

App-Arbeitskopie: `Benefitsi-App-publish-worktrees/happy-hour-auto-20261003`, lokale Commits `6dce134` und `29c834e`.

Reihenfolge:

1. `20261003101924_happy_hour_all_formats_automatic.sql`
2. `20261003103028_happy_hour_duplicate_guard.sql`
3. `20261003104805_streak_calendar_frequency.sql`
4. Passende Admin-Version; neue Calendar-Erstellung erst nach bestätigter DB-Migration freigeben.
5. Passende App-Version über den vorhandenen Codemagic-Workflow.

Vor der DB-Freigabe die guarded SQL-Anker gegen den aktuellen Zielstand prüfen. Ein Drift bricht die Migration ab. Der bisherige Core würde neue Calendar-Metadaten ignorieren und nach dem alten Auslöser belohnen; deshalb DB vor Admin und App.

Mindestumsatz bleibt eine Mitarbeiterprüfung, da die bestehenden Scan-RPCs keinen Bon-Gesamtbetrag erhalten. Die vorhandene Diskrepanz zwischen Legacy-Fortschrittsanzeige mit maximalem Besuchsabstand und täglichem Legacy-Prämienpfad bleibt als separate Altregel-Aufgabe bestehen. Die neue explizite Kalenderregel benutzt ihre eigene geprüfte Fortschritts- und Prämienführung.

Prüfungen nutzen bestehende Dependencies. Kein vollständiger lokaler Next-/App-Build, Simulator, zusätzliche Toolchain oder dauerhaft angelegter Modulcache. Eigene Prüfserver, Tabs und temporäre Compilerordner wurden entfernt; lokale, noch ungepushte Quellen bleiben zur Integration erhalten.
