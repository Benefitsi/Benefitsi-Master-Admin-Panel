# Corporate annual billing adapter (test-only)

This adapter uses the Benefitsi Berlin annual period ledger, Checkout Setup and
standalone auto-collected Invoices. It does not create Stripe Subscriptions or a
second annual clock. Existing Booking, Partner and private payment routes remain
separate. The common `getStripeTestClient` still requires `sk_test_`.

## Runtime configuration

No values are supplied by the migration or this implementation. Required:

- `BENEFITSI_CORPORATE_BILLING_ENABLED=true`
- `BENEFITSI_CORPORATE_STRIPE_ACCOUNT=acct_1T3ZuLH0Ev7iKGq0` (the explicitly selected sandbox)
- `STRIPE_SECRET_KEY` from existing server configuration, test key only
- `BENEFITSI_CORPORATE_WEB_ORIGIN`: approved HTTPS origin, no path
- `BENEFITSI_CORPORATE_PROXY_SECRET`: distinct internal Web→Admin secret, ≥32 characters
- `BENEFITSI_CORPORATE_WORKER_SECRET`: worker bearer secret, ≥32 characters
- `STRIPE_CORPORATE_WEBHOOK_SECRET`: dedicated Corporate webhook signing secret
- normal Supabase URL/publishable key plus server-only service-role configuration
- `BENEFITSI_CORPORATE_PROVIDER_POLICY_EVIDENCE` and
  `BENEFITSI_CORPORATE_REQUIRED_NOTICES_EVIDENCE`: references to the actually
  reviewed recipient/mandate/recovery and annual notice policy

`corporateReadiness` reports configuration only; reference strings do not prove
legal approval, notice delivery or account settings. Live mode is unsupported.
The accepted DB profile separately requires exact issuer, tax, release and
recipient snapshots. Actual existing exclusive TaxRate is read and checked;
there is no default VAT rate or automatic-tax activation. This adapter obtains
Stripe original PDF files. XML/ZUGFeRD invoice creation stays blocked without a
separately approved structured original adapter; existing genuine attached
structured documents can still participate in read-only reconciliation.

Optional notifications require `BENEFITSI_CORPORATE_NOTIFICATION_PROVIDER=resend`,
`RESEND_API_KEY`, and authorized `BENEFITSI_CORPORATE_FROM_EMAIL`. Disabled transport
makes no claim and sends nothing. Immutable DE/EN messages use the DB created_at
as issued time, a notification-ID idempotency key and current-recipient admission.
Ambiguous requests remain bounded to23hours; Resend409 requires review. `sent`
means provider accepted, never delivered. Portal receipts remain independent.

## HTTP and operation authority

POST `/api/corporate/billing/setup`, `/status`, `/recovery` use both the original
Supabase bearer JWT and `x-benefitsi-corporate-proxy-secret`, with the approved
Origin. The authenticated publishable-key client executes owner RPCs; no service
impersonation or browser provider/customer/user reference is accepted. Owner and
context are reread after provider waits before a Checkout/Invoice URL is exposed.

The exact consumer HTTP body/status protocol is in the workspace's shared
`work/corporate-annual-20261023/recurring-contract.md`, Task2-owned section.
POST `/worker` uses its own bearer secret and body `{}`. It materializes/sweeps at
most one candidate, reconciles known provider references, claims one operation,
and sends at most one authorized notification. Provider reads failing do not
prevent an already queued protective pause from being attempted.
POST `/webhook` validates the raw body using the dedicated signing secret, then
reads current objects and a narrow known-invoice/payment/charge DB context.
Webhook payloads and redirects are never payment proof. Setup completion enqueues
only its known fresh verify_setup operation. No generic private-table access.

Each SDK call has zero automatic network retries and an8second timeout. Financial
operations have a45second local budget within the120second database lease. Every
write uses stable operation/request/step keys and fresh admission. Unknown create
outcomes older than23hours require review. Draft/finalize use auto_advance=false;
one initial pay attempt is followed by same-invoice provider recovery. Updating a
method changes the dedicated Customer default, never an Invoice override. Full
Invoice/lines/InvoicePayments/PI/Charge/refund/dispute evidence and a genuine bound
document gate paid access. Actual failed/processing/partial outcomes stay distinct.

Invoice contact is historical; current Setup can activate a verified new contact
for future invoices. Old invoice contact is never rewritten. Protective pause
only writes auto_advance=false on the bound invoice, rereads false and records
its own leased result. Money evidence always uses the ordinary create/sync context.
Already paid completion and awaiting_setup are terminal admissions granting no
additional network authority. A blocked old invoice never automatically re-enables.

## Separate release evidence

No actual provider operations, hosted E2E, real recipients, charges or deployments
are established by controlled tests. Sandbox invoice receipts being suppressed
is not proof that all emails are suppressed. Provider in-flight/autonomous work
cannot be recalled; Recipient/CC controls must be verified for the deployed API generation. The
June SDK boundary does not prove the preview API's additional_emails behavior. Keep mandatory SEPA notifications enabled and delayed payment semantics.
Our own annual clock does not inherit native Subscription reminders. Required
Mastercard annual notices7–30days before renewal need actual verified delivery
policy; a staged outbox row or portal receipt is not that proof. The operative
issuer/tax/structured-invoice/legal release gate remains separate.
