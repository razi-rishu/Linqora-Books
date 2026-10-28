import type { BooksData, BusinessDocument, MoneyAccount, Transaction } from './models';

const audit = {
  organizationId: 'org_test',
  createdAt: '2026-04-01T00:00:00.000Z',
  createdBy: 'user_test',
  updatedAt: '2026-04-01T00:00:00.000Z',
  updatedBy: 'user_test',
  origin: 'user' as const,
};

let counter = 0;

export function txn(partial: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount'>): Transaction {
  counter += 1;
  return {
    ...audit,
    id: `txn_${counter}`,
    date: '2026-05-10',
    currency: 'INR',
    accountId: 'acc_cash',
    description: partial.kind,
    status: 'posted',
    ...partial,
  };
}

export function doc(partial: Partial<BusinessDocument> & Pick<BusinessDocument, 'type'>): BusinessDocument {
  counter += 1;
  return {
    ...audit,
    id: `doc_${counter}`,
    status: partial.type === 'quotation' ? 'draft' : 'issued',
    contactId: 'con_a',
    issueDate: '2026-05-01',
    currency: 'INR',
    lines: [{ id: 'l1', description: 'Work', quantity: '1', unitPrice: 100000, taxRateBps: 1800 }],
    ...partial,
  };
}

export function account(partial: Partial<MoneyAccount> & Pick<MoneyAccount, 'id'>): MoneyAccount {
  return {
    ...audit,
    name: partial.id,
    kind: 'cash',
    currency: 'INR',
    openingBalance: 0,
    openingDate: '2026-04-01',
    archived: false,
    ...partial,
  };
}

export function books(partial: Partial<BooksData> = {}): BooksData {
  return {
    business: {
      id: 'org_test',
      name: 'Test Co',
      category: 'other',
      address: '',
      currency: 'INR',
      financialYearStartMonth: 4,
      timeZone: 'Asia/Kolkata',
      modules: { projects: true },
      createdAt: '2026-04-01T00:00:00.000Z',
    },
    contacts: [],
    accounts: [],
    transactions: [],
    documents: [],
    projects: [],
    categories: [],
    ...partial,
  };
}
