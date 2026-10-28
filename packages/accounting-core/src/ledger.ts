/**
 * Financial calculations over a snapshot of records.
 *
 * Profit & loss is ACCRUAL based: revenue is recognised when an invoice is issued
 * (or a direct sale is recorded); payments against invoices move cash but are not
 * revenue again. Cash figures are CASH based: actual money in/out of accounts.
 * Transfers between accounts affect neither profit nor total cash.
 *
 * Void records and draft documents are excluded everywhere.
 */
import { applyRateBps, CurrencyMismatchError, multiplyByQuantity, sumMinor, type CurrencyCode, type MinorUnits } from './money';
import { compareDates, isInPeriod, monthsInPeriod, type ISODate, type Period } from './dates';
import type {
  BooksData,
  BusinessDocument,
  Contact,
  DocumentLine,
  MoneyAccount,
  Project,
  Transaction,
} from './models';

export interface DocumentTotals {
  subtotal: MinorUnits;
  tax: MinorUnits;
  total: MinorUnits;
}

export function lineAmount(line: DocumentLine): MinorUnits {
  return multiplyByQuantity(line.unitPrice, line.quantity);
}

/** Tax is calculated and rounded per line, then summed. */
export function documentTotals(doc: Pick<BusinessDocument, 'lines'>): DocumentTotals {
  let subtotal = 0;
  let tax = 0;
  for (const line of doc.lines) {
    const amount = lineAmount(line);
    subtotal += amount;
    tax += applyRateBps(amount, line.taxRateBps);
  }
  return { subtotal, tax, total: subtotal + tax };
}

export function isPosted(txn: Transaction): boolean {
  return txn.status === 'posted';
}

/** Invoices and bills count once issued. Quotations never count. */
export function isFinalizedLedgerDocument(doc: BusinessDocument): boolean {
  return (doc.type === 'invoice' || doc.type === 'bill') && doc.status === 'issued';
}

/**
 * The business currency can only change while no record carries an amount in it.
 * Amounts are never converted, so changing it afterwards would mix currencies.
 */
export function isCurrencyLocked(data: Pick<BooksData, 'accounts' | 'projects' | 'transactions' | 'documents'>): boolean {
  return data.accounts.length + data.projects.length + data.transactions.length + data.documents.length > 0;
}

function checkCurrency(currency: CurrencyCode, items: { currency: string }[]): void {
  for (const item of items) {
    if (item.currency !== currency) throw new CurrencyMismatchError(currency, item.currency);
  }
}

const SETTLES_INVOICE = new Set<Transaction['kind']>(['payment_received', 'advance_applied']);
const SETTLES_BILL = new Set<Transaction['kind']>(['payment_made']);

/** Amount settled against an invoice or bill by non-void payments and applied advances. */
export function amountSettled(doc: BusinessDocument, transactions: Transaction[]): MinorUnits {
  const kinds = doc.type === 'bill' ? SETTLES_BILL : SETTLES_INVOICE;
  return sumMinor(
    transactions.filter((t) => isPosted(t) && kinds.has(t.kind) && t.documentId === doc.id).map((t) => t.amount),
  );
}

/** Unused part of a customer advance: received minus non-void applications and refunds. */
export function advanceRemaining(advance: Transaction, transactions: Transaction[]): MinorUnits {
  if (advance.kind !== 'advance_received' || !isPosted(advance)) return 0;
  const used = sumMinor(
    transactions
      .filter((t) => isPosted(t) && t.advanceId === advance.id && (t.kind === 'advance_applied' || t.kind === 'advance_refunded'))
      .map((t) => t.amount),
  );
  return advance.amount - used;
}

export interface CustomerAdvance {
  contactId: string;
  /** Money held for the customer, not yet applied to an invoice or refunded. A liability, not revenue. */
  held: MinorUnits;
  advances: { advance: Transaction; remaining: MinorUnits }[];
}

/** Advances held per customer, as of `asOf` (inclusive) when given. */
export function customerAdvances(transactions: Transaction[], asOf?: ISODate): CustomerAdvance[] {
  const visible = asOf ? transactions.filter((t) => t.date <= asOf) : transactions;
  const byContact = new Map<string, CustomerAdvance>();
  for (const t of visible) {
    if (t.kind !== 'advance_received' || !isPosted(t) || !t.contactId) continue;
    const remaining = advanceRemaining(t, visible);
    if (remaining <= 0) continue;
    const entry = byContact.get(t.contactId) ?? { contactId: t.contactId, held: 0, advances: [] };
    entry.held += remaining;
    entry.advances.push({ advance: t, remaining });
    byContact.set(t.contactId, entry);
  }
  return [...byContact.values()].sort((a, b) => b.held - a.held);
}

export function documentBalance(doc: BusinessDocument, transactions: Transaction[]): MinorUnits {
  if (!isFinalizedLedgerDocument(doc)) return 0;
  return documentTotals(doc).total - amountSettled(doc, transactions);
}

export type PaymentStatus = 'draft' | 'void' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export function paymentStatus(doc: BusinessDocument, transactions: Transaction[], today: ISODate): PaymentStatus {
  if (doc.status === 'void') return 'void';
  if (doc.status !== 'issued') return 'draft';
  const total = documentTotals(doc).total;
  const settled = amountSettled(doc, transactions);
  if (settled >= total) return 'paid';
  if (doc.dueDate && compareDates(doc.dueDate, today) < 0) return 'overdue';
  return settled > 0 ? 'partially_paid' : 'unpaid';
}

export interface ProfitAndLoss {
  period: Period;
  currency: CurrencyCode;
  revenue: {
    invoiced: MinorUnits;
    directIncome: MinorUnits;
    refunds: MinorUnits;
    total: MinorUnits;
  };
  expenses: {
    bills: MinorUnits;
    directExpenses: MinorUnits;
    total: MinorUnits;
  };
  /** Revenue total minus expense total. Negative = loss. */
  profit: MinorUnits;
  incomeByCategory: Record<string, MinorUnits>;
  expensesByCategory: Record<string, MinorUnits>;
}

type LedgerInput = Pick<BooksData, 'documents' | 'transactions'>;

/** Revenue/expense for a document line set, excluding tax collected on behalf of government. */
function documentNetAmount(doc: BusinessDocument): MinorUnits {
  return documentTotals(doc).subtotal;
}

function addTo(map: Record<string, MinorUnits>, key: string | undefined, amount: MinorUnits): void {
  const k = key ?? 'uncategorised';
  map[k] = (map[k] ?? 0) + amount;
}

/**
 * Accrual profit & loss. Invoice and bill amounts are taken before tax:
 * tax collected or paid is not the business's income or expense.
 */
export function profitAndLoss(data: LedgerInput, period: Period, currency: CurrencyCode): ProfitAndLoss {
  const docs = data.documents.filter((d) => isFinalizedLedgerDocument(d) && isInPeriod(d.issueDate, period));
  const txns = data.transactions.filter((t) => isPosted(t) && isInPeriod(t.date, period));
  checkCurrency(currency, docs);
  checkCurrency(currency, txns);

  const incomeByCategory: Record<string, MinorUnits> = {};
  const expensesByCategory: Record<string, MinorUnits> = {};
  let invoiced = 0;
  let bills = 0;
  for (const doc of docs) {
    const net = documentNetAmount(doc);
    if (doc.type === 'invoice') {
      invoiced += net;
      addTo(incomeByCategory, doc.categoryId, net);
    } else {
      bills += net;
      addTo(expensesByCategory, doc.categoryId, net);
    }
  }

  let directIncome = 0;
  let refunds = 0;
  let directExpenses = 0;
  for (const t of txns) {
    if (t.kind === 'income') {
      directIncome += t.amount;
      addTo(incomeByCategory, t.categoryId, t.amount);
    } else if (t.kind === 'refund_given') {
      refunds += t.amount;
      addTo(incomeByCategory, t.categoryId, -t.amount);
    } else if (t.kind === 'expense') {
      directExpenses += t.amount;
      addTo(expensesByCategory, t.categoryId, t.amount);
    }
  }

  const revenueTotal = invoiced + directIncome - refunds;
  const expenseTotal = bills + directExpenses;
  return {
    period,
    currency,
    revenue: { invoiced, directIncome, refunds, total: revenueTotal },
    expenses: { bills, directExpenses, total: expenseTotal },
    profit: revenueTotal - expenseTotal,
    incomeByCategory,
    expensesByCategory,
  };
}

export interface CashFlow {
  moneyIn: MinorUnits;
  moneyOut: MinorUnits;
  net: MinorUnits;
}

const MONEY_IN = new Set<Transaction['kind']>(['income', 'payment_received', 'advance_received']);
const MONEY_OUT = new Set<Transaction['kind']>(['expense', 'payment_made', 'refund_given', 'advance_refunded']);

/**
 * Actual money received and spent. Transfers are excluded (they net to zero) and
 * applying an advance moves no money (it was counted when received).
 */
export function cashFlow(transactions: Transaction[], period: Period, currency: CurrencyCode): CashFlow {
  const txns = transactions.filter((t) => isPosted(t) && isInPeriod(t.date, period));
  checkCurrency(currency, txns);
  const moneyIn = sumMinor(txns.filter((t) => MONEY_IN.has(t.kind)).map((t) => t.amount));
  const moneyOut = sumMinor(txns.filter((t) => MONEY_OUT.has(t.kind)).map((t) => t.amount));
  return { moneyIn, moneyOut, net: moneyIn - moneyOut };
}

/** Effect of a transaction on one account's balance. */
export function accountEffect(txn: Transaction, accountId: string): MinorUnits {
  if (!isPosted(txn)) return 0;
  if (txn.kind === 'transfer') {
    if (txn.accountId === accountId) return -txn.amount;
    if (txn.toAccountId === accountId) return txn.amount;
    return 0;
  }
  if (txn.accountId !== accountId) return 0;
  if (MONEY_IN.has(txn.kind)) return txn.amount;
  if (MONEY_OUT.has(txn.kind)) return -txn.amount;
  return 0;
}

export function accountBalance(account: MoneyAccount, transactions: Transaction[], asOf?: ISODate): MinorUnits {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (asOf && t.date > asOf) continue;
    if (t.date < account.openingDate) continue;
    balance += accountEffect(t, account.id);
  }
  return balance;
}

export interface AccountBalance {
  account: MoneyAccount;
  balance: MinorUnits;
  /** Difference from the last reconciled statement balance, if one was entered. */
  unreconciledDifference?: MinorUnits;
}

export function accountBalances(accounts: MoneyAccount[], transactions: Transaction[], asOf?: ISODate): AccountBalance[] {
  return accounts
    .filter((a) => !a.archived)
    .map((account) => {
      const balance = accountBalance(account, transactions, asOf);
      const reconciled =
        account.reconciledBalance !== undefined && account.reconciledAt
          ? account.reconciledBalance - accountBalance(account, transactions, account.reconciledAt)
          : undefined;
      return reconciled === undefined
        ? { account, balance }
        : { account, balance, unreconciledDifference: reconciled };
    });
}

export interface OutstandingByContact {
  contactId: string;
  outstanding: MinorUnits;
  documentCount: number;
  overdue: MinorUnits;
}

function outstanding(
  data: LedgerInput,
  type: 'invoice' | 'bill',
  today: ISODate,
): OutstandingByContact[] {
  const byContact = new Map<string, OutstandingByContact>();
  for (const doc of data.documents) {
    if (doc.type !== type || !isFinalizedLedgerDocument(doc)) continue;
    const balance = documentBalance(doc, data.transactions);
    if (balance <= 0) continue;
    const entry = byContact.get(doc.contactId) ?? { contactId: doc.contactId, outstanding: 0, documentCount: 0, overdue: 0 };
    entry.outstanding += balance;
    entry.documentCount += 1;
    if (doc.dueDate && doc.dueDate < today) entry.overdue += balance;
    byContact.set(doc.contactId, entry);
  }
  return [...byContact.values()].sort((a, b) => b.outstanding - a.outstanding);
}

/** What customers owe (issued, unpaid invoice balances including tax). */
export function receivables(data: LedgerInput, today: ISODate): OutstandingByContact[] {
  return outstanding(data, 'invoice', today);
}

/** What the business owes suppliers. */
export function payables(data: LedgerInput, today: ISODate): OutstandingByContact[] {
  return outstanding(data, 'bill', today);
}

export interface ProjectProfitability {
  project: Project;
  estimatedProfit: MinorUnits;
  revenue: MinorUnits;
  costs: MinorUnits;
  realizedProfit: MinorUnits;
  outstandingReceivable: MinorUnits;
}

export function projectProfitability(project: Project, data: LedgerInput): ProjectProfitability {
  const docs = data.documents.filter((d) => d.projectId === project.id && isFinalizedLedgerDocument(d));
  const txns = data.transactions.filter((t) => t.projectId === project.id && isPosted(t));
  let revenue = 0;
  let costs = 0;
  let outstandingReceivable = 0;
  for (const doc of docs) {
    if (doc.type === 'invoice') {
      revenue += documentNetAmount(doc);
      outstandingReceivable += Math.max(0, documentBalance(doc, data.transactions));
    } else {
      costs += documentNetAmount(doc);
    }
  }
  for (const t of txns) {
    if (t.kind === 'income') revenue += t.amount;
    else if (t.kind === 'refund_given') revenue -= t.amount;
    else if (t.kind === 'expense') costs += t.amount;
  }
  return {
    project,
    estimatedProfit: project.estimatedRevenue - project.estimatedCost,
    revenue,
    costs,
    realizedProfit: revenue - costs,
    outstandingReceivable,
  };
}

export interface DashboardSummary {
  period: Period;
  currency: CurrencyCode;
  profitAndLoss: ProfitAndLoss;
  cash: CashFlow;
  accounts: AccountBalance[];
  totalCashAndBank: MinorUnits;
  receivable: MinorUnits;
  overdueReceivable: MinorUnits;
  payable: MinorUnits;
  /** Customer advances held (not yet applied or refunded). Owed to customers; never revenue. */
  advancesHeld: MinorUnits;
}

export function dashboardSummary(data: BooksData, period: Period, today: ISODate): DashboardSummary {
  const currency = data.business.currency;
  const accounts = accountBalances(data.accounts, data.transactions, today);
  checkCurrency(currency, accounts.map((a) => a.account));
  const rec = receivables(data, today);
  const pay = payables(data, today);
  return {
    advancesHeld: sumMinor(customerAdvances(data.transactions, today).map((a) => a.held)),
    period,
    currency,
    profitAndLoss: profitAndLoss(data, period, currency),
    cash: cashFlow(data.transactions, period, currency),
    accounts,
    totalCashAndBank: sumMinor(accounts.map((a) => a.balance)),
    receivable: sumMinor(rec.map((r) => r.outstanding)),
    overdueReceivable: sumMinor(rec.map((r) => r.overdue)),
    payable: sumMinor(pay.map((p) => p.outstanding)),
  };
}

export interface MonthlyRow {
  period: Period;
  revenue: MinorUnits;
  expenses: MinorUnits;
  profit: MinorUnits;
  moneyIn: MinorUnits;
  moneyOut: MinorUnits;
}

export function monthlyReport(data: LedgerInput, period: Period, currency: CurrencyCode): MonthlyRow[] {
  return monthsInPeriod(period).map((month) => {
    const pl = profitAndLoss(data, month, currency);
    const cf = cashFlow(data.transactions, month, currency);
    return {
      period: month,
      revenue: pl.revenue.total,
      expenses: pl.expenses.total,
      profit: pl.profit,
      moneyIn: cf.moneyIn,
      moneyOut: cf.moneyOut,
    };
  });
}

export interface ContactHistoryEntry {
  date: ISODate;
  label: string;
  amount: MinorUnits;
  ref: { kind: 'document' | 'transaction'; id: string };
}

export function contactHistory(contact: Contact, data: LedgerInput): ContactHistoryEntry[] {
  const entries: ContactHistoryEntry[] = [];
  for (const d of data.documents) {
    if (d.contactId !== contact.id) continue;
    entries.push({
      date: d.issueDate,
      label: `${d.type[0]!.toUpperCase()}${d.type.slice(1)} ${d.number ?? '(draft)'}${d.status === 'void' ? ' — void' : ''}`,
      amount: documentTotals(d).total,
      ref: { kind: 'document', id: d.id },
    });
  }
  for (const t of data.transactions) {
    if (t.contactId !== contact.id) continue;
    entries.push({
      date: t.date,
      label: `${t.description}${t.status === 'void' ? ' — void' : ''}`,
      amount: t.amount,
      ref: { kind: 'transaction', id: t.id },
    });
  }
  return entries.sort((a, b) => compareDates(b.date, a.date));
}
