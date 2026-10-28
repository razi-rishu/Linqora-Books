# Roadmap

Phases describe the development order. Each phase starts only with explicit approval.

## Phase 1 — Foundation ✅ (this delivery)
Workspace, React + Vite + Capacitor, design system, navigation, typed domain models, accounting core,
local sample data, functional UI prototypes for all 20 screens, TEST MODE subscription UI, repository
interfaces, unit/component/E2E tests, Android project, documentation. See PHASE_1_REPORT.md.

## Phase 2 — Real authentication and business isolation
- Create the dedicated Linqora Books Supabase project (separate from Linqora QR).
- Supabase Auth (e-mail verification, password reset, deep-link redirect `com.linqora.books://auth/callback`).
- Apply and test the schema + RLS (cross-organization access tests).
- `SupabaseBooksRepository` implementing `BooksRepository`; migrate local prototype data on first sign-in (optional).
- Organization onboarding, membership, roles; token storage in secure native storage.
- Worker: JWT verification, organization resolution, health checks; staging deployment only.

## Phase 3 — Accounting engine
- Server-side validation mirroring `accounting-core` (or Postgres functions) for transactions, documents, payments.
- Audit-log triggers, correction links (`correctsTransactionId`), credit notes / adjustments.
- Customer/supplier management, categories editing, reconciliation history.
- Reports from the database; performance on large datasets.

## Phase 4 — Projects, documents and exports
- Quotation workflow polish (send via WhatsApp/e-mail share), terms templates.
- Real PDF generation (on device or Worker) and Android save/share (Capacitor Filesystem/Share).
- Receipt attachments to Supabase Storage (private buckets).
- Reporting improvements, CSV/PDF export on Android.

## Phase 5 — Subscription and administration
- Admin dashboard (`apps/admin`) with server-side role checks and audit logging.
- Billing providers: Google Play Billing, App Store, RevenueCat or equivalent, external gateway (UPI AutoPay research).
- Trial eligibility, renewals, cancellation, grace periods, expiry, complimentary grants.
- Sandbox purchase flows only; **no live charges without explicit approval**.

## Phase 6 — Integrations
- Connection management UI, tokens, Worker endpoints, queue/retry, sync status.
- Orvella quotation connector (after read-only inspection and owner approval).
- Consistency and duplicate-prevention testing.

## Phase 7 — Release
- New release signing key for `com.linqora.books`; client-ready signed APK.
- Real-device testing matrix, backup/restore testing, privacy and security review.
- Play Store listing, iOS build, public website.
