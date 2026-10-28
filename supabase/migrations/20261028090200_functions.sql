-- =============================================================================
-- Linqora Books — server functions (RPC)
--
-- Operations that touch several rows run here, atomically, after checking the
-- caller's membership, role and entitlement. All are SECURITY DEFINER with an
-- empty search_path, and are retry-safe (idempotent) where a retry is plausible.
-- =============================================================================

-- Creates a business for the signed-in, e-mail-verified user, who becomes owner.
-- Phase 2: one business per user (the schema supports many).
create function public.create_organization(p_name text, p_settings jsonb, p_categories jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_days int;
  v_cat jsonb;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'Verify your e-mail address before creating a business';
  end if;
  if exists (select 1 from public.organization_members m where m.user_id = v_uid and m.role = 'owner') then
    raise exception 'You already have a business. Multiple businesses per account are not available yet.';
  end if;
  if jsonb_typeof(coalesce(p_categories, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_categories, '[]'::jsonb)) > 100 then
    raise exception 'Invalid categories';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.organizations (name, created_by) values (btrim(p_name), v_uid) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.business_settings (
    organization_id, category, address, currency, financial_year_start_month, time_zone, tax_label, tax_number, projects_enabled
  ) values (
    v_org,
    coalesce(p_settings ->> 'category', 'other'),
    coalesce(p_settings ->> 'address', ''),
    coalesce(p_settings ->> 'currency', 'INR'),
    coalesce((p_settings ->> 'financialYearStartMonth')::smallint, 4),
    coalesce(p_settings ->> 'timeZone', 'Asia/Kolkata'),
    nullif(p_settings ->> 'taxLabel', ''),
    nullif(p_settings ->> 'taxNumber', ''),
    coalesce((p_settings ->> 'projectsEnabled')::boolean, true)
  );
  for v_cat in select * from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) loop
    insert into public.categories (organization_id, id, name, kind)
    values (v_org, v_cat ->> 'id', v_cat ->> 'name', v_cat ->> 'kind')
    on conflict do nothing;
  end loop;

  -- No paid access exists yet. A development deployment may grant clearly-labelled
  -- TEST access (environment 'test', source 'development') — configured on the server
  -- in app_settings, never by the client. Production leaves this unset.
  select (value #>> '{}')::int into v_days from public.app_settings where key = 'dev_test_access_days';
  if v_days is not null and v_days > 0 then
    insert into public.entitlements (organization_id, status, environment, source, access_ends_at, note, granted_by)
    values (v_org, 'complimentary', 'test', 'development', public.org_today(v_org) + v_days,
            'Development test access — not a subscription', 'app_settings.dev_test_access_days');
  else
    insert into public.entitlements (organization_id, status, environment, source, note)
    values (v_org, 'none', 'test', 'development', 'No access granted yet');
  end if;
  return v_org;
end;
$$;

-- Accepted quotation → draft invoice, atomically. Retry-safe: repeating the call
-- with the same invoice id is a no-op; a different id is refused.
create function public.convert_quotation(p_org uuid, p_quotation_id text, p_invoice_id text, p_issue_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.documents;
begin
  if not public.can_write(p_org) then raise exception 'Not allowed'; end if;
  select * into q from public.documents where organization_id = p_org and id = p_quotation_id for update;
  if q.id is null or q.type <> 'quotation' then raise exception 'Quotation not found'; end if;
  if q.status = 'converted' then
    if q.converted_to_id = p_invoice_id then return; end if;
    raise exception 'This quotation has already been converted to an invoice';
  end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can be converted'; end if;

  perform set_config('linqora.op', 'convert', true);
  insert into public.documents (organization_id, id, type, status, contact_id, project_id, category_id, issue_date,
                                currency, lines, notes, converted_from_id)
  values (p_org, p_invoice_id, 'invoice', 'draft', q.contact_id, q.project_id, q.category_id, p_issue_date,
          q.currency, q.lines, q.notes, q.id);
  update public.documents set status = 'converted', converted_to_id = p_invoice_id
    where organization_id = p_org and id = q.id;
  perform set_config('linqora.op', '', true);
end;
$$;

-- Deletes a draft; deleting the draft invoice of a conversion returns its quotation
-- to "accepted" in the same transaction. Retry-safe (missing draft = done).
create function public.delete_draft_document(p_org uuid, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  if not public.can_write(p_org) then raise exception 'Not allowed'; end if;
  select * into d from public.documents where organization_id = p_org and id = p_id for update;
  if d.id is null then return; end if;
  if d.status <> 'draft' then raise exception 'Only drafts can be deleted. Void finalised documents instead.'; end if;
  perform set_config('linqora.op', 'release', true);
  if d.converted_from_id is not null then
    update public.documents set status = 'accepted', converted_to_id = null
      where organization_id = p_org and id = d.converted_from_id and converted_to_id = d.id;
  end if;
  delete from public.documents where organization_id = p_org and id = p_id;
  perform set_config('linqora.op', '', true);
end;
$$;

-- Imports reviewed Phase 1 local records into the caller's business, atomically.
-- * Rows keep their local ids, so the same record is never imported twice
--   (ON CONFLICT DO NOTHING); re-running the same import is refused by fingerprint.
-- * Sample records are rejected by the table constraints (origin must be user/integration).
-- * Every row passes the same accounting triggers as a normal write; one failure
--   aborts the whole import (nothing half-imported).
create function public.import_local_books(p_org uuid, p_payload jsonb, p_fingerprint text, p_source_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inserted jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_total int;
  v_count int;
  t text;
  v_row jsonb;
begin
  if not (public.can_write(p_org) and public.can_manage(p_org)) then
    raise exception 'Only an owner or administrator with active access can import records';
  end if;
  if exists (select 1 from public.data_imports where organization_id = p_org and source_fingerprint = p_fingerprint) then
    return jsonb_build_object('status', 'already_imported');
  end if;
  perform set_config('linqora.op', 'import', true);

  foreach t in array array['categories', 'contacts', 'money_accounts', 'projects'] loop
    v_total := jsonb_array_length(coalesce(p_payload -> t, '[]'::jsonb));
    execute format(
      'insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I, $1) on conflict do nothing',
      t)
      using (select coalesce(jsonb_agg(r || jsonb_build_object('organization_id', p_org)), '[]'::jsonb)
             from jsonb_array_elements(coalesce(p_payload -> t, '[]'::jsonb)) r);
    get diagnostics v_count = row_count;
    v_inserted := v_inserted || jsonb_build_object(t, v_count);
    v_skipped := v_skipped || jsonb_build_object(t, v_total - v_count);
  end loop;

  -- Documents: insert without conversion links first, then restore the links.
  v_total := jsonb_array_length(coalesce(p_payload -> 'documents', '[]'::jsonb));
  insert into public.documents
    select * from jsonb_populate_recordset(null::public.documents, (
      select coalesce(jsonb_agg(r || jsonb_build_object('organization_id', p_org, 'converted_to_id', null,
                                  'status', case when r ->> 'status' = 'converted' then 'accepted' else r ->> 'status' end)),
                      '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_payload -> 'documents', '[]'::jsonb)) r))
    on conflict do nothing;
  get diagnostics v_count = row_count;
  v_inserted := v_inserted || jsonb_build_object('documents', v_count);
  v_skipped := v_skipped || jsonb_build_object('documents', v_total - v_count);
  for v_row in select * from jsonb_array_elements(coalesce(p_payload -> 'documents', '[]'::jsonb)) loop
    if v_row ->> 'converted_to_id' is not null then
      update public.documents set status = 'converted', converted_to_id = v_row ->> 'converted_to_id'
        where organization_id = p_org and id = v_row ->> 'id' and converted_to_id is null;
    end if;
  end loop;

  -- Transactions: advances before what uses them, then by date, so every row
  -- validates against the rows it depends on.
  v_total := jsonb_array_length(coalesce(p_payload -> 'transactions', '[]'::jsonb));
  v_count := 0;
  for v_row in
    select r from jsonb_array_elements(coalesce(p_payload -> 'transactions', '[]'::jsonb)) r
    order by (r ->> 'kind' in ('advance_applied', 'advance_refunded')), r ->> 'date', r ->> 'id'
  loop
    insert into public.transactions
      select * from jsonb_populate_record(null::public.transactions, v_row || jsonb_build_object('organization_id', p_org))
      on conflict do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  v_inserted := v_inserted || jsonb_build_object('transactions', v_count);
  v_skipped := v_skipped || jsonb_build_object('transactions', v_total - v_count);

  perform set_config('linqora.op', '', true);
  insert into public.data_imports (organization_id, imported_by, source_fingerprint, source_business_name, inserted, skipped)
  values (p_org, v_uid, p_fingerprint, left(p_source_name, 120), v_inserted, v_skipped);
  return jsonb_build_object('status', 'imported', 'inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

revoke all on function public.create_organization(text, jsonb, jsonb), public.convert_quotation(uuid, text, text, date),
  public.delete_draft_document(uuid, text), public.import_local_books(uuid, jsonb, text, text) from public, anon;
grant execute on function public.create_organization(text, jsonb, jsonb), public.convert_quotation(uuid, text, text, date),
  public.delete_draft_document(uuid, text), public.import_local_books(uuid, jsonb, text, text) to authenticated;
