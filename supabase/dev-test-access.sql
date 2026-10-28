-- =============================================================================
-- DEVELOPMENT / TESTING ONLY — run in the SQL editor of the Linqora Books project.
-- Never run against a production project that has real customers.
--
-- Billing is not connected in Phase 2, so new businesses have no write access.
-- This grants clearly-labelled TEST access (environment 'test', source
-- 'development'). It is never a paid subscription and cannot become production
-- access (enforced by table constraints).
-- =============================================================================

-- Option A: every business created from now on gets 30 days of test access.
insert into public.app_settings (key, value) values ('dev_test_access_days', '30')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Option B: grant one existing business (replace the e-mail).
-- update public.entitlements e
--    set status = 'complimentary', environment = 'test', source = 'development',
--        access_ends_at = current_date + 30, note = 'Development test access', updated_at = now()
--  from public.organization_members m
--  join auth.users u on u.id = m.user_id
--  where m.organization_id = e.organization_id and m.role = 'owner' and u.email = 'you@example.com';

-- To stop granting test access to new businesses:
-- delete from public.app_settings where key = 'dev_test_access_days';
