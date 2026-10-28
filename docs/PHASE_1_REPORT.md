# Phase 1 report — Foundation

Date: 28 Oct 2026 · Location: `E:\Projects\LinqoraBooks` (new, empty folder at start; nothing outside it was modified)

## 1. Project structure created

```
LinqoraBooks/
  apps/mobile        React 19 + Vite 8 + Tailwind 4 + Capacitor 8 app (+ android/ project)
  apps/api           Cloudflare Worker skeleton (typed, tested, not deployed)
  apps/web, admin    README placeholders
  packages/accounting-core, billing, integrations, shared
  supabase/migrations/0001_initial_schema.draft.sql   (draft, NOT applied)
  docs/              9 documents
  package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, README.md
```

Versions (pinned exactly): React 19.3.1, React Router 8.5.0, Vite 8.3.5, TypeScript 6.0.3 (typescript-eslint
supports < 6.1; TS 7 not used), Tailwind 4.3.3, Capacitor 8.5.3, Zustand 5.0.16, TanStack Query 5.105.0,
React Hook Form 7.91.0, Zod 4.6.7, Lucide 1.61.0, Vitest 5.0.5, Playwright 1.64.1. Three packages released
under 24 h earlier were pinned to the previous version instead of bypassing pnpm's release-age gate.

## 2. Screens implemented (20 + detail/edit screens)

Splash · Welcome · Sign in · Sign up · Forgot password · Subscription intro · One-month trial · Business setup ·
Dashboard · Income & expenses (+ detail with void) · Add transaction · Customers & suppliers (+ detail, add/edit) ·
Projects/jobs (+ detail, add/edit) · Quotations & invoices & bills (+ editor, printable detail) · Cash & bank
(+ add account, reconcile) · Reports · Integrations · Settings · Subscription management · Help · More menu.

## 3. Genuinely working (local device)

- Onboarding flow with redirects; data persists across reloads (`localStorage`).
- Business setup and editing (category, address, currency, FY start, time zone, tax ID, logo ≤200 KB, projects on/off).
- Dashboard: accrual P&L vs cash movement, cash/bank balances, receivables (with overdue), payables — figures verified by hand and by tests.
- Add income / expense / refund / transfer with validation (amount format, category, account, transfer destination).
- Void transactions and documents with reason (kept on record, excluded from totals).
- Quotations: create, edit drafts, send/accept/reject/reopen, convert to invoice exactly once (verified with a double-tap).
- Invoices/bills: draft, issue with FY-based immutable number, full/partial payments, overpayment rejected, payment status, overdue.
- Projects: estimated vs realised profit, outstanding receivable, linked records.
- Accounts: multiple, opening balances, transfers, statement reconciliation difference.
- Reports: P&L, category breakdown, monthly summary, receivables, payables, cash/bank, project profitability; CSV export (web); print/save as PDF (web).
- TEST MODE trial: terms review (amount, currency, first billing date, cancellation), test entitlement, cancel/resume, simulate expiry → view-only mode.
- Light/dark/system theme; responsive phone (bottom tabs) and desktop (sidebar) layouts.
- Settings: full JSON backup export, remove sample data (blocked if own records depend on it), reset prototype.

## 4. Mock-only / not real

- **Authentication** — local prototype; no server account, password not stored, no e-mail sent.
- **Subscription/trial** — TEST MODE entitlement only; no provider, no charge, never production access.
- **Integrations** — explanatory screen only; no connection possible.
- **Team members/roles** — model and permission table only.
- **Cloud sync/backup** — none; data is on this device only.
- **Receipt attachments** — not implemented (Phase 4).
- **API** — skeleton with health route and auth guard; not deployed.

## 5. Commands executed (all from `E:\Projects\LinqoraBooks`)

```
pnpm install
pnpm typecheck                          # 6 projects
pnpm lint                               # eslint .
pnpm test                               # vitest in every package
pnpm build                              # vite build
npx playwright install chromium         # apps/mobile
npx playwright test                     # apps/mobile (build + preview + test)
npx cap add android                     # apps/mobile
JAVA_HOME=~/.jdks/jbr-21.0.11 ANDROID_HOME=…/Android/Sdk gradlew.bat assembleDebug --no-daemon
aapt dump badging app-debug.apk         # verify package identity
```

## 6. Test results

| Suite | Result |
|---|---|
| TypeScript (shared, accounting-core, billing, integrations, api, mobile) | ✅ 0 errors |
| ESLint (61 files) | ✅ 0 errors, 0 warnings |
| `packages/shared` | ✅ 4 / 4 |
| `packages/accounting-core` | ✅ 42 / 42 |
| `packages/billing` | ✅ 10 / 10 |
| `packages/integrations` | ✅ 7 / 7 |
| `apps/api` | ✅ 3 / 3 |
| `apps/mobile` (repository, sample data, React Testing Library screens) | ✅ 16 / 16 |
| Playwright E2E (Pixel 7 emulation, production build) | ✅ 1 / 1 |
| Production web build | ✅ (JS 671 KB / 201 KB gzip — size warning, see limitations) |
| Manual browser check | ✅ all screens render, no console errors |

## 7. Android build status

- Capacitor Android project generated at `apps/mobile/android` — appId `com.linqora.books`, versionCode 1, versionName 0.1.0, minSdk 24, target/compile SDK 36, AGP 8.13.0, Gradle 8.14.3.
- `assembleDebug` with JDK 21: **BUILD SUCCESSFUL in 4m 1s**.
- Output: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (4,362,402 bytes), verified with `aapt`: `package: name='com.linqora.books' versionCode='1' versionName='0.1.0'`.
- It is a **debug** APK (debug key). It has **not** been installed or tested on a physical phone yet.
- No release APK or signing key has been created.

## 8. Known bugs and limitations

- Android WebView: "Print / PDF", CSV and JSON exports do not work (browser APIs). Phase 4 adds native save/share.
- One business and one test entitlement per device; signing out and in as another local user shares the same books.
- Local data is unencrypted and has no backup beyond manual JSON export.
- Single JS bundle 671 KB (works offline in the APK; code-splitting would speed first load on the web).
- Direct income/expense entries have no tax breakdown; GST reporting is not implemented.
- Categories cannot be edited yet (starter set per business type).
- Editing a transaction is void + re-enter (by design for Phase 1).
- Default Capacitor icon/splash.
- Fixed during verification: after business setup the app briefly returned to the setup screen (stale cached query) — fixed by refetching inactive queries and waiting for the refetch.

### Pre-Phase 2 audit fixes (28 Oct 2026)

- `pnpm android:debug` failed (`'gradlew.bat' is not recognized` — pnpm's shell does not search the current
  directory). Script now calls `.\gradlew.bat`; verified end to end (BUILD SUCCESSFUL).
- Changing the currency in Settings after adding only an account crashed the dashboard (currency mismatch).
  Currency now locks once any account, project, transaction or document exists (repository + Settings).
- Deleting the draft invoice created from a quotation left the quotation "converted" and pointing at a missing
  invoice, so it could never be converted again. The quotation now returns to "accepted" in the same write.
- Regression tests added for both (shown to fail without the fixes). Totals: 89 unit/component tests + 1 E2E.
- Still open (non-blocking): income dated before an account's opening date counts as cash in but not in the
  balance; payment dates are not checked against the invoice issue date; `allowBackup` decision; device testing.

## 9. Requirements for Supabase integration (Phase 2)

- Your approval to create a **new, dedicated** Supabase project for Linqora Books (region, e.g. Mumbai), billing tier.
- Project URL + anon key (app); service-role key stored only as a Cloudflare Worker secret.
- Auth settings: e-mail confirmation on, redirect URL `com.linqora.books://auth/callback` and the web URL.
- Decide whether local prototype data should be importable on first cloud sign-in.
- Review and apply `supabase/migrations/0001_initial_schema.draft.sql`; add audit triggers and RLS tests.
- A Cloudflare account/Worker name for the Books API (separate from Linqora QR workers).

## 10. Requirements for payment-provider activation (Phase 5)

- Separate written approval to collect payments.
- Distribution decision: Play Store (Google Play Billing mandatory for in-app digital subscriptions) and/or direct APK/web (external gateway).
- Google Play Console and/or Apple developer accounts; merchant/gateway approval; UPI AutoPay eligibility check.
- Final prices, GST treatment, subscriber invoices, refund and cancellation policy, terms and privacy policy.
- Sandbox products and webhook endpoint tested before any live product exists.

## 11. Exact next steps for Phase 2

1. Install `app-debug.apk` on a real phone and record results (layout, keyboard, back button, storage persistence).
2. Approve creation of the dedicated Supabase project; provide its URL/anon key.
3. Add `@supabase/supabase-js` and Capacitor Preferences/secure storage; implement real sign-up, e-mail verification, sign-in, password reset with deep link.
4. Apply the schema (after review), write RLS tests proving cross-organization isolation for every table.
5. Implement `SupabaseBooksRepository` against `BooksRepository`; keep `LocalBooksRepository` for tests/demo.
6. Create organization on business setup; owner membership; role-based UI hiding.
7. Worker: JWT verification, `/v1/entitlement` from DB, staging deployment with `wrangler` (no production deploy).
8. Update docs and ship a Phase 2 debug APK.
