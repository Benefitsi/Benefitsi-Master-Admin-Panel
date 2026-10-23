# Recurring employer administration

The company detail page uses authenticated company/contract reads and the bounded
invoice archive. Original first-year values remain historical. Current funding,
materialized next period and the nonbinding renewal preview are separate. The
legacy first-year payment editor requires a successful nonrecurring-contract read.
Owner acceptance and payment Setup stay in the employer portal.

`admin_get_corporate_billing_operations` exposes the latest 20 safe rows plus
company-wide counts. `due` is time eligibility, not execution authority or worker
health. Older review/awaiting-Setup holds remain counted. `infinity` remains an
opaque value with a nonfinite label. No Admin worker-start, generic retry or
force-paid operation is exposed.

External cancellation first hashes the supplied original evidence bytes and
registers the exact real receipt timestamp and immutable private archive reference.
The original must already be immutably held at that reference; this UI does not
upload cancellation originals. Only the registered evidence is then evaluated
with `requested_end:null`. Recording time never replaces receipt time. IDs and
full payload remain frozen on ambiguous responses. Current Admin admission is
rechecked by every server action and by the producer; there is no invented
expected-version cancellation gate that would break successful-response replay.

Period originals are private, at most 4 MiB, PDF or opaque UTF-8 XML. XML with
DOCTYPE/ENTITY declarations is rejected; no XML rendering or local EN16931
certification occurs. Raw PDFs are never relabeled as ZUGFeRD. Uploads use actual
byte hashes and `upsert:false`. An uncertain upload is reconciled by the existing
attachment RPC using the same path/document ID/hash/size/format/invoice/source and
version. SQL checks managed Storage size/MIME, custom hash metadata, company,
period, invoice and profile. This does not claim a fresh byte download of an
unbound object; no service fallback or Storage policy change is introduced.
Unconfirmed attachment stays unconfirmed. Downloads reread the authorized archive
and sign only its actual bound document for 60 seconds with download disposition.

Profiles and full DE/EN terms are explicit drafts with no operator/tax defaults.
Only genuine approved evidence can support immutable publication. New terms apply
globally to future company acceptances; old acceptances retain their old version.
Runtime configuration, immutable references and portal receipts do not prove legal
approval, provider/account policy, notice delivery or structured-invoice validity.

Current actual native consumer provenance: tests/fixtures/corporate-recurring/
current-provenance.json. The older native.json/provenance.json remain historical
Task2 evidence. New tests are included by the existing Corporate CI wildcard.
Local SSR/handler/transport proof does not establish comprehensive DOM or hosted
payment E2E. Public Admin publication requires explicit human approval of the
concrete final source payload. No live configuration or release is performed here.
