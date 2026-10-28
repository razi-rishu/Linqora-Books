-- =====================================================================
-- DRAFT — NOT APPLIED. Linqora Books Phase 2 starting point.
-- Review before running against the dedicated Linqora Books Supabase
-- project (never the Linqora QR production database).
--
-- Principles:
--  * every financial row has organization_id; RLS restricts it to members
--  * money is bigint minor units + currency code; never float/numeric(…) mixing
--  * no hard deletes of finalised records: status = 'void' with reason
--  * client-generated ids allow idempotent retries
-- =====================================================================

create type org_role as enum ('owner', 'administrator', 'accountant', 'staff', 'viewer');
create type record_origin as enum ('sample', 'user', 'integration');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  category text not null,
  address text not null default '',
  currency char(3) not null default 'INR',
  financial_year_start_month smallint not null default 4 check (financial_year_start_month between 1 and 12),
  time_zone text not null default 'Asia/Kolkata',
  tax_label text,
  tax_number text,
  logo_path text,                -- Supabase Storage object path
  projects_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role org_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Helper used by every policy. SECURITY DEFINER so it can read memberships
-- without recursive RLS; search_path pinned to avoid hijacking.
create function is_member(org uuid, roles org_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
      and (roles is null or m.role = any(roles))
  );
$$;

-- Shared audit columns ------------------------------------------------
-- created_by / updated_by default to the caller; triggers (TODO) stamp updated_*.

create table contacts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  kind text not null check (kind in ('customer', 'supplier', 'both')),
  name text not null,
  phone text, email text, address text, tax_id text, notes text,
  archived boolean not null default false,
  origin record_origin not null default 'user',
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid not null default auth.uid()
);

create table money_accounts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'wallet')),
  currency char(3) not null,
  opening_balance bigint not null default 0,
  opening_date date not null,
  reconciled_balance bigint, reconciled_at date,
  archived boolean not null default false,
  origin record_origin not null default 'user',
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid not null default auth.uid()
);

create table projects (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  customer_id uuid references contacts(id),
  status text not null check (status in ('planned', 'active', 'completed', 'cancelled')),
  estimated_revenue bigint not null default 0,
  estimated_cost bigint not null default 0,
  currency char(3) not null,
  start_date date, end_date date, notes text,
  origin record_origin not null default 'user',
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid not null default auth.uid()
);

create table documents (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  type text not null check (type in ('quotation', 'invoice', 'bill')),
  number text,
  status text not null,
  contact_id uuid not null references contacts(id),
  project_id uuid references projects(id),
  category_id text,
  issue_date date not null,
  due_date date, valid_until date,
  currency char(3) not null,
  lines jsonb not null,           -- [{id, description, quantity, unitPrice, taxRateBps}]
  notes text,
  converted_from_id uuid references documents(id),
  converted_to_id uuid references documents(id),
  void_at timestamptz, void_by uuid, void_reason text,
  origin record_origin not null default 'user',
  external_connection_id uuid, external_id text, external_version text,
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid not null default auth.uid(),
  unique (organization_id, type, number),
  unique (converted_from_id),                               -- one invoice per quotation
  unique (organization_id, external_connection_id, external_id),
  check ((status = 'void') = (void_reason is not null))
);

create table transactions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  kind text not null check (kind in ('income','expense','payment_received','payment_made','refund_given','transfer')),
  date date not null,
  amount bigint not null check (amount > 0),
  currency char(3) not null,
  account_id uuid not null references money_accounts(id),
  to_account_id uuid references money_accounts(id),
  contact_id uuid references contacts(id),
  category_id text,
  project_id uuid references projects(id),
  document_id uuid references documents(id),
  payment_method text, reference text,
  description text not null,
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_at timestamptz, void_by uuid, void_reason text,
  corrects_transaction_id uuid references transactions(id),
  origin record_origin not null default 'user',
  idempotency_key text,
  created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid not null default auth.uid(),
  unique (organization_id, idempotency_key),
  check ((kind = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (kind not in ('payment_received', 'payment_made') or document_id is not null)
);

-- Append-only history of every change to financial rows (filled by triggers, TODO).
create table audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  table_name text not null,
  row_id uuid not null,
  action text not null,           -- insert | update | void
  actor uuid,
  at timestamptz not null default now(),
  before jsonb, after jsonb
);

-- Entitlements are written ONLY by the backend (service role) after verifying
-- the billing provider. Members may read their own organization's row.
create table entitlements (
  organization_id uuid primary key references organizations(id),
  status text not null,
  environment text not null check (environment in ('test', 'production')),
  source text not null,
  interval text,
  trial_started_at date, trial_ends_at date, access_ends_at date, next_billing_date date,
  auto_renew boolean not null default false,
  provider_customer_ref text,     -- provider ids only; never card data
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Row Level Security --------------------------------------------------
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table contacts enable row level security;
alter table money_accounts enable row level security;
alter table projects enable row level security;
alter table documents enable row level security;
alter table transactions enable row level security;
alter table audit_log enable row level security;
alter table entitlements enable row level security;

create policy org_read on organizations for select using (is_member(id));
create policy org_update on organizations for update using (is_member(id, array['owner','administrator']::org_role[]));
create policy members_read on organization_members for select using (is_member(organization_id));

-- Same pattern for each financial table: members read; writers write; no delete.
-- Writes additionally require an active entitlement (has_write_access, TODO Phase 5).
do $$
declare t text;
begin
  foreach t in array array['contacts','money_accounts','projects','documents','transactions'] loop
    execute format('create policy %1$s_read on %1$s for select using (is_member(organization_id))', t);
    execute format($p$create policy %1$s_insert on %1$s for insert with check (is_member(organization_id, array['owner','administrator','accountant','staff']::org_role[]))$p$, t);
    execute format($p$create policy %1$s_update on %1$s for update using (is_member(organization_id, array['owner','administrator','accountant','staff']::org_role[]))$p$, t);
  end loop;
end $$;

create policy audit_read on audit_log for select using (is_member(organization_id, array['owner','administrator','accountant']::org_role[]));
create policy entitlement_read on entitlements for select using (is_member(organization_id));
-- No insert/update policies on entitlements or audit_log: only the service role writes them.
