import { describe, expect, it } from 'vitest';
import {
  convertQuotationToInvoice,
  issueDocument,
  nextDocumentNumber,
  releaseConvertedQuotation,
  transitionQuotation,
  validatePayment,
  validateTransaction,
  voidDocument,
  voidTransaction,
  WorkflowError,
} from './documents';
import { doc, txn } from './test-fixtures';

const actor = { userId: 'user_1', now: '2026-05-02T10:00:00.000Z' };

describe('numbering', () => {
  it('numbers per type and financial year, never reusing numbers', () => {
    const existing = [
      doc({ type: 'invoice', number: 'INV/2026-27/0001' }),
      doc({ type: 'invoice', number: 'INV/2026-27/0007', status: 'void' }),
      doc({ type: 'invoice', number: 'INV/2025-26/0042' }),
      doc({ type: 'quotation', number: 'QUO/2026-27/0003' }),
    ];
    expect(nextDocumentNumber('invoice', existing, '2026-05-01', 4)).toBe('INV/2026-27/0008');
    expect(nextDocumentNumber('quotation', existing, '2026-05-01', 4)).toBe('QUO/2026-27/0004');
    expect(nextDocumentNumber('invoice', existing, '2027-04-01', 4)).toBe('INV/2027-28/0001');
  });
});

describe('quotation workflow', () => {
  it('accepts and converts exactly once', () => {
    const q = transitionQuotation(doc({ type: 'quotation', number: 'QUO/2026-27/0001', projectId: 'prj_1' }), 'accept', actor);
    const { quotation, invoice } = convertQuotationToInvoice(q, 'doc_new', actor, '2026-05-02');
    expect(quotation.status).toBe('converted');
    expect(quotation.convertedToId).toBe('doc_new');
    expect(invoice).toMatchObject({ type: 'invoice', status: 'draft', convertedFromId: q.id, projectId: 'prj_1' });
    expect(invoice.number).toBeUndefined();
    expect(invoice.lines).toEqual(q.lines);
    expect(invoice.lines).not.toBe(q.lines);
    expect(() => convertQuotationToInvoice(quotation, 'doc_dupe', actor, '2026-05-02')).toThrow(/already been converted/);
  });

  it('releases the quotation when its draft invoice is deleted, allowing reconversion', () => {
    const q = transitionQuotation(doc({ type: 'quotation', number: 'QUO/2026-27/0001' }), 'accept', actor);
    const first = convertQuotationToInvoice(q, 'doc_first', actor, '2026-05-02');
    const released = releaseConvertedQuotation(first.quotation, first.invoice, actor);
    expect(released.status).toBe('accepted');
    expect(released.convertedToId).toBeUndefined();
    expect(released.number).toBe('QUO/2026-27/0001');
    expect(convertQuotationToInvoice(released, 'doc_second', actor, '2026-05-03').invoice.convertedFromId).toBe(q.id);
  });

  it('only releases a quotation for its own draft invoice', () => {
    const q = transitionQuotation(doc({ type: 'quotation' }), 'accept', actor);
    const { quotation, invoice } = convertQuotationToInvoice(q, 'doc_inv', actor, '2026-05-02');
    expect(() => releaseConvertedQuotation(quotation, { ...invoice, id: 'other' }, actor)).toThrow(/different invoice/);
    expect(() => releaseConvertedQuotation(quotation, { ...invoice, status: 'issued' }, actor)).toThrow(/draft/);
    expect(() => releaseConvertedQuotation(q, invoice, actor)).toThrow(/converted quotations/);
  });

  it('does not convert quotations that were not accepted', () => {
    expect(() => convertQuotationToInvoice(doc({ type: 'quotation' }), 'x', actor, '2026-05-02')).toThrow(WorkflowError);
    const rejected = transitionQuotation(doc({ type: 'quotation' }), 'reject', actor);
    expect(() => convertQuotationToInvoice(rejected, 'x', actor, '2026-05-02')).toThrow(WorkflowError);
  });

  it('rejects invalid transitions', () => {
    const accepted = transitionQuotation(doc({ type: 'quotation' }), 'accept', actor);
    expect(() => transitionQuotation(accepted, 'send', actor)).toThrow(/Cannot send/);
  });
});

describe('issuing and voiding', () => {
  it('assigns a permanent number when issued', () => {
    const issued = issueDocument(doc({ type: 'invoice', status: 'draft' }), 'INV/2026-27/0001', actor);
    expect(issued.status).toBe('issued');
    expect(issued.number).toBe('INV/2026-27/0001');
    expect(() => issueDocument(issued, 'INV/2026-27/0002', actor)).toThrow();
  });

  it('refuses to issue an empty invoice', () => {
    expect(() => issueDocument(doc({ type: 'invoice', status: 'draft', lines: [] }), 'N', actor)).toThrow(/at least one line/);
  });

  it('keeps voided documents with reason and requires payments voided first', () => {
    const inv = doc({ type: 'invoice' });
    const pay = txn({ kind: 'payment_received', amount: 1000, documentId: inv.id });
    expect(() => voidDocument(inv, [pay], 'Wrong customer', actor)).toThrow(/payments/);
    expect(() => voidDocument(inv, [], '  ', actor)).toThrow(/reason/);
    const voided = voidDocument(inv, [voidTransaction(pay, 'Duplicate', actor)], 'Wrong customer', actor);
    expect(voided.status).toBe('void');
    expect(voided.void).toEqual({ at: actor.now, by: 'user_1', reason: 'Wrong customer' });
    expect(voided.id).toBe(inv.id);
  });
});

describe('validation', () => {
  it('validates payments against the outstanding balance', () => {
    const inv = doc({ type: 'invoice' }); // total 118000
    expect(validatePayment(inv, 50000, [])).toEqual({ ok: true });
    expect(validatePayment(inv, 118001, [])).toMatchObject({ ok: false });
    expect(validatePayment(inv, 0, [])).toMatchObject({ ok: false });
    expect(validatePayment(doc({ type: 'invoice', status: 'draft' }), 100, [])).toMatchObject({ ok: false });
    expect(validatePayment(doc({ type: 'quotation' }), 100, [])).toMatchObject({ ok: false });
  });

  it('validates transaction shape', () => {
    expect(validateTransaction(txn({ kind: 'income', amount: 100 }))).toEqual([]);
    expect(validateTransaction(txn({ kind: 'transfer', amount: 100, toAccountId: 'acc_cash' }))).toContain(
      'Source and destination accounts must differ',
    );
    expect(validateTransaction(txn({ kind: 'transfer', amount: 100, toAccountId: 'b', categoryId: 'inc_sales' })).length).toBe(1);
    expect(validateTransaction(txn({ kind: 'payment_received', amount: 100 }))).toContain('Payments must be linked to an invoice or bill');
    expect(validateTransaction(txn({ kind: 'income', amount: 100, documentId: 'd' })).length).toBe(1);
    expect(validateTransaction(txn({ kind: 'expense', amount: -5 }))).toContain('Amount must be greater than zero');
  });
});
