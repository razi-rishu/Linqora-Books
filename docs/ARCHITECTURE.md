# Architecture

## Overview

```
┌──────────────────────── apps/mobile (React + Capacitor) ────────────────────────┐
│ screens/  ──►  data/books.ts (TanStack Query hooks)  ──►  BooksRepository        │
│                       │                                      │                  │
│ state/ (Zustand):     │ pure calculations                    ├─ Local (Phase 1) │
│  session, subscription│                                      └─ Cloud (Phase 2+)│
│  (TEST MODE), prefs   ▼                                                         │
│            packages/accounting-core   packages/billing   packages/shared        │
└─────────────────────────────────────────────────────────────────────────────────┘
                     Phase 2+ ▼ HTTPS (Supabase JWT)
       Supabase Auth / Postgres (RLS) / Storage   +   apps/api (Cloudflare Worker)
                                                      billing webhooks, entitlements,
                                                      integration endpoints, admin API
```

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `accounting-core` | Money (integer minor units, BigInt rounding), dates/financial years, typed models, ledger calculations (P&L, cash flow, balances, receivables/payables, projects), document workflows (numbering, quotation→invoice, issue, void, payment validation) | — |
| `billing` | Provisional plans/prices, entitlement model, `evaluateAccess`, `isProductionAuthorized`, `BillingProvider` interface, `TestModeBillingProvider` | accounting-core |
| `integrations` | External document payload types, `decideImport` (create/update/skip/conflict), idempotency keys | accounting-core |
| `shared` | Organization roles + permission table, id generation | — |

Everything in `accounting-core` is **pure** (no I/O, no clock reads): the caller passes `today`.
This keeps it identical on the device, in the Worker and in tests.

Packages are consumed as TypeScript source (`exports: ./src/index.ts`); Vite and `tsc` compile them in
place. No package build step is needed.

## App (`apps/mobile`)

- **Routing:** React Router hash router (`#/app/...`) — works the same in a browser, from a static
  host and inside Capacitor's WebView without server rewrites.
- **Data access:** screens never touch storage. They call `useBooksQuery()` / `useBooksMutation()`, which
  go through the `BooksRepository` interface (`src/data/repository.ts`).
  - Phase 1: `LocalBooksRepository` stores one JSON snapshot in `localStorage` and enforces
    the same invariants the database will (number immutability, void immutability, drafts-only
    delete, one invoice per quotation, transaction shape).
  - Phase 2: a cloud implementation of the same interface (Supabase client + Worker endpoints).
- **State:** Zustand for session (local prototype users), subscription (TEST MODE entitlement) and
  preferences (theme). Server data is not duplicated in Zustand.
- **Forms:** React Hook Form + Zod. Money is entered as text and parsed with `parseAmount`, never `Number()`.
- **UI:** Tailwind CSS v4 with CSS-variable design tokens (light/dark), shadcn-style components
  (`components/ui`) built on `class-variance-authority` + `tailwind-merge`, Lucide icons.

### Navigation

Phone: bottom tab bar (Home, Money, Invoices, Reports, More). Tablet/desktop (≥768px): sidebar with all
sections. A TEST MODE strip is pinned at the top of every screen.

## Data modes (build time)

| Mode | When | Auth | Data |
|---|---|---|---|
| `cloud` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` set | Supabase Auth (e-mail/password, verification, reset) | `CloudBooksRepository` → Supabase (RLS) |
| `local-preview` | `VITE_ALLOW_LOCAL_PREVIEW=true` and no Supabase config | Local-only prototype sign-in, labelled | `LocalBooksRepository` (device) |
| `unconfigured` | neither | none — "not configured" screen | none |

Decided by `src/config/env.ts`; the two modes are never mixed in one build. The app refuses secret/service-role keys.

## Cloud architecture (Phase 2)

```
Screens -> data/books.ts (TanStack Query, per-user cache keys) -> BooksRepository
                                                                   |- LocalBooksRepository (preview)
                                                                   `- CloudBooksRepository (packages/cloud)
                                                                         `- CloudGateway -> SupabaseGateway (supabase-js)
Auth: auth/AuthController (restore session, refresh on resume, expiry -> sign-in, deep links)
      auth/auth-service.ts (SupabaseAuthService, PKCE) - session tokens in Android Keystore / iOS Keychain
Database (supabase/migrations): RLS on every table, composite (organization_id, id) keys and foreign keys,
      triggers re-check the accounting rules, RPCs for multi-row operations, private storage buckets
```

- **Organizations.** Each business is an `organizations` row; users join through `organization_members` with a role
  (`owner`, `administrator`, `accountant`, `staff`, `viewer`). Phase 2 creates one business per user via
  `create_organization()`; the schema already supports many businesses and staff (memberships change only via
  server functions).
- **Entities.** `business_settings`, `categories`, `contacts` (customers *and* suppliers, by `kind`), `money_accounts`,
  `projects`, `documents` (quotations, invoices, bills), `transactions` (income, expenses, invoice/bill payments,
  refunds, transfers, advances). One table per concept — no duplicate tables per document or payment type, so totals
  cannot disagree. Plus `profiles`, `entitlements`, `app_settings`, `data_imports`, `audit_log`.
- **Same rules everywhere.** `packages/accounting-core` validates in the app; database triggers enforce the same
  rules (dates, balances, advances, void-only corrections, immutable numbers, currency lock). SQL money totals are
  tested to match the TypeScript ones exactly.
- **Atomic multi-row operations.** Quotation → invoice (`convert_quotation`), deleting a converted draft
  (`delete_draft_document`) and the local import (`import_local_books`) each run in one database transaction.
- **Idempotent writes.** Records use client-generated ids; each form keeps one id across retries; the repository treats
  "already exists" on insert as success. A lost response therefore never creates a second invoice or payment.
- **Freshness.** Cloud queries refresh on focus, reconnect, app resume and every 60 s, so a second device sees changes.
  Realtime push is a later improvement.

## Offline behaviour (Phase 2: online-first)

- Viewing works from the last loaded data; **saving needs a connection**. An offline banner says so.
- A failed save shows "Not saved" with the reason, keeps the form and what was typed, and can be retried safely.
- Nothing is queued offline, and no "saved" state is shown unless the server confirmed it.
- Full offline entry with later synchronisation is **not** implemented (planned: outbox + conflict detection on
  `updated_at`).

## Admin dashboard (Phase 5)

Separate web app (`apps/admin`), separate sign-in, all actions through Worker endpoints that check
an `admin_users` role server-side and write an admin audit log. No service-role keys in the frontend.

## Ecosystem integration

Linqora Books shares no runtime, database, auth or billing with Linqora QR. Future connections go
through explicit interfaces: the Worker API and the integrations contract (`packages/integrations`).

## Known deviations from the suggested structure

- `packages/ui` is not created yet: UI components live in `apps/mobile/src/components/ui` until a second
  UI app (admin) needs them, to avoid premature workspace complexity.
- Supabase code is split: `packages/cloud` (no SDK dependency, tested against the database) and
  `apps/mobile/src/cloud` (supabase-js gateway, secure session storage).
- `apps/web` and `apps/admin` are README placeholders; `apps/api` is a typed, tested skeleton without
  `wrangler` (added when it is first deployed).
