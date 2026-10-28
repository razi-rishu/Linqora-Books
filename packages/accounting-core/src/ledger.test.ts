import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  cashFlow,
  dashboardSummary,
  documentBalance,
  documentTotals,
  monthlyReport,
  paymentStatus,
  profitAndLoss,
  projectProfitability,
  receivables,
} from './ledger';
import { financialYearOf } from './dates';
import { account, books, doc, txn } from './test-fixtures';
import type { Project } from './models';

const FY = financialYearOf('2026-05-01', 4);

describe('documentTotals', () => {
  it('sums lines and per-line tax', () => {
    const d = doc({
      type: 'invoice',
      lines: [
        { id: 'a', description: 'A', quantity: '2', unitPrice: 50000, taxRateBps: 1800 },
        { id: 'b', description: 'B', quantity: '1.5', unitPrice: 10001, taxRateBps: 500 },
      ],
    });
    // A: 100000 + 18000 tax ; B: 15002 (15001.5 → 15002) + 750 (750.1 → 750) tax
    expect(documentTotals(d)).toEqual({ subtotal: 115002, tax: 18750, total: 133752 });
  });
});

describe('profit and loss vs cash (no double counting)', () => {
  const invoice = doc({ type: 'invoice', issueDate: '2026-05-01' }); // 1000 + 180 tax
  const payment = txn({ kind: 'payment_received', amount: 118000, documentId: invoice.id, date: '2026-05-20' });

  it('recognises invoice revenue once, at issue, excluding tax', () => {
    const pl = profitAndLoss({ documents: [invoice], transactions: [payment] }, FY, 'INR');
    expect(pl.revenue.invoiced).toBe(100000);
    expect(pl.revenue.total).toBe(100000);
  });

  it('counts the invoice payment as cash in, not revenue', () => {
    const cf = cashFlow([payment], FY, 'INR');
    expect(cf.moneyIn).toBe(118000);
    const pl = profitAndLoss({ documents: [invoice], transactions: [payment] }, FY, 'INR');
    expect(pl.revenue.directIncome).toBe(0);
  });

  it('excludes draft and void invoices and draft quotations', () => {
    const draft = doc({ type: 'invoice', status: 'draft' });
    const voided = doc({ type: 'invoice', status: 'void' });
    const quote = doc({ type: 'quotation', status: 'accepted' });
    const pl = profitAndLoss({ documents: [draft, voided, quote], transactions: [] }, FY, 'INR');
    expect(pl.revenue.total).toBe(0);
  });

  it('treats transfers as neither profit nor cash in/out', () => {
    const transfer = txn({ kind: 'transfer', amount: 50000, accountId: 'acc_cash', toAccountId: 'acc_bank' });
    const pl = profitAndLoss({ documents: [], transactions: [transfer] }, FY, 'INR');
    expect(pl.profit).toBe(0);
    expect(cashFlow([transfer], FY, 'INR')).toEqual({ moneyIn: 0, moneyOut: 0, net: 0 });
  });

  it('computes profit and loss including refunds and bills', () => {
    const data = {
      documents: [doc({ type: 'invoice' }), doc({ type: 'bill', lines: [{ id: 'x', description: 'x', quantity: '1', unitPrice: 30000, taxRateBps: 0 }] })],
      transactions: [
        txn({ kind: 'income', amount: 20000 }),
        txn({ kind: 'expense', amount: 150000 }),
        txn({ kind: 'refund_given', amount: 5000 }),
        txn({ kind: 'expense', amount: 99999, status: 'void' }),
      ],
    };
    const pl = profitAndLoss(data, FY, 'INR');
    expect(pl.revenue.total).toBe(100000 + 20000 - 5000);
    expect(pl.expenses.total).toBe(30000 + 150000);
    expect(pl.profit).toBe(115000 - 180000);
  });

  it('throws on mixed currencies', () => {
    expect(() => profitAndLoss({ documents: [], transactions: [txn({ kind: 'income', amount: 1, currency: 'USD' })] }, FY, 'INR')).toThrow(
      /exchange rate/,
    );
  });

  it('ignores records outside the period', () => {
    const pl = profitAndLoss({ documents: [], transactions: [txn({ kind: 'income', amount: 500, date: '2026-03-31' })] }, FY, 'INR');
    expect(pl.revenue.total).toBe(0);
  });
});

describe('balances and statuses', () => {
  const invoice = doc({ type: 'invoice', dueDate: '2026-05-15' });

  it('tracks partial payments and overdue status', () => {
    const part = txn({ kind: 'payment_received', amount: 18000, documentId: invoice.id });
    expect(documentBalance(invoice, [part])).toBe(100000);
    expect(paymentStatus(invoice, [part], '2026-05-10')).toBe('partially_paid');
    expect(paymentStatus(invoice, [part], '2026-06-01')).toBe('overdue');
    const rest = txn({ kind: 'payment_received', amount: 100000, documentId: invoice.id });
    expect(paymentStatus(invoice, [part, rest], '2026-06-01')).toBe('paid');
  });

  it('ignores voided payments in balances', () => {
    const voided = txn({ kind: 'payment_received', amount: 118000, documentId: invoice.id, status: 'void' });
    expect(documentBalance(invoice, [voided])).toBe(118000);
  });

  it('computes account balances with transfers', () => {
    const cash = account({ id: 'acc_cash', openingBalance: 100000 });
    const bank = account({ id: 'acc_bank', kind: 'bank', openingBalance: 0 });
    const txns = [
      txn({ kind: 'income', amount: 50000, accountId: 'acc_cash' }),
      txn({ kind: 'transfer', amount: 120000, accountId: 'acc_cash', toAccountId: 'acc_bank' }),
      txn({ kind: 'expense', amount: 20000, accountId: 'acc_bank' }),
    ];
    expect(accountBalance(cash, txns)).toBe(30000);
    expect(accountBalance(bank, txns)).toBe(100000);
  });

  it('groups receivables by customer', () => {
    const other = doc({ type: 'invoice', contactId: 'con_b' });
    const rec = receivables({ documents: [invoice, other], transactions: [] }, '2026-06-01');
    expect(rec).toHaveLength(2);
    expect(rec.find((r) => r.contactId === 'con_a')!.overdue).toBe(118000);
  });
});

describe('projects and dashboard', () => {
  const project: Project = {
    id: 'prj_1',
    organizationId: 'org_test',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    origin: 'user',
    name: 'Wedding',
    status: 'active',
    estimatedRevenue: 500000,
    estimatedCost: 300000,
    currency: 'INR',
  };

  it('computes estimated and realized project profit', () => {
    const data = {
      documents: [doc({ type: 'invoice', projectId: 'prj_1' })],
      transactions: [txn({ kind: 'expense', amount: 40000, projectId: 'prj_1' }), txn({ kind: 'expense', amount: 999, projectId: 'other' })],
    };
    const p = projectProfitability(project, data);
    expect(p.estimatedProfit).toBe(200000);
    expect(p.revenue).toBe(100000);
    expect(p.costs).toBe(40000);
    expect(p.realizedProfit).toBe(60000);
    expect(p.outstandingReceivable).toBe(118000);
  });

  it('builds a consistent dashboard summary', () => {
    const inv = doc({ type: 'invoice' });
    const data = books({
      accounts: [account({ id: 'acc_cash', openingBalance: 10000 })],
      documents: [inv],
      transactions: [txn({ kind: 'payment_received', amount: 18000, documentId: inv.id }), txn({ kind: 'expense', amount: 5000 })],
    });
    const s = dashboardSummary(data, FY, '2026-06-01');
    expect(s.profitAndLoss.profit).toBe(100000 - 5000);
    expect(s.cash).toEqual({ moneyIn: 18000, moneyOut: 5000, net: 13000 });
    expect(s.totalCashAndBank).toBe(10000 + 13000);
    expect(s.receivable).toBe(100000);
    expect(s.payable).toBe(0);
  });

  it('produces 12 monthly rows that add up to the year', () => {
    const data = { documents: [doc({ type: 'invoice' })], transactions: [txn({ kind: 'expense', amount: 5000, date: '2026-09-02' })] };
    const rows = monthlyReport(data, FY, 'INR');
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + r.profit, 0)).toBe(profitAndLoss(data, FY, 'INR').profit);
  });
});
