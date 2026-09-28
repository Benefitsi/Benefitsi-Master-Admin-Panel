# Payments for orders, reservations and appointments

Prepared locally on 2026-09-22. These paths accept Stripe test credentials only. No Stripe objects, prices, products, subscriptions, webhook endpoints, payouts or remote database changes are created by preparing this code.

## Money flows

Customer → merchant connected account → merchant bank account. Benefitsi does not receive or redistribute the customer's order payment. Each Checkout Session, retrieval, expiry and refund uses the booking's immutable `stripe_account_id` as the Stripe request account. No `application_fee_amount`, `transfer_data`, or `on_behalf_of` is included. Merchant payment processing fees are collected by Stripe.

Merchant → separate Benefitsi software subscription. The monthly software Checkout uses a conventional `cus_` customer on the platform and an existing configured recurring price. It never debits the connected account's Stripe balance and never subtracts software fees from an order.

## Merchant account contract

The Accounts v2 account has `configuration.merchant.capabilities.card_payments.requested=true`, `dashboard=full`, and both `defaults.responsibilities.fees_collector` and `losses_collector` set to `stripe`. Legal entity details are supplied through Stripe onboarding; the code does not assume the merchant is a company.

Creation and verified account-status synchronization record `booking_providers.stripe_charge_model=direct_merchant`. Existing recipient-only, Express-dashboard, or platform-liability accounts fail closed and are not automatically replaced. They require a separately planned merchant re-onboarding. Responsibilities cannot be changed after the merchant configuration is added. Old provider rows with a NULL payment model cannot enable online commerce payments.

Stripe controls merchant payout eligibility and timing under this model. Benefitsi exposes no payout, balance-transfer, reserve, or bank-account-change operation. A direct-charge refund is scoped to the merchant. Benefitsi does not cover merchant refund funding or claim a guaranteed refund/payout completion time. The merchant uses the full Stripe Dashboard to manage its finances and disputes. Benefitsi remains responsible for its own platform account and software subscriptions.

Sources: [Accounts v2 responsibilities](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [recommended configurations](https://docs.stripe.com/connect/integration-recommendations), [payout controls](https://docs.stripe.com/connect/manage-payout-schedule).

## Server configuration

Do not place secrets in public environment variables or client components.

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Test secret starting `sk_test_`; live/restricted/absent secrets are rejected. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for **Connected accounts** events at `/api/stripe/webhook`. |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Separate signing secret for **Your account** events at `/api/stripe/billing/webhook`. |
| `BENEFITSI_STRIPE_CONNECT_PLATFORM_READY` | Existing platform onboarding gate; only literal `true` permits Connect onboarding. |
| `BENEFITSI_COMMERCE_ENABLED` | Only literal `true` enables commerce and authenticated merchant billing actions. |
| `BENEFITSI_BOOKING_BASE_URL` | Admin app origin; HTTPS outside localhost. Subscription callbacks and same-origin checks use this. |
| `BENEFITSI_BOOKING_WEB_ORIGIN` | Public guest booking/status origin. |
| `BENEFITSI_BOOKING_PROXY_SECRET` | At least 32 characters; server-to-server commerce proxy authentication. |
| `BENEFITSI_SOFTWARE_PRICE_ID` | Existing `price_` for an active, fixed licensed monthly EUR test price, interval count one. No fallback price or product is created. |
| `BENEFITSI_SOFTWARE_PORTAL_CONFIGURATION_ID` | Optional existing active test `bpc_` configuration; required to enable billing portal management. |

The additive commerce migration and existing booking-schema prerequisite migrations must be installed in a separate explicitly authorized environment step. This local preparation does not apply them remotely.

## Webhooks and state

Connected-account endpoint events: `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Connect events must have the expected top-level `account`. Verification uses the raw request body and signature. Live events are rejected. Payment updates require the persisted merchant, session, currency and amount; a completed but unpaid Checkout cannot confirm a booking. A partial refund cannot mark the full booking refunded. Unrelated merchant payments are ignored.

The new commerce metadata key is `benefitsi_commerce_booking_id`; the legacy key remains `benefitsi_booking_id`. Both Session and PaymentIntent receive the key. Refund lookup also supports stored PaymentIntent + merchant account when metadata is absent. Commerce transitions use `commerce_apply_payment`, leaving state and webhook replay checks in the database. A late payment for a cancelled or expired booking triggers the same idempotent merchant refund automatically; transient refund errors leave webhook delivery retryable.

Monthly software endpoint events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Only platform test events are accepted. The current subscription is retrieved before persisting status, and the customer/provider association must match `commerce_billing_customers`. Software subscriptions are not handled by the merchant-payment webhook.

Source: [Connect event scopes and account identity](https://docs.stripe.com/connect/webhooks).

## Entry points

`lib/stripe/commerce-connect.ts`: `beginCommerceOnboarding(providerId)` starts owner/admin onboarding and returns a Stripe URL. The authenticated callback at `/api/commerce/connect` checks ownership again before synchronizing merchant readiness. Account creation happens only after an explicit onboarding action.

`lib/stripe/direct-payments.ts`: `createDirectCheckout`, `retrieveDirectCheckout`, `expireDirectCheckout`, `refundDirectPayment`, `retrieveDirectRefund`. Checkout uses cards with immediate confirmation and an absolute persisted hold expiry. New commerce holds are 35 minutes; a new Stripe session needs at least 30 minutes remaining. An authoritative booking replay may repeat the identical Stripe parameters/key within the remaining hold to recover a previously created session. If creation never reached Stripe, Stripe rejects a new session with insufficient remaining time; the API still returns the saved booking/status capability so the guest can cancel. The hold is never extended. Current Stripe state is retrieved after a cached creation response. Customer/tenant ownership must be established by the caller before using these server-only helpers.

`POST /api/commerce/status` with `{reference,token,action:"resume_payment"}` authenticates the guest capability before resuming the existing booking's payment. Post-commit payment errors preserve the booking reference/token. Elapsed holds are marked expired, and a cancelled/paid booking cannot initiate another checkout. Source: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Checkout expiry](https://docs.stripe.com/api/checkout/sessions/create).

New online commerce bookings also require at least 35 minutes before the slot starts. The SQL catalog exposes per-slot `online_payment_available`; website/native capability checks combine that with the merchant and offering payment modes. Pay-on-site stays available for shorter lead times. This deliberately bounds the first version around hosted Checkout's minimum lifetime.

`lib/stripe/software-billing.ts`: `createSoftwareSubscription(providerId, ownerEmail, origin)` and `createSoftwareBillingPortal(providerId, origin)` return redirect URLs and independently require an owner/admin session. `POST /api/commerce/subscription` accepts `{providerId, action?: "portal"}` and returns `{checkout_url}`. The route rejects a mismatched Origin. Server actions can call the same helpers and redirect directly.

Software customers are created with a stable provider-specific Stripe idempotency key, stored uniquely per provider, and reused. Open Checkout Sessions are reused. Existing active subscriptions block creation of a duplicate. Completed sessions awaiting webhook synchronization stay pending rather than issuing another subscription.

Sources: [direct Checkout and merchant-scoped refunds](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted), [SaaS revenue models](https://docs.stripe.com/connect/saas).

## Local verification

Run from the admin worktree:

```sh
node --import tsx --test tests/stripe-direct.test.mjs tests/software-billing.test.mjs tests/stripe-reconciliation.test.mjs
node --conditions=react-server --import tsx --test tests/server/commerce-http.test.mjs
node_modules/.bin/tsc --noEmit --incremental false
node_modules/.bin/eslint lib/stripe app/api/stripe app/api/commerce/subscription
```

Broader existing booking tests need `BENEFITSI_WEB_ROOT` pointing at the matching web checkout with the original booking migrations. These offline tests do not prove Stripe account eligibility, configured webhook delivery, a real refund or payout, or an applied production schema. An authorized Stripe sandbox integration run remains a separate activation step.
