# Security

## Local preview builds (Phase 1 behaviour)

- No backend, no network calls for data. Everything is stored in the WebView's `localStorage` on the device.
- **Not encrypted at rest** and **no cloud backup**. Uninstalling or clearing app data deletes it.
  Settings → *Export full backup (JSON)* is the only backup.
- "Sign-in" is a local prototype: it remembers name and e-mail; **passwords are never stored or transmitted**.
- No payment, card or bank credentials are requested anywhere. Account forms warn users not to enter them.
- CSV export neutralises spreadsheet formula injection (cells starting with `= + - @`).
- Capacitor: `allowMixedContent: false`; no native plugins with extra permissions.
- Android: `allowBackup="false"` and data-extraction rules exclude all app data from Google cloud backup and
  device-to-device transfer, so unencrypted local financial data never leaves the phone that way.
- FileProvider (`res/xml/file_paths.xml`, Capacitor default) is not exported and only grants per-URI access;
  unused in Phase 1. Narrow its paths when Phase 4 adds file sharing.

## Cloud builds (Phase 2 — implemented, project not yet connected)

**Isolation.** Dedicated Linqora Books Supabase project (never Linqora QR). Every business table has
`organization_id`, RLS enabled, and composite keys `(organization_id, id)` with composite foreign keys, so a row can
only reference rows of the same business — another business's account, contact or invoice cannot be pointed at.

**Policies.** Members read their business; writers (owner/administrator/accountant/staff) with active access insert
and update; only drafts can be deleted; voiding needs owner/administrator/accountant. Anonymous users have no table
privileges. `organization_members`, `entitlements` and `app_settings` have **no client write path** — memberships
change only through `SECURITY DEFINER` functions, so nobody can join a business or promote themselves.
`created_by`, `created_at`, `organization_id` and void stamps are set by triggers, never trusted from the client.

**Entitlements.** Decided by the server (`has_write_access`) using the server clock in the business time zone. A
development grant is constrained to `environment = 'test'` and can never become production access. Billing is off.

**Keys.** The app ships only the publishable key and refuses secret or `service_role` keys at start-up. The database
password and service key stay with the project owner. All `SECURITY DEFINER` functions pin `search_path = ''`.

**Sessions.** Supabase Auth with PKCE. Tokens are stored by `@aparajita/capacitor-secure-storage` (Android Keystore /
iOS Keychain) and excluded from Android backups. Refresh runs only in the foreground; an expired session returns to
sign-in with a message. E-mail links return through `com.linqora.books://auth/callback`; a PKCE code only works on the
device that requested it.

**Files.** Private buckets; objects live under `<organization_id>/...`; only members read them (short-lived signed
URLs); only writers upload. No public URLs for receipts, invoices or logos.

**Audit.** Every insert/update/delete of business records writes `audit_log` (before/after, actor) via trigger.

**Tested.** 61 database tests (two accounts and businesses, staff/viewer roles, anonymous, service role) in embedded
Postgres — see `supabase/tests/`. Not yet repeated on the hosted project.

**Least privilege.**

| Credential | Where it may exist |
|---|---|
| Publishable (anon) key | App (public by design; RLS protects data) |
| User session tokens | Secure storage on the device |
| `service_role` / secret key, DB password | Project owner only (future Worker secrets) — never in the app or repo |

## Checklist before handling real customer data

- [x] RLS enabled on every table; policy tests (cross-business access denied) — on embedded Postgres
- [ ] Dedicated Supabase project created (Mumbai region) and the same checks run there (SUPABASE_SETUP.md step 6)
- [ ] Service-role key only in Worker secrets; repo secret scan clean
- [ ] Auth: e-mail verification, password reset, rate limits, session expiry
- [ ] Storage buckets private, signed URLs, per-organization paths
- [ ] Backups and restore tested
- [ ] Privacy policy, terms, data-deletion process published
- [ ] Dependency audit, Android release hardening (minify, no debuggable), security review
