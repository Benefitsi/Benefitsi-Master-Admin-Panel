# Buchhaltung & Steuern: Funktionsnachweis vom 04.10.2026

Das native M1-Hermes-Profil `benefitsi-finance` ist installiert und manuell nutzbar. Die Admin-Erweiterung liefert den privaten Arbeitsbereich unter `/agents/finance`; ihr Git- und Produktionsstand wird beim Abschluss ergänzt. Der erste Einrichtungscheck ist wirklich ausgeführt und wegen fehlender aktueller Eingänge fachlich blockiert.

## M1-Nachweise

| Prüfung | Ergebnis |
| --- | --- |
| Native Profilwurzel | `/Users/patrick/.hermes/profiles/benefitsi-finance` auf dem vorhandenen M1 |
| Native Hermes-Sitzung | `20261004_223124_73407e`, Profil `benefitsi-finance`, Modell MiniMax-M3.0, Exit 0 |
| Tatsächlicher Toolaufruf | `mcp__benefitsi_finance__finance_status` in den eigenen Sitzungsmetadaten bestätigt |
| Enger MCP | Nur `finance_status` und `finance_prepare`; Status liefert den startbaren lokalen Prüfdienst |
| Authentifizierte Bridge | Vorhandener `/hermes/finance`-Pfad führt den Check aus; unauthentifizierter Aufruf HTTP 401 |
| Aktueller Einrichtungscheck | Lauf `312ebe00-2741-4332-a44f-2cf9e82058ee`, beendet `2026-10-04T20:35:01.567099Z`, Status `blocked` |
| Eingänge | 0 Belege, 0 Zahlungen; keine angenommenen Beträge oder individuellen Fristen |
| Vorhandene Quellen | Finanzstarter, Finanz-SOP und historischer Gründungsplan vorhanden und privat mit Dateihash inventarisiert |
| Bank / Buchhaltung / Stripe | Jeweils ausdrücklich `not_connected` |
| Private Dateien | `private/` 0700, Arbeitsberichte und Profilumgebung 0600; sieben installierte Dateien passen zum Installationsbeleg |
| Modellzugang | Ausschließlich bestehender globaler `MINIMAX_API_KEY` im eigenen Profil; keine Produkt-, Ben-, Bank-, DB- oder Bridge-Credentials kopiert |
| Observer-Snapshot | Einmalig publiziert `2026-10-04T20:36:57Z`, privat in Supabase zurückgelesen, empfangen `20:36:58.412003Z`; Profil `benefitsi`, Automation `manual` |
| Dauerbetrieb | Kein neuer Scheduler, Gateway oder Listener; der vorhandene deaktivierte Observer bleibt deaktiviert |

Private M1-Belege: `installation-receipt.json`, `first-run-receipt.json`, `current-setup-receipt.json` und `verification-receipt.json` im Profil. Der Funktionsbeleg wurde am `2026-10-04T20:46:06.904352+00:00` erstellt. Die bestehende Bridge wurde vor Ergänzung nach geprüftem SHA gesichert unter `/Users/patrick/.arc-m1-bridge/m1_bridge.before-finance-20261004T202238Z.py`; die Observer-Registry besitzt ebenfalls eine eigene Sicherung. Alte Laufunterlagen bleiben erhalten.

## Gezielte Validierung

- 25 Python-Tests lokal und mit der bestehenden Hermes-Python-Runtime auf dem M1 bestanden: unbekannte Werte, echte Nullwerte, Vorzeichen/Währungen, Teilzahlungen, Rechnungs-/Zahlungsdubletten, private Pfade, Originalerhalt, Export und Wiederaufnahme, Bridge-Auth, enger Modellzugang.
- 82 Node-Tests für Finanzvertrag, bestehende Agentensteuerung und die neue Übersicht samt Navigation, Suche und Streaming-Komponenten bestanden. Finanzzugriff verweigert ohne Admin und `financeRead`; Downloads und Starts prüfen dies selbstständig.
- ESLint auf geänderten TypeScript-Dateien und `tsc --noEmit --incremental false` bestanden. Kein großer lokaler Build und keine zusätzliche Toolchain.
- Unabhängige Codeprüfung nach Korrekturen: keine verbleibenden konkreten P1/P2-Befunde, einschließlich des zuletzt ergänzten Steuerland-Checks und des begrenzten Modellzugangs.

## Für die fachliche Arbeit noch benötigt

Die tatsächlich betreute Gesellschaft mit Rechtsform, Land/steuerlichem Sitz und aktuellem Gründungsstand; Nachweise der steuerlichen Erfassung; bestehende Buchhaltungssoftware, Belegablage und fachliche Zuständigkeit; freigegebene Originalbelege mit Metadaten; echte Zahlungsnachweise und Anfangs-/Schlussbestände. Individuelle Fristen und steuerliche Einordnung benötigen eine bestätigte Grundlage und qualifizierte Prüfung. Es wurden keine finalen Buchungen, Zahlungen, Steuererklärungen oder Nachrichten an Dritte ausgeführt.
