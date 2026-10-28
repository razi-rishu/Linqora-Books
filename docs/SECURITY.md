# Security

## Phase 1 (current)

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

## Target design (Phase 2+)

**Isolation.** One Supabase project dedicated to Linqora Books. Every financial table has
`organization_id` and Row Level Security; policies use a `security definer` membership function with a pinned
`search_path`. One business can never read another's rows. See `supabase/migrations/0001_initial_schema.draft.sql`.

**Least privilege.**

| Credential | Where it may exist |
|---|---|
| Supabase anon key | App (public by design; RLS protects data) |
| User JWT | App memory / secure storage, sent to Worker |
| Supabase service-role key | **Worker secrets only** — never in Android, iOS or browser code |
| Billing provider secrets, webhook signing secrets | Worker secrets only |
| Integration tokens | Shown once to the user; only a hash stored server-side |

**Roles.** owner, administrator, accountant, staff, viewer (see `packages/shared/src/roles.ts`). Enforced by
RLS and Worker checks; the UI only hides controls.

**No public financial APIs.** Every `/v1/*` Worker route requires a valid user JWT or a scoped integration
token, and resolves the organization server-side.

**Entitlements** are written only by the backend after provider verification (see SUBSCRIPTIONS.md).

**Auditing.** Append-only `audit_log` via triggers; no hard deletes of finalised records; void reasons required.

**Data rights.** Full export (JSON/CSV) always available, including when the subscription has expired. Account
deletion flow (Phase 2): owner requests → grace period → organization data deleted except what law requires to
retain; documented in the privacy policy.

**Mobile.** Use Capacitor Preferences/secure storage for tokens (not `localStorage`) once real auth exists.
Release builds signed with a **new** Linqora Books key — never the Linqora QR key.

## Checklist before handling real customer data

- [ ] Dedicated Supabase project; RLS enabled on every table; policy tests (cross-org access denied)
- [ ] Service-role key only in Worker secrets; repo secret scan clean
- [ ] Auth: e-mail verification, password reset, rate limits, session expiry
- [ ] Storage buckets private, signed URLs, per-organization paths
- [ ] Backups and restore tested
- [ ] Privacy policy, terms, data-deletion process published
- [ ] Dependency audit, Android release hardening (minify, no debuggable), security review
