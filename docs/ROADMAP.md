# Roadmap

Phases describe the development order. Each phase starts only with explicit approval.

## Phase 1 — Foundation ✅ (this delivery)
Workspace, React + Vite + Capacitor, design system, navigation, typed domain models, accounting core,
local sample data, functional UI prototypes for all 20 screens, TEST MODE subscription UI, repository
interfaces, unit/component/E2E tests, Android project, documentation. See PHASE_1_REPORT.md.

## Phase 2 — Real authentication and business isolation ✅ implemented (cloud project pending)
Supabase Auth (sign-up, e-mail verification, sign-in/out, reset via deep link, secure persistent sessions),
schema + RLS + accounting triggers + RPCs, one business per user with roles, CloudBooksRepository, local-data import,
online-first network handling, server-side entitlements with billing disabled. See PHASE_2_REPORT.md.
**Remaining:** create the dedicated project, apply migrations, run the live checks on phones.

## Phase 3 — Accounting engine
- Team invitations (owner adds staff with roles) — schema ready.
- Offline outbox with conflict detection; realtime refresh.
- (Done in Phase 2: server-side rule triggers and the audit log.) Audit-log viewer, correction links
  (`correctsTransactionId`), credit notes / adjustments, server-side document numbering.
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
