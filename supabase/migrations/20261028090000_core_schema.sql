-- =============================================================================
-- Linqora Books — core schema, membership and Row Level Security
--
-- Target: the DEDICATED Linqora Books Supabase project only (never Linqora QR).
--
-- Principles
--   * Every business record has organization_id and a composite primary key
--     (organization_id, id). Foreign keys are composite too, so a record can only
--     reference records of the SAME organization — ownership cannot be forged by
--     pointing at another business's account, contact or invoice.
--   * ids are client-generated (text, e.g. "txn_<uuid>") so retried writes are
--     idempotent: the same id cannot be inserted twice.
--   * Money is bigint minor units (paise) + a currency code. Never float.
--   * Finalised records are voided, never deleted (see accounting rules migration).
--   * Clients use the publishable (anon) key + the user's JWT. RLS decides
--     everything; the service-role key never ships in the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'administrator', 'accountant', 'staff', 'viewer');

-- ---------------------------------------------------------------------------
-- People and organizations
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.business_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  category text not null check (
    category in ('retail', 'events', 'garage_services', 'freelancer', 'contractor', 'trading', 'restaurant', 'consulting', 'other')
  ),
  address text not null default '' check (length(address) <= 500),
  currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED')),
  financial_year_start_month smallint not null default 4 check (financial_year_start_month between 1 and 12),
  time_zone text not null default 'Asia/Kolkata' check (length(time_zone) between 1 and 64),
  tax_label text check (length(tax_label) <= 30),
  tax_number text check (length(tax_number) <= 30),
  -- Path inside the private "business-logos" bucket: <organization_id>/<file>
  logo_path text check (logo_path is null or logo_path like organization_id::text || '/%'),
  projects_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Entitlements (written ONLY by the backend / administrators — never clients)
-- ---------------------------------------------------------------------------
create table public.entitlements (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null check (
    status in ('none', 'trialing', 'active', 'cancelled_active', 'grace_period', 'expired', 'complimentary')
  ),
  environment text not null check (environment in ('test', 'production')),
  source text not null check (
    source in ('development', 'google_play', 'app_store', 'revenuecat', 'external_gateway', 'complimentary')
  ),
  plan_interval text check (plan_interval in ('monthly', 'yearly')),
  trial_started_at date,
  trial_ends_at date,
  access_ends_at date,
  next_billing_date date,
  auto_renew boolean not null default false,
  provider_ref text,
  note text,
  granted_by text,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  -- A development grant can never masquerade as production access.
  check (source <> 'development' or environment = 'test'),
  check (environment = 'test' or verified_at is not null)
);

-- Private server configuration (no client access at all).
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Accounting records
-- ---------------------------------------------------------------------------
create table public.categories (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, id)
);

create table public.contacts (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  kind text not null check (kind in ('customer', 'supplier', 'both')),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text check (length(phone) <= 30),
  email text check (length(email) <= 254),
  address text check (length(address) <= 500),
  tax_id text check (length(tax_id) <= 30),
  notes text check (length(notes) <= 1000),
  archived boolean not null default false,
  origin text not null default 'user' check (origin in ('user', 'integration')),
  external_ref jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, id)
);

create table public.money_accounts (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('cash', 'bank', 'wallet')),
  currency text not null check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED')),
  opening_balance bigint not null default 0,
  opening_date date not null,
  reconciled_balance bigint,
  reconciled_at date,
  archived boolean not null default false,
  origin text not null default 'user' check (origin in ('user', 'integration')),
  external_ref jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, id)
);

create table public.projects (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  customer_id text,
  status text not null check (status in ('planned', 'active', 'completed', 'cancelled')),
  estimated_revenue bigint not null default 0 check (estimated_revenue >= 0),
  estimated_cost bigint not null default 0 check (estimated_cost >= 0),
  currency text not null check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED')),
  start_date date,
  end_date date check (end_date is null or start_date is null or end_date >= start_date),
  notes text check (length(notes) <= 1000),
  origin text not null default 'user' check (origin in ('user', 'integration')),
  external_ref jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, id),
  foreign key (organization_id, customer_id) references public.contacts (organization_id, id)
);

-- Quotations, invoices and supplier bills.
create table public.documents (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  type text not null check (type in ('quotation', 'invoice', 'bill')),
  number text check (length(number) between 1 and 40),
  status text not null,
  contact_id text not null,
  project_id text,
  category_id text,
  issue_date date not null,
  due_date date,
  valid_until date,
  currency text not null check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED')),
  -- [{id, description, quantity ("1.5"), unitPrice (minor units), taxRateBps}]
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200),
  notes text check (length(notes) <= 2000),
  converted_from_id text,
  converted_to_id text,
  void_at timestamptz,
  void_by uuid,
  void_reason text check (length(void_reason) <= 300),
  origin text not null default 'user' check (origin in ('user', 'integration')),
  external_ref jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, id),
  check (
    (type = 'quotation' and status in ('draft', 'sent', 'accepted', 'rejected', 'converted'))
    or (type in ('invoice', 'bill') and status in ('draft', 'issued', 'void'))
  ),
  check ((status = 'void') = (void_reason is not null and void_at is not null)),
  check (type in ('invoice', 'bill') or status = 'draft' or number is not null),
  check (status <> 'issued' or number is not null),
  check (converted_from_id is null or type = 'invoice'),
  check (converted_to_id is null or type = 'quotation'),
  check ((status = 'converted') = (converted_to_id is not null)),
  check (due_date is null or due_date >= issue_date),
  check (valid_until is null or valid_until >= issue_date),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  foreign key (organization_id, category_id) references public.categories (organization_id, id),
  foreign key (organization_id, converted_from_id) references public.documents (organization_id, id)
    deferrable initially deferred,
  foreign key (organization_id, converted_to_id) references public.documents (organization_id, id)
    deferrable initially deferred
);
-- Duplicate prevention: one number per type per business; one invoice per quotation.
create unique index documents_number_uniq on public.documents (organization_id, type, number) where number is not null;
create unique index documents_converted_from_uniq on public.documents (organization_id, converted_from_id)
  where converted_from_id is not null;

create table public.transactions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  kind text not null check (
    kind in ('income', 'expense', 'payment_received', 'payment_made', 'refund_given', 'transfer',
             'advance_received', 'advance_applied', 'advance_refunded')
  ),
  date date not null,
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED')),
  account_id text,
  to_account_id text,
  contact_id text,
  category_id text,
  project_id text,
  document_id text,
  advance_id text,
  payment_method text check (payment_method in ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text check (length(reference) <= 60),
  description text not null check (length(btrim(description)) between 1 and 200),
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_at timestamptz,
  void_by uuid,
  void_reason text check (length(void_reason) <= 300),
  corrects_transaction_id text,
  origin text not null default 'user' check (origin in ('user', 'integration')),
  external_ref jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (organization_id, id),
  -- Shape rules (mirror validateTransaction in packages/accounting-core).
  check ((kind = 'advance_applied') = (account_id is null)),
  check ((kind = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (kind <> 'transfer' or category_id is null),
  check (kind not in ('payment_received', 'payment_made', 'advance_applied') or document_id is not null),
  check (kind not in ('income', 'expense', 'advance_received', 'advance_refunded', 'transfer') or document_id is null),
  check ((kind in ('advance_applied', 'advance_refunded')) = (advance_id is not null)),
  check (kind <> 'advance_received' or (contact_id is not null and category_id is null)),
  check ((status = 'void') = (void_reason is not null and void_at is not null)),
  foreign key (organization_id, account_id) references public.money_accounts (organization_id, id),
  foreign key (organization_id, to_account_id) references public.money_accounts (organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id),
  foreign key (organization_id, category_id) references public.categories (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  foreign key (organization_id, document_id) references public.documents (organization_id, id),
  foreign key (organization_id, advance_id) references public.transactions (organization_id, id)
    deferrable initially deferred,
  foreign key (organization_id, corrects_transaction_id) references public.transactions (organization_id, id)
    deferrable initially deferred
);
create index transactions_document_idx on public.transactions (organization_id, document_id) where document_id is not null;
create index transactions_advance_idx on public.transactions (organization_id, advance_id) where advance_id is not null;
create index transactions_account_idx on public.transactions (organization_id, account_id);

-- ---------------------------------------------------------------------------
-- Imports and audit
-- ---------------------------------------------------------------------------
create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  imported_by uuid not null,
  source_fingerprint text not null check (length(source_fingerprint) between 8 and 128),
  source_business_name text,
  inserted jsonb not null default '{}'::jsonb,
  skipped jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, source_fingerprint)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid,
  at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
create index audit_log_org_idx on public.audit_log (organization_id, at desc);

-- =============================================================================
-- Authorization helpers. SECURITY DEFINER so policies can consult memberships
-- without recursive RLS; search_path is empty and every name is qualified.
-- =============================================================================
create function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create function public.has_role(p_org uuid, p_roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

-- "Today" in the business's own time zone, from the SERVER clock (never the device).
create function public.org_today(p_org uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select s.time_zone from public.business_settings s where s.organization_id = p_org), 'UTC'))::date;
$$;

-- Server-side entitlement check. Client-side subscription state is never trusted.
create function public.has_write_access(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements e
    where e.organization_id = p_org
      and e.status in ('trialing', 'active', 'cancelled_active', 'grace_period', 'complimentary')
      and (e.access_ends_at is null or e.access_ends_at >= public.org_today(p_org))
  );
$$;

-- Create / change records: owner, administrator, accountant, staff — with an active entitlement.
create function public.can_write(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_org, array['owner', 'administrator', 'accountant', 'staff']::public.org_role[])
     and public.has_write_access(p_org);
$$;

-- Void finalised records: owner, administrator, accountant.
create function public.can_void(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_org, array['owner', 'administrator', 'accountant']::public.org_role[])
     and public.has_write_access(p_org);
$$;

create function public.can_manage(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_org, array['owner', 'administrator']::public.org_role[]);
$$;

-- =============================================================================
-- Profiles are created automatically for every new auth user.
-- =============================================================================
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.business_settings enable row level security;
alter table public.entitlements enable row level security;
alter table public.app_settings enable row level security;
alter table public.categories enable row level security;
alter table public.contacts enable row level security;
alter table public.money_accounts enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.transactions enable row level security;
alter table public.data_imports enable row level security;
alter table public.audit_log enable row level security;

-- Anonymous visitors get nothing. Signed-in users get only the explicit grants
-- below (Supabase's default "grant all" is withdrawn first), and RLS on top.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all functions in schema public from anon, public;

-- Profiles: yourself and people in your businesses (to show names); edit only yourself.
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.organization_members a
    join public.organization_members b on a.organization_id = b.organization_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Organizations: members read; owners/administrators rename. Creation only via
-- create_organization(); no client deletes.
create policy organizations_select on public.organizations for select to authenticated using (public.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));

-- Memberships: members can see who is in their business. There are NO insert,
-- update or delete policies — memberships change only through SECURITY DEFINER
-- functions, so nobody can add themselves to a business or promote themselves.
create policy members_select on public.organization_members for select to authenticated using (public.is_member(organization_id));

create policy settings_select on public.business_settings for select to authenticated using (public.is_member(organization_id));
create policy settings_update on public.business_settings for update to authenticated
  using (public.can_manage(organization_id)) with check (public.can_manage(organization_id));

create policy entitlements_select on public.entitlements for select to authenticated using (public.is_member(organization_id));
-- app_settings: RLS on, no policies → no client access.

create policy imports_select on public.data_imports for select to authenticated using (public.is_member(organization_id));
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_role(organization_id, array['owner', 'administrator', 'accountant']::public.org_role[]));

-- Accounting records: members read; writers insert/update (the accounting-rules
-- triggers decide WHAT may change). Only draft documents may be deleted.
do $$
declare t text;
begin
  foreach t in array array['categories', 'contacts', 'money_accounts', 'projects', 'documents', 'transactions'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write(organization_id)) with check (public.can_write(organization_id))', t);
  end loop;
end $$;
create policy documents_delete on public.documents for delete to authenticated using (public.can_write(organization_id));

-- Table privileges for signed-in users (RLS still applies to every row).
grant select, update on public.profiles to authenticated;
grant select on public.organizations, public.organization_members, public.entitlements,
  public.data_imports, public.audit_log, public.business_settings to authenticated;
grant update (name) on public.organizations to authenticated;
grant update (category, address, currency, financial_year_start_month, time_zone, tax_label, tax_number,
  logo_path, projects_enabled) on public.business_settings to authenticated;
grant select, insert, update on public.categories, public.contacts, public.money_accounts, public.projects,
  public.documents, public.transactions to authenticated;
grant delete on public.documents to authenticated;

grant execute on function public.is_member(uuid), public.has_role(uuid, public.org_role[]), public.org_today(uuid),
  public.has_write_access(uuid), public.can_write(uuid), public.can_void(uuid), public.can_manage(uuid) to authenticated;
