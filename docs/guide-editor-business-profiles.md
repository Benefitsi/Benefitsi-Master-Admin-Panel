# Guide-Inhalte und redaktionelle Betriebsprofile

Der zentrale Stadteditor bearbeitet vollständige Guide-Blöcke und Quellenmetadaten. Neue Textabschnitte lassen sich als Text, Information, Tipp oder Hinweis anlegen, ordnen und entfernen (mit Rückgängig). Vorhandene Zeitpläne, Fakten und Verknüpfungen werden vollständig bewahrt. Quellenprüfung hat ein tatsächliches Prüfdatum; ein Datum ohne Uhrzeit bleibt ein Datum.

Speichern verwendet unverändert ausschließlich `save_city_content_draft_atomic`. `blocks` und `source_meta` sind die einzigen neuen Guide-Payloadfelder. Der Server validiert Typen, Größen, eindeutige Block-IDs und sichere Markdownlinks; geänderte Evidenz erhält `verificationStatus: NEEDS_REVIEW`. Das ersetzt keinen Reviewstatus. `expectedUpdatedAt`, atomare Audit-/Queue-Erstellung und veröffentlichte Snapshots bleiben erhalten. Alte Formulare, die die neuen Felder nicht senden, löschen sie nicht.

Unter „Orte & Betriebsprofile“ sind zusätzlich Lebensmittel/Nahversorgung (`grocery`), Einzelhandel (`shopping`), Gesundheit/Apotheke (`health`), Dienstleistungen (`service`) und Gastronomie (`food`) auswählbar. Die bestehenden fünf Ortskategorien bleiben verfügbar. Quellen, Adresse und Website nutzen bestehende Felder. `partner_id` ist weiterhin kein bearbeitbares Ortsfeld: recherchierte Betriebe sind dadurch keine bestätigten Benefitsi-Partner.

## Abhängigkeiten und Veröffentlichung

- Branch basiert auf Admin PR24 `232c002419c8023b9f09486e2a8f2435ba1368d6`; dieses enthält den erforderlichen atomaren Speicherpfad. Zum Start war `origin/main` noch `161075e`.
- Vor Freigabe dieser Admin-Oberfläche ist DB-Migration `20260920143000_guide_editor_business_profiles.sql` erforderlich. Sie liegt im separaten Database-Branch `codex/annweiler-editor-20260920` auf `99fc8a1`.
- Web konsumiert unveränderte camelCase-Blocks und `source_meta`. TEXT-Inhalte enthalten Absätze und Markdownlinks; der Webrenderer muss sichere Links selbst prüfen. Der alleinige Publikationsvertrag bleibt öffentlicher Loader plus Review/Published Snapshot, nicht `source_meta.verificationStatus`.
- Kein Home-Konfigurationseditor, keine automatische Guide-/Betriebsdaten-Übernahme und kein neuer Agentlauf sind enthalten.
- Kein Deployment oder gehosteter Datenbankschreibzugriff wurde ausgeführt. Angemeldete Browserabnahme im qualifizierten Stage-Paar steht vor einer Veröffentlichung noch aus.

## Lokale Prüfung

`npm test`, `npx tsc --noEmit`, ESLint für die geänderten TypeScript-Dateien. Verhaltenstests prüfen den realen Server-Action-Payload, abgewiesene Blockdaten, Quellennormalisierung, unveränderte Partnergrenzen sowie Hinzufügen/Ordnen und Bewahren komplexer Blöcke im echten React-DOM. Die acht vorbereiteten Annweiler-Guide-Payloads wurden separat gegen denselben Validator geprüft.
