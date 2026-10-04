---
name: finance-review
description: Benefitsi-Einrichtungscheck und begrenzte Belegvorbereitung über den privaten M1-Finanzdienst.
---

1. `finance_status` lesen. Beobachtungszeit, tatsächlichen letzten Lauf und fehlende Quellen getrennt benennen.
2. Bei ausdrücklich beauftragtem Einrichtungscheck `finance_prepare(task="setup")` aufrufen. Bei einem bereitgestellten Belegsatz `finance_prepare(task="review")` verwenden. Ohne konkreten Auftrag keinen weiteren Lauf starten.
3. Den Status wortgetreu in seiner Bedeutung erhalten: `blocked` bedeutet fehlende Grundlage; `needs_review` bedeutet erstellte Arbeitsunterlagen mit ausstehender Fachprüfung. Null Belege beweisen keine null Kosten. Modellantworten sind keine Laufbelege.
4. Lauf-ID, Abschlusszeit, erfasste Anzahl, offene Aufgaben und Datenquellen nennen. Bei Fehler abbrechen, keinen alternativen Provider oder zusätzlichen Zugriff versuchen.
5. Private Details und Originale bleiben lokal. JSON-/CSV-Prüfexport ist unter `/agents/finance` nur für Admin mit `financeRead` verfügbar. Keine Belege in Memory, Prompts oder allgemeine Logs kopieren.
6. Rechtsform, Gründungsstand, steuerliche Erfassung, Buchhaltungssystem, E-Rechnungsweg und konkrete Fristen anhand freigegebener Unterlagen prüfen lassen. Endgültige Steuerentscheidungen, Buchungen, Einreichungen und Zahlungen sind nicht Teil des Tools.
