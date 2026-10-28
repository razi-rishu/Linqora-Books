/**
 * Document workflows: quotation → invoice conversion, issuing, voiding, payments.
 * All functions are pure: they return new records and never mutate their inputs.
 * Invalid transitions throw WorkflowError so callers cannot silently corrupt data.
 */
import type { BusinessDocument, DocumentType, Transaction, VoidInfo } from './models';
import { amountSettled, documentBalance, documentTotals } from './ledger';
import { financialYearCode, type ISODate, type ISODateTime } from './dates';
import type { MinorUnits } from './money';

export class WorkflowError extends Error {
  override name = 'WorkflowError';
}

export interface Actor {
  userId: string;
  now: ISODateTime;
}

const PREFIX: Record<DocumentType, string> = { quotation: 'QUO', invoice: 'INV', bill: 'BILL' };

/**
 * Next sequential number for the financial year, e.g. "INV/2026-27/0007".
 * Numbers already used — including those of void documents — are never reused.
 */
export function nextDocumentNumber(
  type: DocumentType,
  existing: BusinessDocument[],
  issueDate: ISODate,
  financialYearStartMonth: number,
): string {
  const prefix = `${PREFIX[type]}/${financialYearCode(issueDate, financialYearStartMonth)}/`;
  let max = 0;
  for (const doc of existing) {
    if (doc.type !== type || !doc.number?.startsWith(prefix)) continue;
    const seq = Number.parseInt(doc.number.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function canEditDocument(doc: BusinessDocument): boolean {
  return doc.status === 'draft';
}

function touch<T extends BusinessDocument>(doc: T, actor: Actor, patch: Partial<BusinessDocument>): T {
  return { ...doc, ...patch, updatedAt: actor.now, updatedBy: actor.userId };
}

export type QuotationAction = 'send' | 'accept' | 'reject' | 'reopen';

const QUOTATION_TRANSITIONS: Record<QuotationAction, { from: BusinessDocument['status'][]; to: BusinessDocument['status'] }> = {
  send: { from: ['draft'], to: 'sent' },
  accept: { from: ['draft', 'sent'], to: 'accepted' },
  reject: { from: ['draft', 'sent'], to: 'rejected' },
  reopen: { from: ['rejected', 'sent'], to: 'draft' },
};

export function transitionQuotation(doc: BusinessDocument, action: QuotationAction, actor: Actor): BusinessDocument {
  if (doc.type !== 'quotation') throw new WorkflowError('Not a quotation');
  const rule = QUOTATION_TRANSITIONS[action];
  if (!rule.from.includes(doc.status)) {
    throw new WorkflowError(`Cannot ${action} a quotation that is ${doc.status}`);
  }
  return touch(doc, actor, { status: rule.to });
}

/**
 * Converts an accepted quotation into a draft invoice. A quotation can be converted
 * exactly once; repeating the call (double tap, retry) throws instead of creating a
 * second invoice.
 */
export function convertQuotationToInvoice(
  quotation: BusinessDocument,
  invoiceId: string,
  actor: Actor,
  issueDate: ISODate,
): { quotation: BusinessDocument; invoice: BusinessDocument } {
  if (quotation.type !== 'quotation') throw new WorkflowError('Only quotations can be converted');
  if (quotation.convertedToId || quotation.status === 'converted') {
    throw new WorkflowError('This quotation has already been converted to an invoice');
  }
  if (quotation.status !== 'accepted') throw new WorkflowError('Only accepted quotations can be converted');

  const invoice: BusinessDocument = {
    id: invoiceId,
    organizationId: quotation.organizationId,
    createdAt: actor.now,
    createdBy: actor.userId,
    updatedAt: actor.now,
    updatedBy: actor.userId,
    origin: quotation.origin,
    type: 'invoice',
    status: 'draft',
    contactId: quotation.contactId,
    issueDate,
    currency: quotation.currency,
    lines: quotation.lines.map((l) => ({ ...l })),
    convertedFromId: quotation.id,
    ...(quotation.projectId ? { projectId: quotation.projectId } : {}),
    ...(quotation.categoryId ? { categoryId: quotation.categoryId } : {}),
    ...(quotation.notes ? { notes: quotation.notes } : {}),
  };
  return {
    quotation: touch(quotation, actor, { status: 'converted', convertedToId: invoiceId }),
    invoice,
  };
}

/**
 * Undoes a conversion when the draft invoice it produced is deleted, so the
 * quotation is not left pointing at a missing invoice and can be converted again.
 */
export function releaseConvertedQuotation(quotation: BusinessDocument, deletedInvoice: BusinessDocument, actor: Actor): BusinessDocument {
  if (quotation.type !== 'quotation' || quotation.status !== 'converted') {
    throw new WorkflowError('Only converted quotations can be released');
  }
  if (quotation.convertedToId !== deletedInvoice.id) throw new WorkflowError('Quotation was converted to a different invoice');
  if (deletedInvoice.status !== 'draft') throw new WorkflowError('Only a draft invoice can be removed from a conversion');
  const { convertedToId: _released, ...rest } = quotation;
  void _released;
  return { ...rest, status: 'accepted', updatedAt: actor.now, updatedBy: actor.userId };
}

/** Finalises a draft invoice or bill and assigns its permanent number. */
export function issueDocument(doc: BusinessDocument, number: string, actor: Actor): BusinessDocument {
  if (doc.type === 'quotation') throw new WorkflowError('Quotations are not issued; send or accept them');
  if (doc.status !== 'draft') throw new WorkflowError(`Cannot issue a ${doc.status} ${doc.type}`);
  if (doc.lines.length === 0) throw new WorkflowError('Add at least one line before issuing');
  if (documentTotals(doc).total <= 0) throw new WorkflowError('Total must be greater than zero');
  return touch(doc, actor, { status: 'issued', number: doc.number ?? number });
}

/**
 * Voids an issued document. The record is kept (with who/when/why) and drops out of
 * all totals. Payments must be voided first so cash records stay consistent.
 */
export function voidDocument(
  doc: BusinessDocument,
  transactions: Transaction[],
  reason: string,
  actor: Actor,
): BusinessDocument {
  if (doc.status === 'void') throw new WorkflowError('Already void');
  if (doc.type === 'quotation') throw new WorkflowError('Reject a quotation instead of voiding it');
  if (!reason.trim()) throw new WorkflowError('A reason is required to void a document');
  if (amountSettled(doc, transactions) > 0) {
    throw new WorkflowError('Void the payments recorded against this document first');
  }
  const info: VoidInfo = { at: actor.now, by: actor.userId, reason: reason.trim() };
  return touch(doc, actor, { status: 'void', void: info });
}

export function voidTransaction(txn: Transaction, reason: string, actor: Actor): Transaction {
  if (txn.status === 'void') throw new WorkflowError('Already void');
  if (!reason.trim()) throw new WorkflowError('A reason is required to void a transaction');
  return {
    ...txn,
    status: 'void',
    void: { at: actor.now, by: actor.userId, reason: reason.trim() },
    updatedAt: actor.now,
    updatedBy: actor.userId,
  };
}

/** Checks a payment against an invoice or bill. Overpayment is rejected in Phase 1. */
export function validatePayment(
  doc: BusinessDocument,
  amount: MinorUnits,
  transactions: Transaction[],
): { ok: true } | { ok: false; error: string } {
  if (doc.type === 'quotation') return { ok: false, error: 'Payments are recorded against invoices, not quotations' };
  if (doc.status !== 'issued') return { ok: false, error: `Cannot record a payment on a ${doc.status} ${doc.type}` };
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: 'Amount must be greater than zero' };
  const balance = documentBalance(doc, transactions);
  if (amount > balance) return { ok: false, error: 'Amount is more than the outstanding balance' };
  return { ok: true };
}

/** Rules every transaction must satisfy before it is saved. */
export function validateTransaction(txn: Transaction): string[] {
  const errors: string[] = [];
  if (!Number.isSafeInteger(txn.amount) || txn.amount <= 0) errors.push('Amount must be greater than zero');
  if (!txn.accountId) errors.push('Choose an account');
  if (txn.kind === 'transfer') {
    if (!txn.toAccountId) errors.push('Choose the destination account');
    else if (txn.toAccountId === txn.accountId) errors.push('Source and destination accounts must differ');
    if (txn.categoryId) errors.push('Transfers are not income or expenses and take no category');
  } else if (txn.toAccountId) {
    errors.push('Only transfers have a destination account');
  }
  if ((txn.kind === 'payment_received' || txn.kind === 'payment_made') && !txn.documentId) {
    errors.push('Payments must be linked to an invoice or bill');
  }
  if ((txn.kind === 'income' || txn.kind === 'expense') && txn.documentId) {
    errors.push('Direct income/expense cannot be linked to an invoice or bill — record a payment instead');
  }
  return errors;
}
