# apps/admin — placeholder

Reserved for the separate web administrator dashboard (Phase 5). See `docs/ARCHITECTURE.md` → *Admin dashboard*.

Planned functions: view registered businesses, subscription status, trial eligibility and expiry,
complimentary grants (grant/extend/revoke), plan entitlement configuration, usage metrics,
billing-event investigation, and administrative audit logs.

Rules it must follow:

- Every admin action is authorised **server-side** (Cloudflare Worker checks an `admin_users` role); the UI hiding a button is not security.
- No Supabase service-role key or other admin credential in frontend code.
- Every admin action writes an `admin_audit_log` row (who, what, when, why).
- Hosted separately from the customer app, behind its own sign-in.
