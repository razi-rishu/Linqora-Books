-- =============================================================================
-- Linqora Books — accounting rules enforced in the database
--
-- These mirror packages/accounting-core (validateTransaction,
-- validateTransactionInBooks, document workflows) so that a modified or
-- outdated client cannot corrupt the books. See docs/ACCOUNTING_RULES.md.
--
-- Trusted server functions (convert, delete draft, import) set a transaction-
-- local flag "linqora.op" to unlock the specific transitions they perform.
-- PostgREST does not expose set_config to clients.
-- =============================================================================

create function public.current_op()
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('linqora.op', true), ''), 'client');
$$;

-- Document total in minor units, identical to accounting-core documentTotals():
-- line = round_half_away_from_zero(unitPrice × quantity); tax per line = round(line × bps / 10000).
-- numeric round() rounds halves away from zero, matching divRoundHalfUp.
create function public.document_totals(p_lines jsonb, out subtotal bigint, out tax bigint, out total bigint)
language sql immutable set search_path = '' as $$
  with l as (
    select round((x ->> 'unitPrice')::numeric * (x ->> 'quantity')::numeric) as amount,
           coalesce((x ->> 'taxRateBps')::numeric, 0) as bps
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as x
  )
  select coalesce(sum(amount), 0)::bigint,
         coalesce(sum(round(amount * bps / 10000)), 0)::bigint,
         coalesce(sum(amount + round(amount * bps / 10000)), 0)::bigint
  from l;
$$;

create function public.validate_lines(p_lines jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(p_lines) loop
    if coalesce(x ->> 'description', '') = '' then raise exception 'Every line needs a description'; end if;
    if (x ->> 'quantity') !~ '^\d{1,9}(\.\d{1,3})?$' or (x ->> 'quantity')::numeric <= 0 then
      raise exception 'Invalid quantity "%"', x ->> 'quantity';
    end if;
    if jsonb_typeof(x -> 'unitPrice') <> 'number' or (x ->> 'unitPrice')::numeric <> trunc((x ->> 'unitPrice')::numeric)
       or (x ->> 'unitPrice')::numeric < 0 then
      raise exception 'Unit price must be a whole, non-negative number of minor units';
    end if;
    if jsonb_typeof(x -> 'taxRateBps') <> 'number' or (x ->> 'taxRateBps')::numeric not between 0 and 100000
       or (x ->> 'taxRateBps')::numeric <> trunc((x ->> 'taxRateBps')::numeric) then
      raise exception 'Invalid tax rate';
    end if;
  end loop;
end;
$$;

-- Amount settled against an invoice (payments + applied advances) or bill (payments).
create function public.document_settled(p_org uuid, p_doc text, p_type text)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.amount), 0)::bigint
  from public.transactions t
  where t.organization_id = p_org and t.document_id = p_doc and t.status = 'posted'
    and t.kind = any (case when p_type = 'bill' then array['payment_made'] else array['payment_received', 'advance_applied'] end);
$$;

create function public.advance_used(p_org uuid, p_advance text)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.amount), 0)::bigint
  from public.transactions t
  where t.organization_id = p_org and t.advance_id = p_advance and t.status = 'posted'
    and t.kind in ('advance_applied', 'advance_refunded');
$$;

-- ---------------------------------------------------------------------------
-- Audit columns: server stamps who/when; creation stamps are immutable.
-- ---------------------------------------------------------------------------
create function public.stamp_audit_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    if new.organization_id <> old.organization_id or new.id <> old.id then
      raise exception 'Records cannot be moved to another business or renamed';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'contacts', 'money_accounts', 'projects', 'documents', 'transactions'] loop
    execute format('create trigger %1$s_stamp before insert or update on public.%1$s for each row execute function public.stamp_audit_columns()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Business settings: currency locks once anything carries an amount.
-- ---------------------------------------------------------------------------
create function public.business_settings_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id then raise exception 'Settings belong to one business'; end if;
  if new.currency <> old.currency and (
    exists (select 1 from public.money_accounts where organization_id = new.organization_id)
    or exists (select 1 from public.projects where organization_id = new.organization_id)
    or exists (select 1 from public.transactions where organization_id = new.organization_id)
    or exists (select 1 from public.documents where organization_id = new.organization_id)
  ) then
    raise exception 'The currency cannot be changed once accounts, projects or records exist.';
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger business_settings_guard before update on public.business_settings
  for each row execute function public.business_settings_guard();

-- ---------------------------------------------------------------------------
-- Accounts: the opening balance/date/currency are fixed once entries use the account (rule D1).
-- ---------------------------------------------------------------------------
create function public.money_accounts_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_currency text;
begin
  select currency into v_currency from public.business_settings where organization_id = new.organization_id;
  if new.currency <> v_currency then raise exception 'Accounts must use the business currency (%)', v_currency; end if;
  if tg_op = 'INSERT' and new.opening_date > public.org_today(new.organization_id) then
    raise exception 'The opening balance date cannot be in the future';
  end if;
  if tg_op = 'UPDATE' and (new.opening_balance <> old.opening_balance or new.opening_date <> old.opening_date
      or new.currency <> old.currency)
     and exists (select 1 from public.transactions t where t.organization_id = new.organization_id
                 and (t.account_id = new.id or t.to_account_id = new.id)) then
    raise exception 'Opening balance, date and currency cannot change once entries use this account';
  end if;
  return new;
end;
$$;
create trigger money_accounts_guard before insert or update on public.money_accounts
  for each row execute function public.money_accounts_guard();

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create function public.documents_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_op text := public.current_op();
  v_currency text;
  v_contact_kind text;
  v_content_changed boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only drafts can be deleted. Void finalised documents instead.'; end if;
    if old.converted_from_id is not null and v_op <> 'release' then
      raise exception 'Use delete_draft_document() to remove an invoice created from a quotation';
    end if;
    return old;
  end if;

  perform public.validate_lines(new.lines);
  select currency into v_currency from public.business_settings where organization_id = new.organization_id;
  if new.currency <> v_currency then raise exception 'Documents must use the business currency (%)', v_currency; end if;
  select kind into v_contact_kind from public.contacts where organization_id = new.organization_id and id = new.contact_id;
  if new.type = 'bill' and v_contact_kind = 'customer' then raise exception 'Bills are from suppliers'; end if;
  if new.type <> 'bill' and v_contact_kind = 'supplier' then raise exception 'Quotations and invoices are for customers'; end if;

  if tg_op = 'INSERT' then
    if v_op = 'import' then return new; end if;
    if new.status <> 'draft' then raise exception 'New documents start as drafts'; end if;
    if new.type <> 'quotation' and new.number is not null then raise exception 'Invoices and bills get their number when issued'; end if;
    if new.converted_from_id is not null and v_op <> 'convert' then
      raise exception 'Use convert_quotation() to create an invoice from a quotation';
    end if;
    if new.converted_to_id is not null then raise exception 'Use convert_quotation()'; end if;
    return new;
  end if;

  -- UPDATE
  if v_op = 'import' then return new; end if;
  if old.status = 'void' then raise exception 'Void documents cannot be changed.'; end if;
  if old.type <> new.type then raise exception 'Document type cannot change'; end if;
  if old.number is not null and new.number is distinct from old.number then
    raise exception 'Document numbers cannot be changed once assigned.';
  end if;
  if new.converted_from_id is distinct from old.converted_from_id then raise exception 'Conversion links cannot be edited'; end if;

  v_content_changed := (new.contact_id, new.project_id, new.category_id, new.issue_date, new.due_date, new.valid_until,
                        new.currency, new.lines, new.notes)
                       is distinct from
                       (old.contact_id, old.project_id, old.category_id, old.issue_date, old.due_date, old.valid_until,
                        old.currency, old.lines, old.notes);
  if v_content_changed and old.status <> 'draft' then
    raise exception 'Only drafts can be edited. Finalised documents keep their original details.';
  end if;

  if new.status is distinct from old.status then
    if new.type = 'quotation' then
      if not (
        (old.status = 'draft' and new.status in ('sent', 'accepted', 'rejected'))
        or (old.status = 'sent' and new.status in ('accepted', 'rejected', 'draft'))
        or (old.status = 'rejected' and new.status = 'draft')
        or (old.status = 'accepted' and new.status = 'converted' and v_op = 'convert')
        or (old.status = 'converted' and new.status = 'accepted' and v_op = 'release')
      ) then
        raise exception 'Cannot change a quotation from % to %', old.status, new.status;
      end if;
    else
      if old.status = 'draft' and new.status = 'issued' then
        if jsonb_array_length(new.lines) = 0 then raise exception 'Add at least one line before issuing'; end if;
        if (public.document_totals(new.lines)).total <= 0 then raise exception 'Total must be greater than zero'; end if;
      elsif old.status = 'issued' and new.status = 'void' then
        if not public.can_void(new.organization_id) then raise exception 'Your role cannot void documents'; end if;
        if public.document_settled(new.organization_id, new.id, new.type) > 0 then
          raise exception 'Void the payments recorded against this document first';
        end if;
      else
        raise exception 'Cannot change a % from % to %', new.type, old.status, new.status;
      end if;
    end if;
  elsif new.converted_to_id is distinct from old.converted_to_id then
    raise exception 'Conversion links cannot be edited';
  end if;

  if new.status = 'void' and old.status <> 'void' then
    new.void_by := (select auth.uid());
    new.void_at := now();
  end if;
  return new;
end;
$$;
create trigger documents_guard before insert or update or delete on public.documents
  for each row execute function public.documents_guard();

-- ---------------------------------------------------------------------------
-- Transactions: rules D1–D3 and A1–A2, payment integrity, void-only updates.
-- ---------------------------------------------------------------------------
create function public.transactions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_op text := public.current_op();
  v_settings public.business_settings;
  v_account public.money_accounts;
  v_doc public.documents;
  v_advance public.transactions;
  v_contact_kind text;
  v_balance bigint;
  v_acc text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Transactions are voided, never deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'void' then raise exception 'Void transactions cannot be changed.'; end if;
    -- Only voiding is allowed: every other column must stay as it was.
    if (to_jsonb(new) - array['status', 'void_at', 'void_by', 'void_reason', 'updated_at', 'updated_by'])
       is distinct from (to_jsonb(old) - array['status', 'void_at', 'void_by', 'void_reason', 'updated_at', 'updated_by']) then
      raise exception 'Posted transactions cannot be edited. Void it and enter a new one.';
    end if;
    if new.status = 'void' then
      if not public.can_void(new.organization_id) then raise exception 'Your role cannot void transactions'; end if;
      if new.kind = 'advance_received' and exists (
        select 1 from public.transactions t
        where t.organization_id = new.organization_id and t.advance_id = new.id and t.status = 'posted'
      ) then
        raise exception 'Void the applications and refunds of this advance first';
      end if;
      new.void_by := (select auth.uid());
      new.void_at := now();
    end if;
    return new;
  end if;

  -- INSERT
  if new.status = 'void' then
    if v_op <> 'import' then raise exception 'New transactions are posted'; end if;
    return new; -- imported void history: kept for the record, excluded from totals
  end if;

  select * into v_settings from public.business_settings where organization_id = new.organization_id;
  if new.currency <> v_settings.currency then
    raise exception 'Amounts must be in %', v_settings.currency;
  end if;
  -- D2: no future-dated money (server clock, business time zone).
  if new.date > public.org_today(new.organization_id) then
    raise exception 'Money movements cannot be dated in the future';
  end if;
  -- D1: not before an account's opening date (both sides of a transfer).
  foreach v_acc in array array[new.account_id, new.to_account_id] loop
    continue when v_acc is null;
    select * into v_account from public.money_accounts where organization_id = new.organization_id and id = v_acc;
    if v_account.id is null then raise exception 'The chosen account does not exist in this business'; end if;
    if v_account.currency <> new.currency then raise exception '% is in %', v_account.name, v_account.currency; end if;
    if new.date < v_account.opening_date then
      raise exception '% starts on % with its opening balance — entries cannot be dated before that.',
        v_account.name, to_char(v_account.opening_date, 'DD Mon YYYY');
    end if;
  end loop;

  if new.document_id is not null then
    -- Lock the document so two simultaneous payments cannot both pass the balance check.
    select * into v_doc from public.documents
      where organization_id = new.organization_id and id = new.document_id for update;
    if v_doc.id is null then raise exception 'The linked document does not exist in this business'; end if;
  end if;

  if new.kind in ('payment_received', 'payment_made') then
    if v_doc.type is distinct from (case when new.kind = 'payment_received' then 'invoice' else 'bill' end) then
      raise exception '%', case when new.kind = 'payment_received'
        then 'A payment received must be linked to an invoice' else 'A payment made must be linked to a bill' end;
    end if;
    if v_doc.status is distinct from 'issued' then raise exception 'Cannot record a payment on a % %', v_doc.status, v_doc.type; end if;
    if new.contact_id is not null and new.contact_id <> v_doc.contact_id then
      raise exception 'The contact does not match the document';
    end if;
    -- D3: not before the document.
    if new.date < v_doc.issue_date then
      raise exception 'This cannot be dated before the % date (%).%', v_doc.type, to_char(v_doc.issue_date, 'DD Mon YYYY'),
        case when new.kind = 'payment_received'
          then ' Money received before the invoice is a customer advance — record it as an advance and apply it to this invoice.'
          else '' end;
    end if;
    v_balance := (public.document_totals(v_doc.lines)).total - public.document_settled(new.organization_id, v_doc.id, v_doc.type);
    if new.amount > v_balance then raise exception 'Amount is more than the outstanding balance'; end if;

  elsif new.kind = 'refund_given' and v_doc.id is not null then
    if v_doc.type <> 'invoice' or v_doc.status <> 'issued' then
      raise exception 'A refund can only be linked to an issued invoice';
    end if;
    if new.date < v_doc.issue_date then
      raise exception 'This cannot be dated before the invoice date (%).', to_char(v_doc.issue_date, 'DD Mon YYYY');
    end if;

  elsif new.kind = 'advance_received' then
    select kind into v_contact_kind from public.contacts where organization_id = new.organization_id and id = new.contact_id;
    if v_contact_kind = 'supplier' then raise exception 'Advances are received from customers, not suppliers'; end if;

  elsif new.kind in ('advance_applied', 'advance_refunded') then
    select * into v_advance from public.transactions
      where organization_id = new.organization_id and id = new.advance_id for update;
    if v_advance.id is null or v_advance.kind <> 'advance_received' or v_advance.status <> 'posted' then
      raise exception 'The advance does not exist or has been voided';
    end if;
    if new.contact_id is not null and new.contact_id <> v_advance.contact_id then
      raise exception 'The advance belongs to a different customer';
    end if;
    if new.date < v_advance.date then
      raise exception 'This cannot be dated before the advance was received (%)', to_char(v_advance.date, 'DD Mon YYYY');
    end if;
    if new.amount > v_advance.amount - public.advance_used(new.organization_id, v_advance.id) then
      raise exception 'Amount is more than the unused part of the advance';
    end if;
    if new.kind = 'advance_applied' then
      if v_doc.type is distinct from 'invoice' then raise exception 'Advances can only be applied to invoices'; end if;
      if v_doc.status is distinct from 'issued' then raise exception 'Cannot record a payment on a % invoice', v_doc.status; end if;
      if v_doc.contact_id <> v_advance.contact_id then
        raise exception 'The invoice is for a different customer than the advance';
      end if;
      if new.date < v_doc.issue_date then
        raise exception 'This cannot be dated before the invoice date (%).', to_char(v_doc.issue_date, 'DD Mon YYYY');
      end if;
      v_balance := (public.document_totals(v_doc.lines)).total - public.document_settled(new.organization_id, v_doc.id, 'invoice');
      if new.amount > v_balance then raise exception 'Amount is more than the outstanding balance'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger transactions_guard before insert or update or delete on public.transactions
  for each row execute function public.transactions_guard();

-- ---------------------------------------------------------------------------
-- Audit log: append-only history of every change to business records.
-- ---------------------------------------------------------------------------
create function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (organization_id, table_name, row_id, action, actor, before, after)
  values (
    coalesce(new.organization_id, old.organization_id),
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', coalesce(new.organization_id, old.organization_id)::text),
    lower(tg_op),
    (select auth.uid()),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['business_settings', 'categories', 'contacts', 'money_accounts', 'projects', 'documents', 'transactions'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

revoke all on function public.current_op(), public.document_settled(uuid, text, text), public.advance_used(uuid, text),
  public.stamp_audit_columns(), public.business_settings_guard(), public.money_accounts_guard(), public.documents_guard(),
  public.transactions_guard(), public.write_audit_log() from public, anon, authenticated;
grant execute on function public.document_totals(jsonb), public.validate_lines(jsonb) to authenticated;
