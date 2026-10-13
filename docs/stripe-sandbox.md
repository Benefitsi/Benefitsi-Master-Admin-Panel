# Isolierte Stripe-Sandbox für Benefitsi

Stand 13.10.2026: Code und lokale echte Integration geprüft. Noch keine veröffentlichte Sandbox-Buchungsstrecke; dauerhafter Serverkey und getrennte Testbereitstellung fehlen.

## Konten und Betriebsbereiche

Freigegeben ist ausschließlich `acct_1T3ZuLH0Ev7iKGq0` (Benefitsi UG Sandbox). Der vorhandene synthetische Händler `acct_1UKEA1H0EvbJQfqS` hat ein vollständiges Dashboard, Stripe als Gebühren-/Verlustverantwortlichen sowie aktivierte Testzahlungen. Das ersetzt weder echte Händler-KYC noch eine UG-Aktivierung.

Der bisherige `STRIPE_SECRET_KEY` und historische Buchungen bleiben getrennt. `STRIPE_SANDBOX_SECRET_KEY` darf ausschließlich ein Testkey sein. Der verwendete Client bestätigt über `/v1/account` die exakte Konto-ID und über `/v1/balance` den Testmodus, bevor Stripe-Mutationen möglich sind. Ein bloß gesetzter Key ist noch keine Verbindung.

Für neue Sandbox-Buchungen müssen `BENEFITSI_STRIPE_BOOKING_REALM=sandbox`, `VERCEL_ENV=preview` und die feste Staging-URL `https://klfaqrrbigjtcgrslkkl.supabase.co` zusammenpassen. Anbieter und Händler brauchen ausdrückliche ID-Listen. Unbekannte Bereiche, andere Datenbanken und fremde persistierte Anbieterzuordnungen werden vor DB-/Stripe-Mutationen zurückgewiesen. Abwesender Bereich bzw. `legacy` bewahrt den bisherigen Weg.

## Konfiguration

| Variable | Zweck |
|---|---|
| `STRIPE_SANDBOX_SECRET_KEY` | Ausschließlich verschlüsselte Servervariable; nie im Repository, Chat oder Browsercode. |
| `BENEFITSI_STRIPE_SANDBOX_READY=true` | Separate Sandboxfreigabe; verändert den bisherigen UG-/Plattformstatus nicht. |
| `BENEFITSI_STRIPE_EXPECTED_ACCOUNT_ID=acct_1T3ZuLH0Ev7iKGq0` | Exakte eigene Kontobindung des verwendeten SDK-Clients. |
| `BENEFITSI_STRIPE_BOOKING_REALM=sandbox` | Nur für isolierte Staging-Preview, nicht für Production. |
| `BENEFITSI_STRIPE_SANDBOX_PROVIDER_IDS` | Ausschließlich die neu kontrolliert angelegte synthetische Fixture. |
| `BENEFITSI_STRIPE_SANDBOX_MERCHANT_IDS=acct_1UKEA1H0EvbJQfqS` | Begrenzte Händlerzuordnung. |
| `STRIPE_SANDBOX_WEBHOOK_SECRET` | Eigener Signaturschlüssel des Sandbox-Connect-Endpunkts; kein Legacy-Key. |

Das Sandbox-Dashboard zeigt Konfiguration, fehlende Bestätigung und tatsächlich bestätigtes Konto getrennt. Die Verbindung allein aktiviert keine normalen Anbieter, Kunden oder Commerce-Entitlements. Softwareabos und allgemeine Anbieteranlage sind im isolierten Sandboxbereich gesperrt.

## Abnahme

151 gezielte Adminregressionen sowie 13 native PostgreSQL-Admission-/Setup-/Rollback-/ACL-Tests bestanden. Weitere sechs native SQL-Tests prüfen Tischkapazität/Überschneidungen, Termine und Puffer, die 35-Minuten-Grenze sowie verspätete Zahlung nach Ablauf. Zwei Tests belegen Cleanup auf Fehler/Timeout. ESLint und frische strikte Typprüfung aller geänderten TS-/TSX-Dateien einschließlich ihrer Imports bestanden. Die komplette lokale Typprüfung trifft drei fehlende, unveränderte lokale Dependencies (`leaflet`, `onnxruntime-web/webgpu`); Cloud-CI installiert den bestehenden Lockfile-Stand.

Eine echte lokale HTTP-Abnahme verwendete die tatsächlichen Staging-Commerce-Funktionen in einem temporären PostgreSQL-Cluster und echte Stripe-Sandbox-API-Aufrufe. Sie prüfte Proxy-Autorisierung, DB-Preis, Idempotenz und Kapazität, Partnerstatus, Lieferzone/-gebühr, echten Checkout mit Browser-Testkarte, echte Kartenablehnung, signierte Stripe-Webhooks, Replay/Manipulation, Sessionablauf, Storno und vollständigen Testrefund samt Refund-Replay. Die Testzahlung von 5 EUR wurde vollständig erstattet, offene eigene Sessions geschlossen und alle temporären Prozesse/DB-Dateien entfernt. Es wurden keine Kundennachrichten versandt.

Dieser Test substituiert den Supabase-Transport durch einen lokalen PG-Adapter. Er bestätigt keine bereitgestellte Supabase-REST-/Auth-/Web-Strecke. Die fremden produktiven Partner, Buchungen, Entitlements und Freigabeflags wurden nicht geändert.

## Noch offen vor einem benutzbaren Testlink

1. Dauerhaften Key der freigegebenen Sandbox sicher serverseitig hinterlegen; die lokale CLI-Anmeldung läuft am 26.10.2026 ab und wird nicht als Deployment-Key verwendet.
2. Getrennte branchgebundene Staging-Preview mit echten Staging-Credentials/Operatorauth und passenden Proxy-/Web-Origin-Werten konfigurieren.
3. Den gesonderten, vorab geprüften Staging-Fixture-Entwurf bewusst auf genau `klfaqrrbigjtcgrslkkl` anwenden: ein synthetischer Partner/Provider, vier Stunden, maximal 20 neue Buchungen. Er verwendet klar markierte Testpreise und legt weder bezahlte Abos noch geprüfte Betriebskostennachweise an. Normale kommerzielle Entitlements bleiben unverändert.
4. Eigenen dauerhaften Connect-Webhook einrichten und die veröffentlichte Browser→Web→Admin→Supabase→Stripe-Strecke inklusive Händlerportal erneut abnehmen.

Die Produktionsfreigaben sind tatsächlich geschlossen. Ohne diese Schritte darf die Oberfläche keine veröffentlichte Buchungsbereitschaft behaupten.

Quellen: [Stripe Sandboxes](https://docs.stripe.com/sandboxes), [Stripe Tests](https://docs.stripe.com/testing), [Accounts v2](https://docs.stripe.com/connect/accounts-v2).
