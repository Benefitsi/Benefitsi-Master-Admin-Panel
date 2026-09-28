# Booking notifications

The concrete Resend adapter is prepared locally. No email was sent, no Resend account/domain was configured, and no scheduler or remote migration was applied. Tests replace `fetch` with an in-memory mock.

## Configuration and entry point

`POST /api/commerce/notifications` requires `BENEFITSI_COMMERCE_ENABLED=true` and `Authorization: Bearer <BENEFITSI_NOTIFICATION_WORKER_SECRET>`. The worker secret must contain at least 32 characters and stay server-side. No browser/guest can claim or acknowledge notifications. An authorized scheduler must call this endpoint; this preparation does not create one.

For the built-in provider, configure server-only values:

| Variable | Value |
| --- | --- |
| `BENEFITSI_NOTIFICATION_PROVIDER` | `resend` (recommended explicit selection). |
| `RESEND_API_KEY` | A sending-enabled Resend key beginning `re_`. |
| `BENEFITSI_BOOKING_FROM_EMAIL` | A sender on a verified Resend domain, for example `Benefitsi <buchung@example.test>`; the example is not a deliverable address. |
| `BENEFITSI_BOOKING_WEB_ORIGIN` | Public guest website origin used for the personal status link. |
| `BENEFITSI_BOOKING_BASE_URL` | Admin origin used for the authenticated merchant portal link. |
| `BENEFITSI_NOTIFICATION_WORKER_SECRET` | A separate random worker authentication secret. |

The provider can be inferred from a complete Resend key and sender pair when the selector is absent. An explicit invalid or incomplete selection fails without falling back. With no complete provider, the route returns 503 **before claiming any outbox entries**; attempts remain intact. All origins must be valid before claiming. HTTPS is required outside local development. No key belongs in `NEXT_PUBLIC_*` variables.

Apply the additive commerce migration in a separately authorized environment step before enabling the worker. The migration includes the outbox, per-audience receipts and lease-checking RPCs. Preparing these files does not apply any remote migration. Resend domain verification, a real delivery test, scheduling and alerting are separate activation work.

## Recipients and message content

The SQL outbox holds the immutable booking and customer snapshots captured at each transition. German plain text and escaped HTML include the booking reference, service/items, quantity, Berlin local date/time, total, state and payment state. Pending payment explicitly says that online payment is not confirmed. The internal `payment.checkout_attached` event is acknowledged without sending a duplicate notice.

The **guest** address comes from `payload.customer.email`. Only that email receives the personal `/buchung/<reference>?token=...` capability link. Treat that link as a secret. The **merchant** address comes from the provider's `support_email`, and receives only `/partner/commerce?provider=<provider-id>`, requiring the merchant's authenticated session. The merchant sees the customer details needed to fulfill the booking but never the capability token. Missing/empty merchant email means guest-only delivery; add the provider email before activation if merchant email is required. A present malformed address fails the message instead of sending to an alternative recipient. The guest address is always required.

Sender identity is exclusively the configured verified sender. Customer or merchant input cannot choose `From`, add recipients, or add email headers. URLs, addresses, supported states and events are validated. Dynamic HTML content is escaped. Error responses do not include recipient addresses, tokens, Resend response bodies or API keys. A `sent` receipt means the Resend API accepted the message; it does not prove inbox delivery or opening. Bounce/delivery webhook monitoring is not part of this adapter.

## Delivery, retries and reconciliation

The worker claims at most ten Resend notifications for a five-minute lease. Each notification has at most two sequential sends, each with a ten-second timeout; this bounds network time to 200 seconds per batch, leaving time for database work within `maxDuration=300`. Expired or superseded leases cannot start or record a delivery. Database errors can still exhaust the request; the next worker invocation recovers the expired lease.

Each audience uses a deterministic Resend `Idempotency-Key`: `benefitsi-booking-<outbox UUID>-guest` or `...-merchant`. `commerce_notification_deliveries` durably stores `(notification_id, audience)`, the exact request's SHA-256 fingerprint, original `first_attempt_at`, acceptance state and Resend message ID. Only the service role can read this ledger; mutation is restricted to the RPCs. Both RPCs validate the current active outbox lease. Retry preserves the original timestamp and fingerprint. Once an audience is recorded as sent, it is skipped on every later attempt, including after configuration or template changes. Both configured recipients must be durably recorded before the outbox is acknowledged successfully. If the guest succeeds and the merchant fails, the retry sends only to the merchant.

If Resend accepts a request but the response or database acknowledgement is lost, retry uses the same key and exact request. **Resend retains idempotency keys for 24 hours.** An unresolved pending receipt aged 23 hours or more therefore stops before any HTTP request. It requires manual reconciliation; the code never resets its first attempt or invents a new key to bypass this safeguard. This is at-least-once processing with provider deduplication and durable acceptance receipts, not an unlimited provider exactly-once guarantee.

Changing the sender, provider display name/email, origins or rendered template while a receipt is pending also stops automatic delivery if the request fingerprint changes. Do not casually edit configuration to recover such a row. An authorized operator must compare the recorded first attempt, audience/key and provider message history, establish whether Resend accepted it, then reconcile the durable receipt or deliberately approve a replacement notification. Never blindly delete pending receipts or reset their timestamps. The worker does not automate that decision.

The outbox retries failed processing with its existing exponential backoff and at most eight claims. After exhaustion it stays failed; pending receipts older than 23 hours also require review. Operators should monitor failed/exhausted `commerce_notifications` and old pending `commerce_notification_deliveries`. The API returns aggregate counts; failure details stored by the generic worker are the non-sensitive `delivery_failed` code. The local code includes no provider administration/reconciliation console.

## Optional custom adapter

Set `BENEFITSI_NOTIFICATION_PROVIDER=adapter`, `BENEFITSI_NOTIFICATION_DELIVERY_URL` to a trusted HTTPS processor without embedded credentials, and `BENEFITSI_NOTIFICATION_DELIVERY_TOKEN` to its server secret. That existing integration receives the outbox ID as its idempotency key and a JSON envelope containing the snapshot, provider, guest status URL and merchant portal URL. It must enforce audience separation, durable deduplication and acceptance semantics itself. It is a trusted processor with access to personal data and the guest capability token; do not point it at a public logging or untrusted endpoint. The built-in Resend ledger applies to Resend delivery, not this optional external processor.

## Offline verification

```sh
# Admin worktree; fetch is mocked, no Resend calls.
node --import tsx --test tests/commerce-resend.test.mjs tests/commerce-delivery.test.mjs
node --conditions=react-server --import tsx --test tests/server/commerce-notifications.test.mjs
node_modules/.bin/tsc --noEmit --incremental false
node_modules/.bin/eslint lib/commerce/notification-email.ts app/api/commerce/notifications/route.ts

# Database worktree; temporary local PostgreSQL only, no linked remote project.
bash tests/commerce/run-local.sh
```

Sources: [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency behavior and 24-hour retention](https://resend.com/docs/dashboard/emails/idempotency-keys).
