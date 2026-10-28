# Subscriptions

## Business model

Subscription only. No permanent free transactional plan.

| Plan | Price (India, **provisional**) |
|---|---|
| Monthly | ₹199 / month |
| Yearly | ₹1,799 / year (saves ₹589 vs monthly) |

Configured in `packages/billing/src/plans.ts`. These are configuration values, not live products; the
price charged is always the one the billing provider confirms at checkout. International localised
pricing is a later phase.

## Trial

- One calendar month (`addCalendarMonths`, end-of-month clamped: 31 Jan → 28/29 Feb), full access.
- Before a trial can start, the user must: register a verified account → choose monthly/yearly →
  review amount, currency, first billing date and cancellation terms → authorise recurring payment with
  an approved provider → backend verifies eligibility and the authorisation.
- Only a provider-authorised, backend-verified trial grants production access.

## Access rules (`evaluateAccess`)

| Entitlement status | Add/change records | View | Export/backup | Manage subscription |
|---|---|---|---|---|
| none | ✗ | ✓ | ✓ | ✓ |
| trialing / active / complimentary | ✓ | ✓ | ✓ | ✓ |
| cancelled_active (until period end) | ✓ | ✓ | ✓ | ✓ |
| grace_period (provider-confirmed) | ✓ | ✓ | ✓ | ✓ |
| expired, or `accessEndsAt` passed | ✗ | ✓ | ✓ | ✓ |

Historical records are never deleted or altered when access ends.

## TEST MODE (Phase 1)

- `TestModeBillingProvider` creates entitlements with `environment: "test"`, `source: "test_mode"`.
- `isProductionAuthorized()` returns **false** for any test entitlement, even if someone sets `verifiedAt`
  or flips `environment` (requires a non-test source + `production` + server verification). Covered by tests.
- The UI shows TEST MODE on every screen, a dashed warning box on the trial and subscription screens, and the
  button reads "Start TEST MODE trial".
- Developer controls on the Subscription screen: simulate expiry (preview view-only mode), reset.
- `VITE_BILLING_MODE` other than `test` disables trial activation entirely.
- No payment is collected; no card or bank data is requested or stored.

## Provider abstraction (`BillingProvider`)

`startTrial`, `cancel`, `resume`, `restorePurchases`. Planned implementations:

| Provider | Use |
|---|---|
| Google Play Billing | Play Store installs (required by Play policy for digital subscriptions) |
| Apple In-App Purchase | App Store installs |
| RevenueCat (or equivalent) | Unifies store receipts, webhooks, entitlements |
| Approved external gateway | Independently distributed APK / web. For India, investigate **UPI AutoPay** (e-mandate) eligibility; international cards via provider-supported recurring payments |

Do **not** assume Razorpay, recurring international payments, or merchant approval are available.

## Enforcement (Phase 5)

- Entitlements live in the `entitlements` table, writable **only** by the Worker (service role) after verifying
  store receipts or provider webhooks (signature-checked, idempotent by event id).
- RLS write policies on financial tables will additionally require an active entitlement, so a modified client
  cannot write while expired.
- The app only caches what the backend reports; client-side state never grants access.
- Admin complimentary grants go through the admin API with audit logging.

## Activation checklist (before any real charge)

1. Separate written approval to collect payments.
2. Merchant/store accounts approved; products created in **sandbox** first.
3. Final prices, tax treatment (GST on digital services) and invoices for subscribers decided.
4. Terms of service, privacy policy, refund and cancellation policy published.
5. Webhook endpoint deployed and verified; renewal, cancellation, grace-period and refund flows tested in sandbox.
6. Trial-eligibility checks (one trial per account/organization/store account) implemented server-side.
