# Linqora Books

Small-business accounting and profit/loss tracking for shops, event companies, garages, freelancers,
contractors, traders, restaurants, consultants and other small businesses.

> **Status: Phase 2 (cloud accounts) implemented, not yet connected.** The app supports real sign-up, e-mail
> verification, sessions and cloud storage on a **dedicated** Supabase project with Row Level Security — but that
> project has not been created yet (see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)). Until it is, builds run
> either the clearly-labelled **local preview** (on-device, Phase 1 behaviour) or show "not configured".
> **No payments are taken in any build.** Linqora Books is a finance tracker, **not** certified tax software.

Separate from Linqora QR and the Orvella website: own app ID (`com.linqora.books`), versioning, Supabase project
and (later) signing key.

## Quick start

Requirements: Node 22+, pnpm 12; Android: JDK 21 + Android SDK 36 ([docs/ANDROID_SETUP.md](docs/ANDROID_SETUP.md)).

```bash
pnpm install
```

```bash
pnpm dev
```

Opens http://localhost:5180 — local preview by default; cloud mode if `apps/mobile/.env.development.local` has the
Supabase URL and publishable key ([apps/mobile/.env.example](apps/mobile/.env.example)).

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server (port 5180) |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint across the workspace |
| `pnpm test` | All unit, integration and database tests (database tests run real migrations in embedded Postgres) |
| `pnpm test:db` | Only the database tests (`supabase/tests`) |
| `pnpm build` | Production web build (cloud if `.env.production.local` is set, otherwise "not configured") |
| `pnpm e2e` | Playwright smoke test against the local-preview build |
| `pnpm check` | typecheck + lint + test + build |
| `pnpm android:debug` | Cloud debug APK (needs `.env.production.local`) |
| `pnpm android:debug:preview` | Local-preview debug APK (no cloud) |

## Layout

```
apps/
  mobile/              React + Vite + Capacitor app (Android now, iOS later; also runs in a browser)
  api/                 Cloudflare Worker skeleton (not deployed)
  web/  admin/         Placeholders for later phases
packages/
  accounting-core/     Money, dates, models, ledger calculations, document workflows, validation rules
  billing/             Plans, entitlements, access rules, provider interface, TEST MODE provider
  cloud/               Repository contract, Supabase row mappers, CloudBooksRepository, local-data import planner
  integrations/        External-document import contracts
  shared/              Roles/permissions, ids
supabase/
  migrations/          Schema, RLS, accounting triggers, server functions, storage (NOT yet applied anywhere)
  tests/               Security, rules and repository tests on embedded Postgres (PGlite)
  dev-test-access.sql  Development-only access grant
docs/                  Architecture, rules, setup guides and phase reports
```

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Accounting rules](docs/ACCOUNTING_RULES.md) · [Subscriptions](docs/SUBSCRIPTIONS.md) ·
[Security](docs/SECURITY.md) · [Supabase setup](docs/SUPABASE_SETUP.md) · [Data migration](docs/DATA_MIGRATION.md) ·
[Integrations](docs/INTEGRATIONS.md) · [Android setup](docs/ANDROID_SETUP.md) · [Roadmap](docs/ROADMAP.md) ·
[Phase 1 report](docs/PHASE_1_REPORT.md) · [Phase 2 report](docs/PHASE_2_REPORT.md)
