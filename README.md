# Linqora Books

Small-business accounting and profit/loss tracking for shops, event companies, garages, freelancers,
contractors, traders, restaurants, consultants and other small businesses.

> **Status: Phase 1 prototype.** Runs entirely on the device in **TEST MODE**: no real accounts,
> no cloud sync, no payment provider. Sample data is clearly labelled and is not real accounting data.
> Linqora Books is a finance tracker, **not** certified tax or statutory accounting software.

This project is completely separate from Linqora QR and the Orvella website. It has its own
application ID (`com.linqora.books`), versioning, signing key (to be created) and, from Phase 2,
its own dedicated Supabase project.

## Quick start

Requirements: Node 22+, pnpm 12, and for Android: JDK 21 + Android SDK 36 (see [docs/ANDROID_SETUP.md](docs/ANDROID_SETUP.md)).

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:5180. Create a local test account, start the TEST MODE trial, set up a business
and choose **Explore with sample data**.

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server for the app (port 5180) |
| `pnpm typecheck` | TypeScript across all packages and apps |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | Vitest unit/component tests in every package |
| `pnpm build` | Production web build → `apps/mobile/dist` |
| `pnpm e2e` | Playwright smoke test against the production build |
| `pnpm check` | typecheck + lint + test + build |
| `pnpm android:sync` | Build and copy web assets into the Android project |
| `pnpm android:debug` | Build a debug APK (needs `JAVA_HOME` = JDK 21) |

## Layout

```
apps/
  mobile/            React + Vite + Capacitor app (Android now, iOS later; also runs in a browser)
  api/               Cloudflare Worker skeleton (not deployed)
  web/  admin/       Placeholders for later phases
packages/
  accounting-core/   Money, dates, domain models, ledger calculations, document workflows
  billing/           Plans, entitlements, access rules, billing-provider interface, TEST MODE provider
  integrations/      External-document import contracts (idempotency, conflict rules)
  shared/            Organization roles/permissions, id helpers
supabase/migrations/ Draft Phase 2 schema with RLS (NOT applied)
docs/                Architecture, rules, roadmap and the Phase 1 report
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Accounting rules](docs/ACCOUNTING_RULES.md)
- [Subscriptions](docs/SUBSCRIPTIONS.md)
- [Security](docs/SECURITY.md)
- [Integrations](docs/INTEGRATIONS.md)
- [Android setup](docs/ANDROID_SETUP.md)
- [Roadmap](docs/ROADMAP.md)
- [Phase 1 report](docs/PHASE_1_REPORT.md)
