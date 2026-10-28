/**
 * App records (camelCase, packages/accounting-core) ↔ database rows (snake_case).
 * Server-managed columns (created_at/by, updated_at/by, void_by/void_at on void)
 * are read back but never trusted from the client: triggers stamp them.
 */
import type {
  BusinessDocument,
  BusinessProfile,
  Category,
  Contact,
  CurrencyCode,
  ExternalRef,
  MoneyAccount,
  Project,
  Transaction,
} from '@linqora-books/accounting-core';
import type { Entitlement } from '@linqora-books/billing';
import { CloudError } from './gateway';

type Row = Record<string, unknown>;

interface AuditRow {
  organization_id: string;
  id: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  origin: 'user' | 'integration';
  external_ref: ExternalRef | null;
}

export interface ContactRow extends AuditRow {
  kind: Contact['kind'];
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  archived: boolean;
}
export interface AccountRow extends AuditRow {
  name: string;
  kind: MoneyAccount['kind'];
  currency: CurrencyCode;
  opening_balance: number;
  opening_date: string;
  reconciled_balance: number | null;
  reconciled_at: string | null;
  archived: boolean;
}
export interface ProjectRow extends AuditRow {
  name: string;
  customer_id: string | null;
  status: Project['status'];
  estimated_revenue: number;
  estimated_cost: number;
  currency: CurrencyCode;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}
export interface DocumentRow extends AuditRow {
  type: BusinessDocument['type'];
  number: string | null;
  status: BusinessDocument['status'];
  contact_id: string;
  project_id: string | null;
  category_id: string | null;
  issue_date: string;
  due_date: string | null;
  valid_until: string | null;
  currency: CurrencyCode;
  lines: BusinessDocument['lines'];
  notes: string | null;
  converted_from_id: string | null;
  converted_to_id: string | null;
  void_at: string | null;
  void_by: string | null;
  void_reason: string | null;
}
export interface TransactionRow extends AuditRow {
  kind: Transaction['kind'];
  date: string;
  amount: number;
  currency: CurrencyCode;
  account_id: string | null;
  to_account_id: string | null;
  contact_id: string | null;
  category_id: string | null;
  project_id: string | null;
  document_id: string | null;
  advance_id: string | null;
  payment_method: Transaction['paymentMethod'] | null;
  reference: string | null;
  description: string;
  status: Transaction['status'];
  void_at: string | null;
  void_by: string | null;
  void_reason: string | null;
  corrects_transaction_id: string | null;
}
export interface CategoryRow {
  organization_id: string;
  id: string;
  name: string;
  kind: Category['kind'];
}
export interface OrganizationRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}
export interface SettingsRow {
  organization_id: string;
  category: BusinessProfile['category'];
  address: string;
  currency: CurrencyCode;
  financial_year_start_month: number;
  time_zone: string;
  tax_label: string | null;
  tax_number: string | null;
  logo_path: string | null;
  projects_enabled: boolean;
}
export interface EntitlementRow {
  organization_id: string;
  status: Entitlement['status'];
  environment: Entitlement['environment'];
  source: Entitlement['source'];
  plan_interval: 'monthly' | 'yearly' | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  access_ends_at: string | null;
  next_billing_date: string | null;
  auto_renew: boolean;
  verified_at: string | null;
  note: string | null;
}

/** `undefined` for null, so optional fields stay absent like in local records. */
function opt<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v;
}
function n(v: unknown): number {
  return typeof v === 'string' ? Number(v) : (v as number);
}
function only<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function auditFrom(r: AuditRow) {
  return only({
    id: r.id,
    organizationId: r.organization_id,
    createdAt: r.created_at,
    createdBy: r.created_by ?? 'unknown',
    updatedAt: r.updated_at,
    updatedBy: r.updated_by ?? 'unknown',
    origin: r.origin,
    externalRef: opt(r.external_ref),
  }) as Pick<Contact, 'id' | 'organizationId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'origin' | 'externalRef'>;
}

function assertCloudOrigin(origin: string, id: string): void {
  if (origin === 'sample') throw new CloudError('validation', `Sample record ${id} cannot be stored in the cloud`);
}

/** Columns a client may write for any business record. */
function auditTo(r: { id: string; origin: string; externalRef?: ExternalRef }, org: string) {
  assertCloudOrigin(r.origin, r.id);
  return { organization_id: org, id: r.id, origin: r.origin, external_ref: r.externalRef ?? null };
}

export function contactFromRow(r: ContactRow): Contact {
  return {
    ...auditFrom(r),
    ...only({ phone: opt(r.phone), email: opt(r.email), address: opt(r.address), taxId: opt(r.tax_id), notes: opt(r.notes) }),
    kind: r.kind,
    name: r.name,
    archived: r.archived,
  };
}
export function contactToRow(c: Contact, org: string): Row {
  return {
    ...auditTo(c, org),
    kind: c.kind,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
    tax_id: c.taxId ?? null,
    notes: c.notes ?? null,
    archived: c.archived,
  };
}

export function accountFromRow(r: AccountRow): MoneyAccount {
  return {
    ...auditFrom(r),
    ...only({ reconciledBalance: r.reconciled_balance === null ? undefined : n(r.reconciled_balance), reconciledAt: opt(r.reconciled_at) }),
    name: r.name,
    kind: r.kind,
    currency: r.currency,
    openingBalance: n(r.opening_balance),
    openingDate: r.opening_date,
    archived: r.archived,
  };
}
export function accountToRow(a: MoneyAccount, org: string): Row {
  return {
    ...auditTo(a, org),
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    opening_balance: a.openingBalance,
    opening_date: a.openingDate,
    reconciled_balance: a.reconciledBalance ?? null,
    reconciled_at: a.reconciledAt ?? null,
    archived: a.archived,
  };
}

export function projectFromRow(r: ProjectRow): Project {
  return {
    ...auditFrom(r),
    ...only({ customerId: opt(r.customer_id), startDate: opt(r.start_date), endDate: opt(r.end_date), notes: opt(r.notes) }),
    name: r.name,
    status: r.status,
    estimatedRevenue: n(r.estimated_revenue),
    estimatedCost: n(r.estimated_cost),
    currency: r.currency,
  };
}
export function projectToRow(p: Project, org: string): Row {
  return {
    ...auditTo(p, org),
    name: p.name,
    customer_id: p.customerId ?? null,
    status: p.status,
    estimated_revenue: p.estimatedRevenue,
    estimated_cost: p.estimatedCost,
    currency: p.currency,
    start_date: p.startDate ?? null,
    end_date: p.endDate ?? null,
    notes: p.notes ?? null,
  };
}

export function documentFromRow(r: DocumentRow): BusinessDocument {
  return {
    ...auditFrom(r),
    ...only({
      number: opt(r.number),
      projectId: opt(r.project_id),
      categoryId: opt(r.category_id),
      dueDate: opt(r.due_date),
      validUntil: opt(r.valid_until),
      notes: opt(r.notes),
      convertedFromId: opt(r.converted_from_id),
      convertedToId: opt(r.converted_to_id),
      void: r.void_reason ? { at: r.void_at ?? '', by: r.void_by ?? 'unknown', reason: r.void_reason } : undefined,
    }),
    type: r.type,
    status: r.status,
    contactId: r.contact_id,
    issueDate: r.issue_date,
    currency: r.currency,
    lines: r.lines.map((l) => ({ ...l, unitPrice: n(l.unitPrice), taxRateBps: n(l.taxRateBps) })),
  };
}
export function documentToRow(d: BusinessDocument, org: string): Row {
  return {
    ...auditTo(d, org),
    type: d.type,
    number: d.number ?? null,
    status: d.status,
    contact_id: d.contactId,
    project_id: d.projectId ?? null,
    category_id: d.categoryId ?? null,
    issue_date: d.issueDate,
    due_date: d.dueDate ?? null,
    valid_until: d.validUntil ?? null,
    currency: d.currency,
    lines: d.lines,
    notes: d.notes ?? null,
    converted_from_id: d.convertedFromId ?? null,
    converted_to_id: d.convertedToId ?? null,
    void_at: d.void?.at ?? null,
    void_reason: d.void?.reason ?? null,
  };
}

export function transactionFromRow(r: TransactionRow): Transaction {
  return {
    ...auditFrom(r),
    ...only({
      accountId: opt(r.account_id),
      toAccountId: opt(r.to_account_id),
      contactId: opt(r.contact_id),
      categoryId: opt(r.category_id),
      projectId: opt(r.project_id),
      documentId: opt(r.document_id),
      advanceId: opt(r.advance_id),
      paymentMethod: opt(r.payment_method),
      reference: opt(r.reference),
      correctsTransactionId: opt(r.corrects_transaction_id),
      void: r.void_reason ? { at: r.void_at ?? '', by: r.void_by ?? 'unknown', reason: r.void_reason } : undefined,
    }),
    kind: r.kind,
    date: r.date,
    amount: n(r.amount),
    currency: r.currency,
    description: r.description,
    status: r.status,
  };
}
export function transactionToRow(t: Transaction, org: string): Row {
  return {
    ...auditTo(t, org),
    kind: t.kind,
    date: t.date,
    amount: t.amount,
    currency: t.currency,
    account_id: t.accountId ?? null,
    to_account_id: t.toAccountId ?? null,
    contact_id: t.contactId ?? null,
    category_id: t.categoryId ?? null,
    project_id: t.projectId ?? null,
    document_id: t.documentId ?? null,
    advance_id: t.advanceId ?? null,
    payment_method: t.paymentMethod ?? null,
    reference: t.reference ?? null,
    description: t.description,
    status: t.status,
    void_at: t.void?.at ?? null,
    void_reason: t.void?.reason ?? null,
    corrects_transaction_id: t.correctsTransactionId ?? null,
  };
}

export function categoryFromRow(r: CategoryRow): Category {
  return { id: r.id, name: r.name, kind: r.kind };
}
export function categoryToRow(c: Category, org: string): Row {
  return { organization_id: org, id: c.id, name: c.name, kind: c.kind };
}

export function businessFromRows(org: OrganizationRow, s: SettingsRow, logoUrl?: string): BusinessProfile {
  return {
    id: org.id,
    name: org.name,
    category: s.category,
    address: s.address,
    currency: s.currency,
    financialYearStartMonth: n(s.financial_year_start_month),
    timeZone: s.time_zone,
    modules: { projects: s.projects_enabled },
    createdAt: org.created_at,
    ...(s.tax_number ? { taxRegistration: { label: s.tax_label ?? 'Tax ID', number: s.tax_number } } : {}),
    ...(logoUrl ? { logoDataUrl: logoUrl } : {}),
  };
}
/** Settings columns a business owner/administrator may change. */
export function settingsPatch(b: BusinessProfile): Row {
  return {
    category: b.category,
    address: b.address,
    currency: b.currency,
    financial_year_start_month: b.financialYearStartMonth,
    time_zone: b.timeZone,
    tax_label: b.taxRegistration?.label ?? null,
    tax_number: b.taxRegistration?.number ?? null,
    projects_enabled: b.modules.projects,
  };
}
/** Arguments for create_organization(). */
export function createOrganizationArgs(b: BusinessProfile, categories: Category[]): Record<string, unknown> {
  return {
    p_name: b.name,
    p_settings: {
      category: b.category,
      address: b.address,
      currency: b.currency,
      financialYearStartMonth: b.financialYearStartMonth,
      timeZone: b.timeZone,
      taxLabel: b.taxRegistration?.label ?? '',
      taxNumber: b.taxRegistration?.number ?? '',
      projectsEnabled: b.modules.projects,
    },
    p_categories: categories,
  };
}

export function entitlementFromRow(r: EntitlementRow): Entitlement {
  return {
    status: r.status,
    environment: r.environment,
    source: r.source,
    autoRenew: r.auto_renew,
    ...only({
      interval: opt(r.plan_interval),
      trialStartedAt: opt(r.trial_started_at),
      trialEndsAt: opt(r.trial_ends_at),
      accessEndsAt: opt(r.access_ends_at),
      nextBillingDate: opt(r.next_billing_date),
      verifiedAt: opt(r.verified_at),
    }),
  };
}
