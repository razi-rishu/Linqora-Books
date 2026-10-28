# Supabase setup (dedicated Linqora Books project)

> **Status (28 Oct 2026): no Supabase project has been created or connected.** The schema, policies and
> functions are ready in `supabase/migrations/` and tested locally (see *What has been tested*). Nothing has been
> applied to any remote database. Follow these steps once, then send the project URL and publishable key back.

**Never** use the Linqora QR project or its database. Linqora Books gets its own project, keys and users.

## 1. Create the project (you, in the Supabase dashboard)

1. <https://supabase.com/dashboard> → **New project**.
2. Organization: your own. **Name:** `linqora-books`.
3. **Region: South Asia (Mumbai) `ap-south-1`** — closest to Indian customers.
4. Database password: generate a strong one and keep it in your password manager. It is **not** needed by the
   app and must never be put in any `.env` file in this repository.
5. Plan: Free is fine for development; move to Pro before real customers (daily backups, no pausing).

## 2. Authentication settings (Dashboard → Authentication)

- **Sign In / Providers → Email:** enabled; **Confirm email: ON**; minimum password length 8.
- **URL Configuration:**
  - Site URL: `com.linqora.books://auth/callback`
  - Redirect URLs (add all):
    - `com.linqora.books://auth/callback**`
    - `http://localhost:5180/**` (browser development only)
- **Emails:** the default sender works for testing (low hourly limit). Before real customers, configure custom SMTP
  (Authentication → Emails → SMTP) with a Linqora domain.

## 3. Apply the database migrations

From this repository (Node 22+):

```bash
npx supabase@latest login
```

```bash
npx supabase@latest link --project-ref <linqora-books-project-ref>
```

Check the ref belongs to **linqora-books** before continuing (`npx supabase projects list`).

```bash
npx supabase@latest db push
```

This applies, in order:

| Migration | Contents |
|---|---|
| `20261028090000_core_schema.sql` | profiles, organizations, memberships, business settings, entitlements, accounting tables, audit/import tables, helper functions, **RLS policies**, grants |
| `20261028090100_accounting_rules.sql` | triggers enforcing the accounting rules, audit columns, audit log |
| `20261028090200_functions.sql` | `create_organization`, `convert_quotation`, `delete_draft_document`, `import_local_books` |
| `20261028090300_storage.sql` | private buckets `business-logos`, `receipts`, `attachments` + storage policies |

Alternative without the CLI: paste each file, in order, into **SQL Editor → New query → Run**.

## 4. Development test access

Billing is not connected, so a new business is **view-only** until access is granted. For testing, run
`supabase/dev-test-access.sql` (SQL Editor). Option A gives every new business 30 days of clearly-labelled
*development test access* (`environment = 'test'`, `source = 'development'`) — never a paid subscription.
Remove it before onboarding real customers.

## 5. Configure the app (keys stay on your computer)

Dashboard → **Project Settings → API Keys**: copy the **Project URL** and the **Publishable key**
(`sb_publishable_…`; the legacy `anon` key also works). **Do not copy the secret / service_role key** — the app refuses
to start with it.

Create `apps/mobile/.env.production.local` (and `apps/mobile/.env.development.local` for `pnpm dev`):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

These files are git-ignored. Then build the cloud APK:

```bash
pnpm android:debug
```

(`pnpm android:debug:preview` builds the on-device local preview instead.)

## 6. Verify the live project (once connected — not yet done)

1. Sign up two accounts on two phones (or phone + browser) with real inboxes; verify both via the e-mail link.
2. Each creates a business; add records; confirm each sees only their own.
3. Sign in to account 1 on a second device: the same records appear.
4. In SQL Editor, check RLS is on everywhere:
   `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';`
5. Dashboard → **Advisors → Security** should report no RLS warnings for `public` tables.

## What has been tested (and what has not)

- **Tested locally:** all migrations run in embedded PostgreSQL (PGlite) with stand-ins for Supabase's `auth`
  schema, roles and default grants, and `storage` schema. 61 tests act as different users (two accounts / two
  businesses, staff, viewers, anonymous, service role) and exercise RLS, grants, triggers, server functions, the
  real `CloudBooksRepository` and the import. See `supabase/tests/`.
- **Not yet tested:** the hosted project (Supabase Auth e-mails, PostgREST, Storage signed URLs, real deep links on
  a phone). These need the project above; see step 6 and docs/PHASE_2_REPORT.md.
