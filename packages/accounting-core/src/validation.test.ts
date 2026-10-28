import { describe, expect, it } from 'vitest';
import { validateTransactionInBooks, validateVoidTransaction } from './validation';
import { validateTransaction } from './documents';
import {
  accountBalance,
  advanceRemaining,
  cashFlow,
  customerAdvances,
  dashboardSummary,
  documentBalance,
  paymentStatus,
  profitAndLoss,
} from './ledger';
import { financialYearOf } from './dates';
import { account, books, doc, txn } from './test-fixtures';
import type { Contact, Transaction } from './models';

const TODAY = '2026-06-30';
const FY = financialYearOf(TODAY, 4);
const customer: Contact = {
  id: 'con_a',
  organizationId: 'org_test',
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
  origin: 'user',
  kind: 'customer',
  name: 'Asha',
  archived: false,
};
const supplier: Contact = { ...customer, id: 'con_s', kind: 'supplier', name: 'Supplier' };
const cash = account({ id: 'acc_cash', openingDate: '2026-05-01', openingBalance: 10000 });
const bank = account({ id: 'acc_bank', kind: 'bank', openingDate: '2026-04-01' });
const invoice = doc({ type: 'invoice', id: 'inv_1', issueDate: '2026-06-10', dueDate: '2026-06-25' }); // total 118000

function booksWith(transactions: Transaction[] = [], extra: Partial<Parameters<typeof books>[0]> = {}) {
  return books({ accounts: [cash, bank], contacts: [customer, supplier], documents: [invoice], transactions, ...extra });
}

describe('D1 — nothing before an account opening date', () => {
  it('rejects entries dated before the opening date, accepts on the date', () => {
    const before = txn({ kind: 'income', amount: 5000, date: '2026-04-30' });
    expect(validateTransactionInBooks(before, booksWith(), TODAY).join()).toMatch(/starts on 1 May 2026/);
    expect(validateTransactionInBooks({ ...before, date: '2026-05-01' }, booksWith(), TODAY)).toEqual([]);
  });

  it('checks both sides of a transfer', () => {
    const transfer = txn({ kind: 'transfer', amount: 100, accountId: 'acc_bank', toAccountId: 'acc_cash', date: '2026-04-15' });
    expect(validateTransactionInBooks(transfer, booksWith(), TODAY).join()).toMatch(/Cash|acc_cash/);
  });

  it('keeps cash flow and balances consistent for every accepted entry', () => {
    const accepted = [txn({ kind: 'income', amount: 5000, date: '2026-05-01' })];
    for (const t of accepted) expect(validateTransactionInBooks(t, booksWith(), TODAY)).toEqual([]);
    const inflow = cashFlow(accepted, FY, 'INR').moneyIn;
    expect(accountBalance(cash, accepted) - cash.openingBalance).toBe(inflow);
  });
});

describe('D2 — no future-dated money', () => {
  it('rejects cash movements after today', () => {
    const future = txn({ kind: 'expense', amount: 100, date: '2026-07-01' });
    expect(validateTransactionInBooks(future, booksWith(), TODAY)).toContain('Money movements cannot be dated in the future');
    expect(validateTransactionInBooks({ ...future, date: TODAY }, booksWith(), TODAY)).toEqual([]);
  });
});

describe('D3 — payments not before their document', () => {
  it('rejects an invoice payment dated before the invoice and points to advances', () => {
    const early = txn({ kind: 'payment_received', amount: 1000, documentId: 'inv_1', contactId: 'con_a', date: '2026-06-01' });
    expect(validateTransactionInBooks(early, booksWith(), TODAY).join()).toMatch(/before the invoice date .* customer advance/);
    expect(validateTransactionInBooks({ ...early, date: '2026-06-10' }, booksWith(), TODAY)).toEqual([]);
  });

  it('rejects a payment linked to the wrong document type or contact', () => {
    const wrongType = txn({ kind: 'payment_made', amount: 100, documentId: 'inv_1', date: '2026-06-15' });
    expect(validateTransactionInBooks(wrongType, booksWith(), TODAY).join()).toMatch(/linked to a bill/);
    const wrongContact = txn({ kind: 'payment_received', amount: 100, documentId: 'inv_1', contactId: 'con_s', date: '2026-06-15' });
    expect(validateTransactionInBooks(wrongContact, booksWith(), TODAY).join()).toMatch(/contact does not match/);
  });

  it('still rejects overpayment, excluding the transaction itself when re-saved', () => {
    const pay = txn({ kind: 'payment_received', amount: 118000, documentId: 'inv_1', date: '2026-06-15' });
    expect(validateTransactionInBooks(pay, booksWith([pay]), TODAY)).toEqual([]);
    expect(validateTransactionInBooks({ ...pay, id: 'second', amount: 1 }, booksWith([pay]), TODAY).join()).toMatch(/outstanding balance/);
  });
});

describe('customer advances', () => {
  const advance = txn({ id: 'adv_1', kind: 'advance_received', amount: 50000, contactId: 'con_a', accountId: 'acc_bank', date: '2026-06-01' });

  it('records an advance as money in, not revenue', () => {
    const data = booksWith([advance], { documents: [] });
    expect(validateTransactionInBooks(advance, data, TODAY)).toEqual([]);
    expect(profitAndLoss(data, FY, 'INR').revenue.total).toBe(0);
    expect(cashFlow(data.transactions, FY, 'INR').moneyIn).toBe(50000);
    expect(accountBalance(bank, data.transactions)).toBe(50000);
    expect(customerAdvances(data.transactions)).toEqual([
      { contactId: 'con_a', held: 50000, advances: [{ advance, remaining: 50000 }] },
    ]);
    expect(dashboardSummary(data, FY, TODAY).advancesHeld).toBe(50000);
  });

  it('requires a customer, not a supplier, and no invoice or category', () => {
    expect(validateTransaction({ ...advance, contactId: undefined } as Transaction)).toContain('Choose the customer who paid the advance');
    expect(validateTransaction({ ...advance, documentId: 'inv_1' }).join()).toMatch(/apply it to the invoice later/);
    expect(validateTransaction({ ...advance, categoryId: 'inc_sales' }).join()).toMatch(/not income/);
    expect(validateTransactionInBooks({ ...advance, contactId: 'con_s' }, booksWith(), TODAY).join()).toMatch(/not suppliers/);
  });

  it('applying an advance settles the invoice without cash or revenue', () => {
    const apply = txn({ kind: 'advance_applied', amount: 50000, advanceId: 'adv_1', documentId: 'inv_1', contactId: 'con_a', date: '2026-06-10' });
    delete (apply as Partial<Transaction>).accountId;
    const data = booksWith([advance, apply]);
    expect(validateTransaction(apply)).toEqual([]);
    expect(validateTransactionInBooks(apply, data, TODAY)).toEqual([]);

    expect(documentBalance(invoice, data.transactions)).toBe(118000 - 50000);
    expect(paymentStatus(invoice, data.transactions, '2026-06-20')).toBe('partially_paid');
    expect(advanceRemaining(advance, data.transactions)).toBe(0);
    expect(customerAdvances(data.transactions)).toEqual([]);
    // Revenue is the invoice (before tax) only — the advance is not counted again.
    expect(profitAndLoss(data, FY, 'INR').revenue.total).toBe(100000);
    // Cash: only the advance itself.
    expect(cashFlow(data.transactions, FY, 'INR')).toEqual({ moneyIn: 50000, moneyOut: 0, net: 50000 });
    expect(accountBalance(bank, data.transactions)).toBe(50000);
  });

  it('can be applied across invoices and partly refunded, never beyond the advance', () => {
    const second = doc({ type: 'invoice', id: 'inv_2', issueDate: '2026-06-12' });
    const a1 = txn({ kind: 'advance_applied', amount: 20000, advanceId: 'adv_1', documentId: 'inv_1', date: '2026-06-12' });
    const a2 = txn({ kind: 'advance_applied', amount: 20000, advanceId: 'adv_1', documentId: 'inv_2', date: '2026-06-12' });
    for (const t of [a1, a2]) delete (t as Partial<Transaction>).accountId;
    const data = booksWith([advance, a1, a2], { documents: [invoice, second] });
    expect(advanceRemaining(advance, data.transactions)).toBe(10000);

    const refund = txn({ kind: 'advance_refunded', amount: 10000, advanceId: 'adv_1', accountId: 'acc_bank', date: '2026-06-20' });
    expect(validateTransactionInBooks(refund, data, TODAY)).toEqual([]);
    expect(validateTransactionInBooks({ ...refund, amount: 10001 }, data, TODAY).join()).toMatch(/unused part/);

    const withRefund = booksWith([advance, a1, a2, refund], { documents: [invoice, second] });
    expect(profitAndLoss(withRefund, FY, 'INR').revenue.refunds).toBe(0); // advance refund is not a sales refund
    expect(cashFlow(withRefund.transactions, FY, 'INR')).toEqual({ moneyIn: 50000, moneyOut: 10000, net: 40000 });
    expect(accountBalance(bank, withRefund.transactions)).toBe(40000);
  });

  it('applies only to the same customer, after both dates, within the invoice balance', () => {
    const otherInvoice = doc({ type: 'invoice', id: 'inv_b', contactId: 'con_b', issueDate: '2026-06-10' });
    const base = txn({ kind: 'advance_applied', amount: 1000, advanceId: 'adv_1', documentId: 'inv_1', date: '2026-06-10' });
    delete (base as Partial<Transaction>).accountId;
    const data = booksWith([advance], { documents: [invoice, otherInvoice] });
    expect(validateTransactionInBooks({ ...base, documentId: 'inv_b' }, data, TODAY).join()).toMatch(/different customer/);
    expect(validateTransactionInBooks({ ...base, date: '2026-06-05' }, data, TODAY).join()).toMatch(/before the invoice date/);
    expect(validateTransactionInBooks({ ...base, date: '2026-05-20' }, data, TODAY).join()).toMatch(/before the advance was received/);
    expect(validateTransactionInBooks({ ...base, amount: 60000 }, data, TODAY).join()).toMatch(/unused part/);
    const draft = doc({ type: 'invoice', id: 'inv_d', status: 'draft', issueDate: '2026-06-10' });
    expect(validateTransactionInBooks({ ...base, documentId: 'inv_d' }, booksWith([advance], { documents: [draft] }), TODAY).join()).toMatch(
      /draft invoice/,
    );
    expect(validateTransaction({ ...base, accountId: 'acc_bank' }).join()).toMatch(/takes no account/);
  });

  it('cannot void an advance that has been applied until the application is voided', () => {
    const apply = txn({ kind: 'advance_applied', amount: 1000, advanceId: 'adv_1', documentId: 'inv_1', date: '2026-06-10' });
    expect(validateVoidTransaction(advance, [advance, apply])).toHaveLength(1);
    expect(validateVoidTransaction(advance, [advance, { ...apply, status: 'void' }])).toEqual([]);
    expect(validateVoidTransaction(apply, [advance, apply])).toEqual([]);
  });

  it('ignores voided advances', () => {
    const voided = { ...advance, status: 'void' as const };
    expect(customerAdvances([voided])).toEqual([]);
    expect(cashFlow([voided], FY, 'INR').moneyIn).toBe(0);
  });
});
