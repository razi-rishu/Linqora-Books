# Phase 2 report — Authentication and cloud database

Date: 28 Oct 2026 · Repository: `E:\Projects\LinqoraBooks` · Version 0.2.0 (Android versionCode 4)

**Bottom line:** Phase 2 is implemented and tested locally. It is **not yet connected to a cloud project**,
because the dedicated Linqora Books Supabase project does not exist yet. No remote migration was applied, no cloud
test was run, and no account was created on any server. Steps to finish: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## A. Pre-implementation audit

- Git clean at `c731cca`; Android Back fix and its 23 tests present; accounting fixes (currency lock, quotation
  release, date rules, advances) and their regression tests present.
- Baseline `pnpm check`: **one failure** — a hardware-Back UI test timed out (5.3 s > 5 s) while the machine was busy.
  Fixed by raising the UI test timeout to 20 s; all passed afterwards.
- Data layer: one `BooksRepository` interface (load, save business/contact/account/project/transaction, atomic
  document save, delete draft, remove samples, clear). Entities: business profile, categories, contacts, accounts,
  projects, documents (quotation/invoice/bill), transactions (9 kinds).
- Placeholders replaced/kept: `state/session.ts` (local sign-in) and `state/subscription.ts` (local TEST MODE) now
  serve the local preview only.
- Migration risks found: prefixed text ids, non-UUID local business id, local user ids in `createdBy`, user records
  referencing sample records (present in the real browser data).
- Backups: git tag `phase-1-final`, bundle `backups/linqora-books-phase1-2026-10-28.bundle`, browser local data
  `backups/phase1-browser-localstorage-2026-10-28.json` (also a test fixture).

## 1. Features implemented

- **Auth (cloud mode):** sign-up with name/e-mail/password; e-mail verification (deep link, resend); sign-in; sign-out;
  forgot password → reset link → new password; persistent session restored on restart; foreground-only token refresh;
  expired session → sign-in with an explanation; loading and error states; per-user data cache.
- **Secure sessions:** Android Keystore / iOS Keychain via `@aparajita/capacitor-secure-storage`; PKCE flow; deep link
  `com.linqora.books://auth/callback` registered in the manifest.
- **Build modes:** cloud / explicit local preview / unconfigured; secret or service-role keys rejected at start-up.
- **Business onboarding:** `create_organization()` — verified users only, owner membership, settings, starter
  categories, server-decided access. One business per user (schema ready for more and for staff).
- **Cloud repository:** all existing screens now persist through `CloudBooksRepository` in cloud mode: contacts,
  accounts, projects, quotations/invoices/bills, payments, advances, voids, settings, logo (private storage + signed
  URL). Quotation conversion and draft deletion are atomic server functions.
- **Duplicate prevention:** one id per form across retries; duplicate inserts treated as already saved; unique
  document numbers; one invoice per quotation; server row locks on payments.
- **Network:** offline banner; "Not saved" with reason; form keeps its values; refresh on reconnect/resume/focus and
  every 60 s (second device sees changes).
- **Access:** server entitlement shown read-only; without access the app is view-only; billing disabled everywhere;
  development test access only via a server setting, labelled as such.
- **Local data import:** banner + review screen; samples never uploaded; rejected records listed with reasons;
  atomic, idempotent import; local copy kept.
- **Storage:** private `business-logos`, `receipts`, `attachments` buckets scoped by business.

## 2. Database migrations (in `supabase/migrations/`, not yet applied anywhere)

1. `20261028090000_core_schema.sql` — 14 tables, role enum, helper functions, RLS policies, explicit grants.
2. `20261028090100_accounting_rules.sql` — totals function (matches the app), rule triggers, audit stamping, audit log.
3. `20261028090200_functions.sql` — `create_organization`, `convert_quotation`, `delete_draft_document`, `import_local_books`.
4. `20261028090300_storage.sql` — private buckets + storage policies.

## 3. Security policies

RLS on every table; members-only reads; writers + server-side access for writes; drafts-only deletes; void needs
owner/admin/accountant; no client write path to memberships, entitlements or server settings; anonymous has no table
privileges; composite same-business foreign keys; server-stamped audit columns; private storage per business. Details:
[SECURITY.md](SECURITY.md).

## 4. Supabase connection status

**Not connected.** No project exists; nothing applied remotely; no cloud keys in the repository. The app's cloud mode
has been compiled with placeholder values (build succeeded) but never run against a real server.

## 5. Test results (all executed on 28 Oct 2026; none against a hosted Supabase project)

| Suite | Result |
|---|---|
| TypeScript (8 projects) | ✅ 0 errors |
| ESLint | ✅ 0 errors, 0 warnings |
| `packages/accounting-core` | ✅ 59 / 59 |
| `packages/billing` | ✅ 10 / 10 |
| `packages/cloud` (mappers, error mapping) | ✅ 14 / 14 |
| `packages/shared`, `packages/integrations`, `apps/api` | ✅ 4 / 4, 7 / 7, 3 / 3 |
| `supabase` — database on embedded Postgres (PGlite): security 31, accounting rules 17, cloud repository + import 13 | ✅ 61 / 61 |
| `apps/mobile` — local preview UI 50 (incl. 23 Back-button), cloud-mode UI 13, config 5 | ✅ 68 / 68 |
| **Total unit/integration** | ✅ **226 / 226** |
| Playwright E2E (local-preview production build, Pixel 7) | ✅ 1 / 1 |
| Production web build (unconfigured) + cloud-mode compile check | ✅ |
| Android debug build (local preview) | ✅ BUILD SUCCESSFUL |

What the tests cover from the brief: sign-up/login, password reset, session restore, session expiry, business
creation, membership, cross-business denial, unauthorized writes, financial CRUD, duplicate invoice prevention,
payment integrity, local import, network failure, Android Back regression. Cloud **UI** tests use a fake auth service
and repository; the **database** tests run the real migrations and the real `CloudBooksRepository`.

Bugs found and fixed during Phase 2: misleading error for a payment linked to a non-existent document (trigger),
expired session landing on Welcome without the message (shell redirect), duplicate error message on failed saves,
lint issues.

## 6. Android APK

`E:\Projects\LinqoraBooks\apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk`
— **local preview** build, `com.linqora.books`, 0.2.0 (4), 4,471,885 bytes,
SHA-256 `6a83ca0c787103071c7f07eb14ce0e7f86711d5101c4613c42fa7bdc91366c46`.
A cloud APK needs the project keys (`pnpm android:debug` after SUPABASE_SETUP.md step 5).

## 7. Local data migration status

Workflow implemented and tested (planner + database import + UI). The only known local data (development browser)
contains no importable user records — its single user payment references sample records and is rejected with that
reason. Phone data from Phase 1 builds is unknown; the import screen will show it. Nothing has been deleted.

## 8. Known issues and limitations

- Cloud project not created; hosted behaviour untested (Auth e-mails, PostgREST, Storage, deep links on a phone).
- Online-first only: no offline saving or sync queue.
- Document numbers are assigned by the app; a simultaneous issue on two devices is refused by the database (unique)
  and must be retried — server-side numbering planned.
- No team invitations UI yet; one business per account.
- Self-service account deletion not built (on request for now).
- Default Supabase e-mail sender is rate-limited; custom SMTP needed before customers.
- PDF/CSV export and receipt attachments still browser-only / Phase 4.
- Local preview sessions and data remain unencrypted on the device (preview only).

## 9. Phone testing instructions

**Now (local preview APK):** install over the existing app (see ANDROID_SETUP.md → Install). Re-check Back
navigation, forms, keyboard, app restart. Expect the TEST MODE strip; nothing is uploaded.

**After the project exists (cloud APK):**
1. Create the project and keys (SUPABASE_SETUP.md 1–5), run `supabase/dev-test-access.sql`, build `pnpm android:debug`.
2. Install; Create account with an inbox you can open **on the phone**; open the verification e-mail on the phone →
   the app opens and continues.
3. Create the business; add an account, a customer, an invoice and a payment.
4. Force-stop the app and reopen: still signed in, data present.
5. Airplane mode: offline banner; try saving → "Not saved", form kept; turn network on → save once → only one record.
6. Sign in on a second device (or browser with `.env.development.local`): same records appear within a minute.
7. Second account on another device: its own empty business; cannot see the first account's data.
8. Forgot password from the sign-in screen → open the e-mail on the phone → choose a new password.
9. Sign out → Welcome; Back on the dashboard asks before exiting.

## 10. Readiness for Phase 3

Code and schema are ready. **Before Phase 3, complete the live connection:** create the dedicated project, apply the
migrations, run the phone checks above and the SQL checks in SUPABASE_SETUP.md step 6, and fix anything found.
