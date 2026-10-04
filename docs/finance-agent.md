# Benefitsi: Buchhaltung & Steuern

Das Profil `benefitsi-finance` ist ein manueller Vorbereitungsagent. Der private M1-Prüfdienst bereitet Belegregister, Abgleichsvorschläge und offene Fachfragen vor. Ein Arbeitsregister ersetzt kein Buchhaltungssystem und bestätigt keine steuerliche Richtigkeit. Der tatsächliche Installations-/Laufstand wird separat im Auslieferungsbeleg dokumentiert.

## Aufruf

Admin: `/agents/finance`, erreichbar über Agenten und die dynamische Ökosystemübersicht. Seite, Serveraktionen und Download verlangen sowohl Admin als auch die bestehende `financeRead`-Berechtigung aus `get_my_analytics_permissions_v1`. Fehler oder fehlende RPC-Rechte sperren den Zugriff; `is_admin` ersetzt die Finanzberechtigung nicht. Die gemeinsame Admin-Shell wird nicht geändert.

Auf dem M1 mit der vorhandenen Hermes-Runtime:

```sh
/Users/patrick/.hermes/hermes-agent/venv/bin/hermes -p benefitsi-finance chat \
  --in /Users/patrick/.hermes/profiles/benefitsi-finance/workspace \
  --oneshot --max-turns 6 --run-budget 45 \
  -q 'Lies finance_status und führe den beauftragten Einrichtungscheck aus. Nenne Lauf-ID, Ergebnis und fehlende Unterlagen.'
```

Der lokale Dienst ist auch ohne Modellstart nutzbar. Sein stdin akzeptiert ausschließlich fest definierte JSON-Aktionen:

```json
{"schemaVersion":1,"profile":"benefitsi-finance","action":"finance-status"}
```

Für `finance-run` zusätzlich `task: "setup" | "review"` und eine neue UUID in `requestId` angeben. Bei unklarem Transportausgang dieselbe UUID erneut verwenden. Ein anderer Eingang oder geändertes Original benötigt eine neue UUID. `finance-export` benötigt `runId` und `format: "json" | "csv"`. CLI auf dem M1: `/Users/patrick/.hermes/hermes-agent/venv/bin/python -B /Users/patrick/.hermes/profiles/benefitsi-finance/runtime/finance_cli.py`. Bridge: bestehendes `/hermes/finance` mit vorhandener Serverauthentifizierung; keine eigenen URLs, Pfade, Prompts, Modelle oder Befehle im Request.

Hermes verwendet ausschließlich die zwei eigenen MCP-Tools `finance_status` und `finance_prepare`, dazu seine lokale Skillanzeige. Ben-MCP, Bankzugriff, ELSTER, Produktdaten-Schreibrechte und Drittkommunikation sind nicht angebunden. Der vorhandene MiniMax-Modellzugang wird bei ausdrücklicher Installationsoption ausschließlich als `MINIMAX_API_KEY` in die private native Profilumgebung übernommen; keine Ben-, Datenbank-, Bank- oder Bridge-Credentials. Der globale Auth-Store-Fallback deckt den nur in `.env` vorhandenen MiniMax-Key nicht ab. Private Inhalte werden ausschließlich lokal verarbeitet; das MCP gibt keine Belegtexte, Anbieter, Beträge, Bankdaten oder individuellen Fristen an das Modell weiter.

## Privater Eingang

Profilwurzel: `/Users/patrick/.hermes/profiles/benefitsi-finance`. `private/` und seine Unterordner haben Modus 0700, Arbeitsdateien 0600. Leeres `private/manifest.json` ist eingerichtet, ohne synthetische Rechnungen oder angenommene Istwerte. Der Eigentümer stellt bis zu 20 Originale unter `private/inbox/` bereit und trägt die Metadaten im Manifest ein. Symlinks, absolute Originalpfade und Traversal werden verweigert; Originaldateien werden niemals beschrieben oder gelöscht.

Das vorhandene `Benefitsi-Finanzstarter.xlsx`, die vorhandene Finanz-SOP und der datierte historische Gründungsplan werden inventarisiert. Pfade und SHA-256 bleiben im privaten Prüfbericht. Sie dienen als Vorlage bzw. Kontext; die historische Planung bestätigt keinen aktuellen Unternehmensstand. Ein bestehender Stripe-Codevertrag oder seine Gründungssperre bestätigt ebenfalls weder heutigen Unternehmensstatus noch Zahlungseingänge. Es wird keine neue Buchhaltungssoftware bestellt.

Manifest-Felder:

| Feld | Bedeutung |
| --- | --- |
| `schemaVersion` | Genau 1 |
| `company` | `legalForm`, `taxResidence`, `formationStatus`, `taxRegistration`, `accountingSystem`; jeweils `{value, evidenceDocumentId, reviewedBy}`. Land und steuerlicher Sitz werden nicht aus einem Projektstandort angenommen. Ohne vorhandenes Original und dokumentierte Prüfung bleibt der Einrichtungsstatus offen. |
| `documents` | Höchstens 20 Einträge: eindeutige `id`, relativer `path`, `kind`, `vendor`, `invoiceNumber`, `date`, dezimaler String `amount`, ISO-`currency`, `direction` (`income`/`expense`). Finanzarten: `invoice`, `credit`, `receipt`; weitere Nachweise: `formation`, `tax_notice`, `accounting_setup`. Für Gutschriften Betrag mit negativem Vorzeichen in der ursprünglichen Aufwands-/Ertragssphäre. Fehlende Felder bleiben null. `netAmount`/`taxAmount` werden nur bei expliziten Belegwerten rechnerisch verglichen, ohne Steuersatzannahme. Ein sonstiger Beleg ohne Nummer benötigt `numberException`. |
| `payments` | Höchstens 200 Einträge: `id`, `documentId`, vorzeichenbehafteter dezimaler String `amount` (Auszahlung negativ), `currency`, `date`, `sourceReference`. Die Referenz soll Kontoauszug und eindeutige Zeile/Transaktion bezeichnen. Gleiche Referenz/Datum/Währung/Betrag werden als mögliche Kopien zurückgehalten. |
| `balances` | Höchstens 12 Währungen, je `currency`, `opening`, `closing`; fehlende Werte null. Die Rechenbrücke bezieht sich ausschließlich auf bereitgestellte Zahlungen. Vollständigkeit, Zeitraum und unabhängige Kontoauszüge bleiben fachlich abzugleichen. Leere/ungültige Zahlungslisten erzeugen keinen angenommenen Nullumsatz. |
| `deadlines` | Höchstens 50 bestätigte Einträge: `id`, `title`, `dueOn`, amtliche `sourceUrl`, vorhandene `evidenceDocumentId`, `reviewedBy`. Ohne Nachweis/Fachprüfung keine individuelle Frist. Es gibt keinen Fristenscheduler. |

Die Betragswerte sind explizit bereitgestellte Metadaten, keine OCR-bestätigten Extraktionen. Es gibt noch keinen Postfach-, Bank-, Stripe- oder Buchhaltungssoftwareimport. Eine Rechnung/Gutschrift benötigt ihre Rechnungsnummer; unvollständige Einträge erzeugen Prüfausnahmen. Dateihash und Anbieter/Nummer erkennen mögliche Dubletten; Rechnung plus Zahlungsbeleg kann denselben Vorgang beschreiben. Ungeklärte Gruppen fließen nicht doppelt in vorläufige Summen. Zahlungszuordnungen sind Vorschläge und berücksichtigen Vorzeichen, Währung und Teilzahlungen. Kein Wechselkurs wird erfunden.

## Ergebnisse und Status

Jeder echte Aufruf erhält UUID, Aufgabenart, UTC-Start/Ende und Eingangs-SHA. `private/runs/<UUID>/` enthält `report.json`, `review.csv` und zuletzt `summary.json`. Dateien werden exklusiv und atomar erstellt; vorhandene Berichte nicht überschrieben. Nach einem Abbruch zwischen Bericht und Summary kann derselbe Auftrag die fehlenden Exportdateien vervollständigen. Ein unvollständiger Lauf wird nicht als fertiger Lauf angezeigt oder exportiert. Originale müssen zur archivierten Hashliste passen, bevor dieselbe Anfrage wiederverwendet wird.

- `blocked`: Der Check ist tatsächlich ausgeführt, aber Unternehmensnachweise oder ein verwendbarer Belegsatz fehlen.
- `needs_review`: Die Arbeitsunterlagen wurden erstellt; geschäftliche/steuerliche Prüfung steht aus.
- Kein Lauf: Startbare Konfiguration ohne behauptete Ausführung.
- Fehler: Aktueller Aufruf konnte nicht bestätigt werden; letzte datierte Beobachtung wird nicht als neuer Erfolg ausgegeben.

JSON enthält Metadaten, private Quellenherkunft, Ausnahmen, Zuordnungsvorschläge, Währungssummen und Abgleich. CSV ist ein gegen Formelinjektion geschütztes Belegregister. Beides sind Prüfunterlagen, kein endgültiges DATEV-/Buchungspaket. Originalbelege bleiben privat und müssen einer vereinbarten Fachübergabe separat zugeordnet werden. Keine automatische Kontierung, finale Steuerentscheidung, Zahlung, Erstattung, Meldung oder Kommunikation mit Finanzamt/Beratung.

## Amtliche Grundlagen

Geprüft am 04.10.2026: [GoBD, AO-Handbuch 2026, insbesondere Rz. 30–35, 100–111](https://amtliche-handbuecher.bundesfinanzministerium.de/ao/2026/Anhaenge/BMF-Schreiben-und-gleichlautende-Laendererlasse/Anhang-33/inhalt.html), [ELSTER-Gründungshinweise](https://www.elster.de/elsterweb/infoseite/unternehmensgruendung), [BMF-E-Rechnungs-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html). Die daraus abgeleitete Checkliste fragt Nachvollziehbarkeit, Originalerhalt, dokumentierte Änderungen, steuerliche Erfassung und E-Rechnungsempfang ab. Individuelle Verpflichtungen/Fristen werden erst nach bestätigtem Sachverhalt und aktueller qualifizierter Prüfung eingerichtet.

## Installation und Rücknahme

`install_profile.py` verwendet die native Hermes-Profilverwaltung und erstellt ausschließlich `benefitsi-finance`, ohne Aliase, Ben-Konfigurationsklon oder Scheduler. Vorhandenes gleichnamiges Profil verweigert die Neuinstallation. Mit `--reuse-existing-model-auth` wird ausschließlich der vorhandene globale MiniMax-Modellkey in die profilprivate Umgebung übernommen. Ein vorhandener Profilcredentialbestand wird dabei nicht überschrieben. `install_bridge.py --expected-sha256 <geprüfter SHA>` sichert den bestehenden Bridge-Quellstand und ergänzt ausschließlich den authentifizierten Finanzpfad; Struktur- oder SHA-Abweichung bricht ab. Keine neue Listener- oder LaunchAgent-Instanz. Der vorhandene Bridge-Dienst muss nach geprüfter Installation kontrolliert den neuen Code laden.

Die existierende Observer-Registry wird um dieses Profil erweitert und separat gesichert. Ein einmaliger bestehender Collector-Publish erzeugt einen frischen, bereinigten Profil-Snapshot. Der deaktivierte Observer-Zeitplan wird nicht stillschweigend aktiviert. Der Finanz-Arbeitsbereich liest seine tatsächlichen Laufnachweise direkt über die Bridge, auch wenn der allgemeine Profil-Snapshot später veraltet.

Rücknahme: ausschließlich gesicherten Bridge-Stand und gesicherte Observer-Registry wiederherstellen, die eigene Finance-Service-Datei entfernen und den vorherigen Dienstzustand kontrolliert wieder laden. Profil und private Berichte zunächst erhalten; vor Entfernung benötigte Unterlagen exportieren. Keine anderen Profile, Services, Credentials oder Quellen ändern.
