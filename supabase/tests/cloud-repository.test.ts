import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  dashboardSummary,
  defaultCategories,
  financialYearOf,
  issueDocument,
  todayInTimeZone,
  transitionQuotation,
  convertQuotationToInvoice,
  voidTransaction,
  type AuditFields,
  type BooksData,
  type BusinessDocument,
  type BusinessProfile,
  type Transaction,
} from '@linqora-books/accounting-core';
import { CloudBooksRepository, CloudError, planLocalImport } from '@linqora-books/cloud';
import { TestDb } from './harness';
import { grantAccess } from './fixtures';
import { PgliteGateway } from './pglite-gateway';

const NOW = '2026-06-01T00:00:00.000Z';
const audit = (id: string, origin: 'user' | 'sample' = 'user'): AuditFields => ({
  id,
  organizationId: 'local_org',
  createdAt: NOW,
  createdBy: 'local_user',
  updatedAt: NOW,
  updatedBy: 'local_user',
  origin,
});
const profile = (name: string): BusinessProfile => ({
  id: 'pending',
  name,
  category: 'events',
  address: 'Kochi',
  currency: 'INR',
  financialYearStartMonth: 4,
  timeZone: 'Asia/Kolkata',
  modules: { projects: true },
  createdAt: NOW,
});
const actor = { userId: 'x', now: NOW };
const LINES = [{ id: 'l1', description: 'Decor', quantity: '1', unitPrice: 100000, taxRateBps: 1800 }]; // 118000

let db: TestDb;
async function signedUpUser(email: string) {
  const uid = await db.createUser(email);
  const repo = new CloudBooksRepository(new PgliteGateway(db, uid));
  return { uid, repo };
}

beforeAll(async () => {
  db = await TestDb.create();
});

describe('business onboarding through the cloud repository', () => {
  it('creates the business with starter categories; a second device sees it', async () => {
    const { uid, repo } = await signedUpUser('onboard@example.test');
    expect(await repo.load()).toBeNull(); // → app shows business setup
    await repo.saveBusiness(profile('Onboard Events'), { categories: defaultCategories('events') });
    const data = (await repo.load())!;
    expect(data.business).toMatchObject({ name: 'Onboard Events', currency: 'INR', timeZone: 'Asia/Kolkata' });
    expect(data.categories.length).toBeGreaterThan(10);

    const secondDevice = new CloudBooksRepository(new PgliteGateway(db, uid));
    expect((await secondDevice.load())!.business.name).toBe('Onboard Events');
  });

  it('refuses to upload sample data when creating a business', async () => {
    const { repo } = await signedUpUser('sampler@example.test');
    const contact = { ...audit('sample_c', 'sample'), kind: 'customer' as const, name: 'S', archived: false };
    await expect(repo.saveBusiness(profile('Sampler'), { contacts: [contact] })).rejects.toThrow(/Sample data is not stored/);
  });

  it('without server-granted access, saving is refused (read-only)', async () => {
    const { repo } = await signedUpUser('noaccess@example.test');
    await repo.saveBusiness(profile('No Access Co'));
    expect((await repo.loadEntitlement()).status).toBe('none');
    const err = await repo
      .saveContact({ ...audit('c1'), kind: 'customer', name: 'Asha', archived: false })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudError);
    expect((err as CloudError).kind).toBe('permission');
  });
});

describe('accounting records persist and calculations stay correct', () => {
  let repo: CloudBooksRepository;
  let uid: string;

  beforeAll(async () => {
    ({ uid, repo } = await signedUpUser('books@example.test'));
    await repo.saveBusiness(profile('Books Co'));
    await grantAccess(db, (await repo.organizationId())!);
  });

  it('round-trips contacts, accounts, projects, documents and transactions', async () => {
    await repo.saveContact({ ...audit('con_asha'), kind: 'customer', name: 'Asha', phone: '+91 90000 00000', archived: false });
    await repo.saveAccount({ ...audit('acc_bank'), name: 'Bank', kind: 'bank', currency: 'INR', openingBalance: 50000, openingDate: '2026-04-01', archived: false });
    await repo.saveProject({ ...audit('prj_w'), name: 'Wedding', customerId: 'con_asha', status: 'active', estimatedRevenue: 200000, estimatedCost: 100000, currency: 'INR' });
    const draft: BusinessDocument = { ...audit('inv_1'), type: 'invoice', status: 'draft', contactId: 'con_asha', projectId: 'prj_w', issueDate: '2026-06-10', currency: 'INR', lines: LINES };
    await repo.saveDocuments([draft]);
    await repo.saveDocuments([issueDocument(draft, 'INV/2026-27/0001', actor)]);
    const payment: Transaction = { ...audit('pay_1'), kind: 'payment_received', date: '2026-06-12', amount: 18000, currency: 'INR', accountId: 'acc_bank', contactId: 'con_asha', documentId: 'inv_1', paymentMethod: 'upi', description: 'Part payment', status: 'posted' };
    await repo.saveTransaction(payment);

    const data = (await repo.load())!;
    expect(data.contacts[0]).toMatchObject({ id: 'con_asha', name: 'Asha', phone: '+91 90000 00000', createdBy: uid });
    expect(data.documents[0]).toMatchObject({ id: 'inv_1', status: 'issued', number: 'INV/2026-27/0001', lines: LINES });
    expect(data.transactions[0]).toMatchObject({ id: 'pay_1', amount: 18000, kind: 'payment_received' });

    // The payment settles the invoice; it is cash, not new revenue.
    const s = dashboardSummary(data, financialYearOf('2026-06-12', 4), '2026-06-30');
    expect(s.profitAndLoss.revenue.total).toBe(100000);
    expect(s.cash.moneyIn).toBe(18000);
    expect(s.receivable).toBe(100000);
    expect(s.totalCashAndBank).toBe(68000);
  });

  it('a retried save (lost response) does not create a second payment', async () => {
    const retry: Transaction = { ...audit('pay_1'), kind: 'payment_received', date: '2026-06-12', amount: 18000, currency: 'INR', accountId: 'acc_bank', documentId: 'inv_1', description: 'Part payment', status: 'posted' };
    await repo.saveTransaction(retry);
    const data = (await repo.load())!;
    expect(data.transactions.filter((t) => t.id === 'pay_1')).toHaveLength(1);
  });

  it('server rules reach the user as clear messages (no false "saved")', async () => {
    const over: Transaction = { ...audit('pay_over'), kind: 'payment_received', date: '2026-06-12', amount: 999999, currency: 'INR', accountId: 'acc_bank', documentId: 'inv_1', description: 'Too much', status: 'posted' };
    await expect(repo.saveTransaction(over)).rejects.toMatchObject({ kind: 'validation', message: expect.stringMatching(/outstanding balance/) });
    const issued = (await repo.load())!.documents[0]!;
    await expect(repo.saveDocuments([{ ...issued, lines: [] }])).rejects.toMatchObject({ kind: 'validation' });
  });

  it('voids instead of deleting, recording who voided', async () => {
    const data = (await repo.load())!;
    await repo.saveTransaction(voidTransaction(data.transactions[0]!, 'Wrong amount', actor));
    const after = (await repo.load())!.transactions[0]!;
    expect(after.status).toBe('void');
    expect(after.void).toMatchObject({ reason: 'Wrong amount', by: uid });
  });

  it('converts a quotation atomically and releases it when the draft invoice is deleted', async () => {
    const quote: BusinessDocument = { ...audit('quo_1'), type: 'quotation', number: 'QUO/2026-27/0001', status: 'draft', contactId: 'con_asha', issueDate: '2026-06-01', currency: 'INR', lines: LINES };
    await repo.saveDocuments([quote]);
    const accepted = transitionQuotation(quote, 'accept', actor);
    await repo.saveDocuments([accepted]);
    const { quotation, invoice } = convertQuotationToInvoice(accepted, 'inv_from_q', actor, '2026-06-05');
    await repo.saveDocuments([quotation, invoice]);
    await repo.saveDocuments([quotation, invoice]); // double tap / retry
    let docs = (await repo.load())!.documents;
    expect(docs.filter((d) => d.convertedFromId === 'quo_1').map((d) => d.id)).toEqual(['inv_from_q']);

    await repo.deleteDraftDocument('inv_from_q', actor);
    docs = (await repo.load())!.documents;
    expect(docs.find((d) => d.id === 'quo_1')).toMatchObject({ status: 'accepted' });
    expect(docs.find((d) => d.id === 'quo_1')!.convertedToId).toBeUndefined();
  });

  it('stores the logo privately and returns a signed URL', async () => {
    const data = (await repo.load())!;
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await repo.saveBusiness({ ...data.business, logoDataUrl: pixel });
    const after = (await repo.load())!;
    expect(after.business.logoDataUrl).toMatch(/^https:\/\/signed\.test\/business-logos\/.+\/logo$/);
  });
});

describe('isolation between two accounts', () => {
  it('each user only ever loads their own business', async () => {
    const alice = await signedUpUser('alice2@example.test');
    const bob = await signedUpUser('bob2@example.test');
    await alice.repo.saveBusiness(profile('Alice Co'));
    await bob.repo.saveBusiness(profile('Bob Co'));
    await grantAccess(db, (await alice.repo.organizationId())!);
    await grantAccess(db, (await bob.repo.organizationId())!);
    await alice.repo.saveContact({ ...audit('secret'), kind: 'customer', name: 'Alice customer', archived: false });

    const bobData = (await bob.repo.load())!;
    expect(bobData.business.name).toBe('Bob Co');
    expect(bobData.contacts).toEqual([]);

    // Bob's gateway aimed at Alice's business: nothing visible, nothing writable.
    const aliceOrg = (await alice.repo.organizationId())!;
    const bobGw = new PgliteGateway(db, bob.uid);
    expect(await bobGw.selectRows('contacts', { organization_id: aliceOrg })).toEqual([]);
    expect(await bobGw.updateRows('contacts', { organization_id: aliceOrg, id: 'secret' }, { name: 'pwned' })).toBe(0);
    await expect(bobGw.insertRow('contacts', { organization_id: aliceOrg, id: 'x', kind: 'customer', name: 'x' })).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('importing Phase 1 local records', () => {
  function localBooks(): BooksData {
    const t = (id: string, rest: Partial<Transaction> & Pick<Transaction, 'kind' | 'date' | 'amount'>): Transaction => ({
      ...audit(id), currency: 'INR', description: id, status: 'posted', ...rest,
    });
    return {
      business: { ...profile('My Local Shop'), id: 'org_local_1' },
      categories: defaultCategories('events'),
      contacts: [
        { ...audit('con_local'), kind: 'customer', name: 'Local customer', archived: false },
        { ...audit('sample_con', 'sample'), kind: 'customer', name: 'Sample customer', archived: false },
      ],
      accounts: [{ ...audit('acc_local'), name: 'Shop cash', kind: 'cash', currency: 'INR', openingBalance: 10000, openingDate: '2026-04-01', archived: false }],
      projects: [],
      documents: [
        { ...audit('quo_local'), type: 'quotation', number: 'QUO/2026-27/0001', status: 'converted', convertedToId: 'inv_local', contactId: 'con_local', issueDate: '2026-05-01', currency: 'INR', lines: LINES },
        { ...audit('inv_local'), type: 'invoice', number: 'INV/2026-27/0001', status: 'issued', convertedFromId: 'quo_local', contactId: 'con_local', issueDate: '2026-05-10', currency: 'INR', lines: LINES },
        { ...audit('inv_sample', 'sample'), type: 'invoice', number: 'INV/2026-27/0099', status: 'issued', contactId: 'sample_con', issueDate: '2026-05-10', currency: 'INR', lines: LINES },
      ],
      transactions: [
        t('sale_local', { kind: 'income', date: '2026-05-02', amount: 5000, accountId: 'acc_local', categoryId: 'inc_sales' }),
        t('adv_local', { kind: 'advance_received', date: '2026-05-03', amount: 20000, accountId: 'acc_local', contactId: 'con_local' }),
        t('apply_local', { kind: 'advance_applied', date: '2026-05-12', amount: 20000, advanceId: 'adv_local', documentId: 'inv_local', contactId: 'con_local' }),
        t('pay_local', { kind: 'payment_received', date: '2026-05-15', amount: 50000, accountId: 'acc_local', documentId: 'inv_local' }),
        { ...t('dup_local', { kind: 'expense', date: '2026-05-04', amount: 300, accountId: 'acc_local', categoryId: 'exp_office' }), status: 'void', void: { at: NOW, by: 'local_user', reason: 'Duplicate' } },
        t('pay_on_sample', { kind: 'payment_received', date: '2026-05-15', amount: 100, accountId: 'acc_local', documentId: 'inv_sample' }),
      ],
    };
  }

  it('the real Phase 1 browser export has nothing importable: its one user payment uses sample records', async () => {
    const { repo } = await signedUpUser('fixture@example.test');
    await repo.saveBusiness(profile('Fixture Co'));
    const raw = JSON.parse(readFileSync(new URL('../../apps/mobile/src/import/fixtures/phase1-browser-export.json', import.meta.url), 'utf8'));
    const plan = await planLocalImport(raw['linqora-books:data:v1'], (await repo.load())!, todayInTimeZone('Asia/Kolkata'));
    expect(plan.importable).toEqual([]);
    expect(plan.excludedSampleCount).toBe(25);
    expect(plan.rejected).toEqual([
      expect.objectContaining({ kind: 'transaction', id: 'txn_cf1ea8c6-5dba-4b2d-b429-fb1d8db36832', reason: expect.stringMatching(/sample record/) }),
    ]);
  });

  it('imports reviewed user records atomically, preserves calculations, and never twice', async () => {
    const { repo } = await signedUpUser('importer@example.test');
    await repo.saveBusiness(profile('Importer Co'));
    await grantAccess(db, (await repo.organizationId())!);
    const local = localBooks();
    const cloud = (await repo.load())!;
    const plan = await planLocalImport(local, cloud, todayInTimeZone('Asia/Kolkata'));

    expect(plan.excludedSampleCount).toBe(2);
    expect(plan.rejected.map((r) => r.id)).toEqual(['pay_on_sample']);
    expect(plan.importable.map((i) => i.id).sort()).toEqual(
      ['acc_local', 'adv_local', 'apply_local', 'con_local', 'dup_local', 'inv_local', 'pay_local', 'quo_local', 'sale_local'].sort(),
    );

    const result = await repo.importLocal(plan);
    expect(result).toMatchObject({ status: 'imported', inserted: { contacts: 1, money_accounts: 1, documents: 2, transactions: 5 } });

    const after = (await repo.load())!;
    expect(after.documents.find((d) => d.id === 'quo_local')).toMatchObject({ status: 'converted', convertedToId: 'inv_local' });
    expect(after.transactions.find((t) => t.id === 'dup_local')!.status).toBe('void');
    expect(after.contacts[0]!.externalRef).toMatchObject({ system: 'linqora-books-local', externalId: 'con_local' });

    // Same figures as the local books (sample rows excluded), computed from cloud data.
    const period = financialYearOf('2026-05-15', 4);
    const localUserOnly: BooksData = {
      ...local,
      contacts: local.contacts.filter((x) => x.origin !== 'sample'),
      documents: local.documents.filter((x) => x.origin !== 'sample'),
      transactions: local.transactions.filter((x) => x.id !== 'pay_on_sample'),
    };
    const expected = dashboardSummary(localUserOnly, period, '2026-06-30');
    const actual = dashboardSummary(after, period, '2026-06-30');
    expect(actual.profitAndLoss).toEqual(expected.profitAndLoss);
    expect(actual.cash).toEqual(expected.cash);
    expect(actual.totalCashAndBank).toBe(expected.totalCashAndBank);
    expect(actual.receivable).toBe(expected.receivable);

    // Repeating the same import is refused; re-planning finds nothing new.
    expect(await repo.importLocal(plan)).toEqual({ status: 'already_imported' });
    const again = await planLocalImport(local, after, todayInTimeZone('Asia/Kolkata'));
    expect(again.importable).toEqual([]);
  });

  it('an import that breaks a server rule changes nothing at all', async () => {
    const { repo } = await signedUpUser('atomic@example.test');
    await repo.saveBusiness(profile('Atomic Co'));
    await grantAccess(db, (await repo.organizationId())!);
    const plan = await planLocalImport(localBooks(), (await repo.load())!, todayInTimeZone('Asia/Kolkata'));
    // Tamper after review: an overpayment the server must refuse.
    const tampered = structuredClone(plan);
    tampered.fingerprint = 'tampered-fingerprint-0001';
    tampered.payload.transactions.push({ ...tampered.payload.transactions.find((t) => t.id === 'pay_local')!, id: 'pay_extra', amount: 999999 });
    await expect(repo.importLocal(tampered)).rejects.toMatchObject({ kind: 'validation' });
    const data = (await repo.load())!;
    expect(data.contacts).toEqual([]);
    expect(data.transactions).toEqual([]);
  });
});
