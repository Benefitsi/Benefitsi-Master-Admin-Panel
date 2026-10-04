# Onboarding beim Partnerbesuch

Im Admin: **Partner → Partner auswählen → Partnereinstellungen → Tarif & Module**.
Der Bereich „Onboarding für den Partnerbesuch“ liegt direkt unter der Tarifübersicht.

1. Partner und Microsite im Builder prüfen und die vorgesehene Version veröffentlichen.
2. Im Tarifbereich Anlass eintragen, 7/14/30 Tage wählen und manuell starten.
3. Die öffentliche Microsite ansehen oder nach neuem Laden über die Städteseite öffnen.
4. Bei Bedarf verlängern oder den Bereich „Onboarding vorzeitig beenden“ aufklappen.

Standard sind 14 Tage ab Start. Jeder Tag entspricht 24 Stunden; Enddaten werden
in Berliner Zeit gezeigt. Verlängerungen beginnen am bisherigen Ende. Die
kostenlose Pro-Freigabe endet automatisch und wird nicht kostenpflichtig.
Veröffentlichte Inhalte bleiben gespeichert, Free-Stadtprofile bleiben verfügbar.

Die vorhandene manuelle Pro-Testfreigabe wird als Onboarding angeboten. Es werden
keine Partner automatisch gestartet. Kostenpflichtige Abos, offene Abrechnungen
und Freigabesperren können durch diesen Bereich nicht umgangen werden.

Deployment-Reihenfolge: Datenbankmigration `20261004084844_partner_onboarding_trial.sql`
zuerst, dann Admin. Die Städteseite verwendet bereits den passenden dynamischen
öffentlichen Microsite-Zugang. Tests: `node --test tests/partner-plan-actions.test.mjs tests/partner-onboarding-ui.test.mjs`.
