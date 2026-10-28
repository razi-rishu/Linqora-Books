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

## Organizations and multi-user (designed, Phase 2)

Every record carries `organizationId`, `createdBy/At`, `updatedBy/At` and `origin`. Roles
(`owner`, `administrator`, `accountant`, `staff`, `viewer`) and their permissions are defined once in
`packages/shared/src/roles.ts`. Enforcement is Postgres RLS (`supabase/migrations/…draft.sql`) plus
Worker checks; the client table is only for hiding controls.

Phase 1 limitation: one business and one test entitlement per device.

## Offline and sync strategy

Phase 1 is local-only and says so on every screen. The cloud design prepares for offline use:

- client-generated UUIDs for all records → a retried insert is the same row, not a duplicate;
- `idempotency_key` on transactions (unique per organization);
- `updatedAt` on every row → optimistic conflict detection (reject writes based on a stale version);
- a future outbox in the repository: queued mutations with retry/backoff and a visible sync status.

Offline sync is **not** promised until it is implemented and tested.

## Admin dashboard (Phase 5)

Separate web app (`apps/admin`), separate sign-in, all actions through Worker endpoints that check
an `admin_users` role server-side and write an admin audit log. No service-role keys in the frontend.

## Ecosystem integration

Linqora Books shares no runtime, database, auth or billing with Linqora QR. Future connections go
through explicit interfaces: the Worker API and the integrations contract (`packages/integrations`).

## Known deviations from the suggested structure

- `packages/ui` is not created yet: UI components live in `apps/mobile/src/components/ui` until a second
  UI app (admin) needs them, to avoid premature workspace complexity.
- `apps/web` and `apps/admin` are README placeholders; `apps/api` is a typed, tested skeleton without
  `wrangler` (added when it is first deployed).
