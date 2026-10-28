import type { CurrencyCode, MinorUnits } from './money';
import type { ISODate, ISODateTime } from './dates';

/**
 * Where a record came from. "sample" records exist only to demonstrate the UI and
 * must never be presented or exported as genuine accounting data.
 */
export type RecordOrigin = 'sample' | 'user' | 'integration';

/** Link to a record in an external system (e.g. a website's quotation). */
export interface ExternalRef {
  connectionId: string;
  system: string;
  externalId: string;
  externalVersion?: string;
  lastSyncedAt?: ISODateTime;
}

export interface VoidInfo {
  at: ISODateTime;
  by: string;
  reason: string;
}

/** Fields every financial record carries for traceability. */
export interface AuditFields {
  id: string;
  organizationId: string;
  createdAt: ISODateTime;
  createdBy: string;
  updatedAt: ISODateTime;
  updatedBy: string;
  origin: RecordOrigin;
  externalRef?: ExternalRef;
}

export const BUSINESS_CATEGORIES = [
  'retail',
  'events',
  'garage_services',
  'freelancer',
  'contractor',
  'trading',
  'restaurant',
  'consulting',
  'other',
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const BUSINESS_CATEGORY_LABELS: Record<BusinessCategory, string> = {
  retail: 'Retail shop',
  events: 'Event management',
  garage_services: 'Garage / service business',
  freelancer: 'Freelancer',
  contractor: 'Contractor',
  trading: 'Trading business',
  restaurant: 'Restaurant / café',
  consulting: 'Consultant',
  other: 'Other business',
};

export interface TaxRegistration {
  label: string;
  number: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  category: BusinessCategory;
  address: string;
  currency: CurrencyCode;
  /** 1 = January … 4 = April (Indian financial year) */
  financialYearStartMonth: number;
  timeZone: string;
  taxRegistration?: TaxRegistration;
  logoDataUrl?: string;
  modules: { projects: boolean };
  createdAt: ISODateTime;
}

export type ContactKind = 'customer' | 'supplier' | 'both';

export interface Contact extends AuditFields {
  kind: ContactKind;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  archived: boolean;
}

export type MoneyAccountKind = 'cash' | 'bank' | 'wallet';

export interface MoneyAccount extends AuditFields {
  name: string;
  kind: MoneyAccountKind;
  currency: CurrencyCode;
  openingBalance: MinorUnits;
  openingDate: ISODate;
  /** Last statement balance the user reconciled against, if any. */
  reconciledBalance?: MinorUnits;
  reconciledAt?: ISODate;
  archived: boolean;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
}

export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

/**
 * Transaction kinds and their effect:
 *
 * | kind             | profit & loss          | cash/bank  |
 * |------------------|------------------------|------------|
 * | income           | + revenue              | money in   |
 * | expense          | + expense              | money out  |
 * | payment_received | none (settles invoice) | money in   |
 * | payment_made     | none (settles bill)    | money out  |
 * | refund_given     | − revenue              | money out  |
 * | transfer         | none                   | moves only |
 */
export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'payment_received',
  'payment_made',
  'refund_given',
  'transfer',
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface Transaction extends AuditFields {
  kind: TransactionKind;
  date: ISODate;
  /** Always positive; the kind decides direction. */
  amount: MinorUnits;
  currency: CurrencyCode;
  accountId: string;
  /** Destination account, transfers only. */
  toAccountId?: string;
  contactId?: string;
  categoryId?: string;
  projectId?: string;
  /** Invoice (payment_received / refund_given) or bill (payment_made). */
  documentId?: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  description: string;
  status: 'posted' | 'void';
  void?: VoidInfo;
  /** Reverses or corrects this earlier transaction. */
  correctsTransactionId?: string;
}

export type DocumentType = 'quotation' | 'invoice' | 'bill';

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';
/** Stored status. Payment status (paid/partial/overdue) is derived from payments. */
export type InvoiceStatus = 'draft' | 'issued' | 'void';
export type DocumentStatus = QuotationStatus | InvoiceStatus;

export interface DocumentLine {
  id: string;
  description: string;
  /** Decimal string, up to 3 places ("1", "2.5"). */
  quantity: string;
  unitPrice: MinorUnits;
  /** Tax rate in basis points: 1800 = 18%. */
  taxRateBps: number;
}

export interface BusinessDocument extends AuditFields {
  type: DocumentType;
  /** Assigned once and never changed (invoice/bill on issue, quotation on first save). */
  number?: string;
  status: DocumentStatus;
  contactId: string;
  projectId?: string;
  categoryId?: string;
  issueDate: ISODate;
  dueDate?: ISODate;
  validUntil?: ISODate;
  currency: CurrencyCode;
  lines: DocumentLine[];
  notes?: string;
  /** For invoices created from a quotation. */
  convertedFromId?: string;
  /** For quotations converted to an invoice. */
  convertedToId?: string;
  void?: VoidInfo;
}

export type ProjectStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface Project extends AuditFields {
  name: string;
  customerId?: string;
  status: ProjectStatus;
  estimatedRevenue: MinorUnits;
  estimatedCost: MinorUnits;
  currency: CurrencyCode;
  startDate?: ISODate;
  endDate?: ISODate;
  notes?: string;
}

/** Snapshot of all records for one organization, used by the calculation functions. */
export interface BooksData {
  business: BusinessProfile;
  contacts: Contact[];
  accounts: MoneyAccount[];
  transactions: Transaction[];
  documents: BusinessDocument[];
  projects: Project[];
  categories: Category[];
}
