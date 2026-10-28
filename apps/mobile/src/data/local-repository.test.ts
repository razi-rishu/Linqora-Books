import { beforeEach, describe, expect, it } from 'vitest';
import {
  convertQuotationToInvoice,
  dashboardSummary,
  financialYearOf,
  transitionQuotation,
  type BusinessProfile,
  type Transaction,
} from '@linqora-books/accounting-core';
import { LocalBooksRepository } from './local-repository';
import { buildSampleData } from './sample-data';

const business: BusinessProfile = {
  id: 'org_1',
  name: 'Test Garage',
  category: 'garage_services',
  address: '',
  currency: 'INR',
  financialYearStartMonth: 4,
  timeZone: 'Asia/Kolkata',
  modules: { projects: true },
  createdAt: '2026-10-01T00:00:00.000Z',
};
const TODAY = '2026-10-28';
const NOW = '2026-10-28T06:00:00.000Z';
const actor = { userId: 'user_2', now: '2026-10-28T07:00:00.000Z' };

function userTxn(partial: Partial<Transaction>): Transaction {
  return {
    id: 'txn_user',
    organizationId: 'org_1',
    createdAt: NOW,
    createdBy: 'u',
    updatedAt: NOW,
    updatedBy: 'u',
    origin: 'user',
    kind: 'income',
    date: TODAY,
    amount: 1000,
    currency: 'INR',
    accountId: 'sample_acc_cash',
    description: 'Sale',
    status: 'posted',
    ...partial,
  };
}

describe('LocalBooksRepository', () => {
  let repo: LocalBooksRepository;
  beforeEach(async () => {
    repo = new LocalBooksRepository(localStorage);
    await repo.saveBusiness(business, buildSampleData(business, 'u', TODAY, NOW));
  });

  it('round-trips data through local storage', async () => {
    const data = await repo.load();
    expect(data?.business.name).toBe('Test Garage');
    expect(data?.transactions.length).toBeGreaterThan(5);
  });

  it('rejects invalid transactions', async () => {
    await expect(repo.saveTransaction(userTxn({ kind: 'transfer', toAccountId: 'sample_acc_cash' }))).rejects.toThrow(/must differ/);
    await expect(repo.saveTransaction(userTxn({ amount: 0 }))).rejects.toThrow(/greater than zero/);
  });

  it('refuses to change void transactions', async () => {
    const data = await repo.load();
    const voided = data!.transactions.find((t) => t.status === 'void')!;
    await expect(repo.saveTransaction({ ...voided, status: 'posted' })).rejects.toThrow(/Void/);
  });

  it('keeps document numbers immutable', async () => {
    const data = await repo.load();
    const inv = data!.documents.find((d) => d.id === 'sample_doc_inv1')!;
    await expect(repo.saveDocuments([{ ...inv, number: 'INV/2026-27/9999' }])).rejects.toThrow(/numbers cannot be changed/);
  });

  it('prevents a second invoice from the same quotation', async () => {
    const data = await repo.load();
    const inv = data!.documents.find((d) => d.id === 'sample_doc_inv1')!;
    const { number: _n, ...copy } = inv;
    void _n;
    await expect(repo.saveDocuments([{ ...copy, id: 'doc_dupe', status: 'draft' }])).rejects.toThrow(/already been created/);
  });

  it('only deletes drafts', async () => {
    await expect(repo.deleteDraftDocument('sample_doc_inv1', actor)).rejects.toThrow(/Only drafts/);
    await repo.deleteDraftDocument('sample_doc_quo3', actor);
    expect((await repo.load())!.documents.some((d) => d.id === 'sample_doc_quo3')).toBe(false);
  });

  it('returns a quotation to "accepted" when its converted draft invoice is deleted', async () => {
    const quote = (await repo.load())!.documents.find((d) => d.id === 'sample_doc_quo2')!;
    const first = convertQuotationToInvoice(transitionQuotation(quote, 'accept', actor), 'doc_first', actor, TODAY);
    await repo.saveDocuments([first.quotation, first.invoice]);

    await repo.deleteDraftDocument('doc_first', actor);
    const after = (await repo.load())!.documents;
    const released = after.find((d) => d.id === 'sample_doc_quo2')!;
    expect(after.some((d) => d.id === 'doc_first')).toBe(false);
    expect(released).toMatchObject({ status: 'accepted', updatedAt: actor.now, updatedBy: actor.userId });
    expect(released.convertedToId).toBeUndefined();

    // It can be converted again, and the duplicate guard still allows exactly one invoice.
    const second = convertQuotationToInvoice(released, 'doc_second', actor, TODAY);
    await repo.saveDocuments([second.quotation, second.invoice]);
    await expect(repo.saveDocuments([{ ...second.invoice, id: 'doc_third' }])).rejects.toThrow(/already been created/);
  });

  it('locks the currency once an account exists (no records needed)', async () => {
    const empty = new LocalBooksRepository(localStorage);
    await empty.clear();
    await empty.saveBusiness(business);
    await empty.saveBusiness({ ...business, currency: 'USD' });
    expect((await empty.load())!.business.currency).toBe('USD');

    await empty.saveAccount({
      id: 'acc_usd',
      organizationId: 'org_1',
      createdAt: NOW,
      createdBy: 'u',
      updatedAt: NOW,
      updatedBy: 'u',
      origin: 'user',
      name: 'Cash',
      kind: 'cash',
      currency: 'USD',
      openingBalance: 0,
      openingDate: TODAY,
      archived: false,
    });
    await expect(empty.saveBusiness({ ...business, currency: 'INR' })).rejects.toThrow(/currency cannot be changed/);
    // Other profile changes still save.
    await empty.saveBusiness({ ...business, currency: 'USD', name: 'Renamed' });
    const data = (await empty.load())!;
    expect(data.business).toMatchObject({ currency: 'USD', name: 'Renamed' });
    expect(() => dashboardSummary(data, financialYearOf(TODAY, 4), TODAY)).not.toThrow();
  });

  it('removes sample data, but not when own records depend on it', async () => {
    await repo.saveTransaction(userTxn({}));
    await expect(repo.removeSampleData()).rejects.toThrow(/use a sample/);
    await repo.saveAccount({
      id: 'acc_own',
      organizationId: 'org_1',
      createdAt: NOW,
      createdBy: 'u',
      updatedAt: NOW,
      updatedBy: 'u',
      origin: 'user',
      name: 'Own cash',
      kind: 'cash',
      currency: 'INR',
      openingBalance: 0,
      openingDate: TODAY,
      archived: false,
    });
    await repo.saveTransaction(userTxn({ accountId: 'acc_own' }));
    await repo.removeSampleData();
    const data = (await repo.load())!;
    expect([...data.transactions, ...data.documents, ...data.contacts].every((x) => x.origin !== 'sample')).toBe(true);
    expect(data.transactions).toHaveLength(1);
  });
});

describe('sample data', () => {
  const sample = buildSampleData(business, 'u', TODAY, NOW);

  it('marks every record as sample', () => {
    for (const list of [sample.contacts, sample.accounts, sample.transactions, sample.documents, sample.projects]) {
      expect(list.every((x) => x.origin === 'sample')).toBe(true);
    }
  });

  it('produces consistent dashboard figures', () => {
    const s = dashboardSummary({ business, ...sample }, financialYearOf(TODAY, 4), TODAY);
    // Invoices: 1,50,000 + 15,000 (net of tax); direct income 8,500 + 12,000; refund 1,500
    expect(s.profitAndLoss.revenue.total).toBe((150_000 + 15_000 + 8_500 + 12_000 - 1_500) * 100);
    // Bill 45,000 + rent 18,000 + transport 3,200 + electricity 2,450 (duplicate is void)
    expect(s.profitAndLoss.expenses.total).toBe((45_000 + 18_000 + 3_200 + 2_450) * 100);
    // 1,77,000 − 1,00,000 paid + 17,700 unpaid
    expect(s.receivable).toBe((77_000 + 17_700) * 100);
    expect(s.overdueReceivable).toBe(77_000 * 100);
    expect(s.payable).toBe((53_100 - 30_000) * 100);
    expect(s.totalCashAndBank).toBe(200_350 * 100);
  });
});
