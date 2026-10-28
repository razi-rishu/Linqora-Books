import { describe, expect, it } from 'vitest';
import type { BusinessDocument, Transaction } from '@linqora-books/accounting-core';
import { CloudError, toCloudError } from './gateway';
import { documentFromRow, documentToRow, transactionFromRow, transactionToRow, type DocumentRow, type TransactionRow } from './mappers';

const audit = {
  organizationId: 'org_1',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'u1',
  updatedAt: '2026-06-01T00:00:00.000Z',
  updatedBy: 'u1',
  origin: 'user' as const,
};

/** What the database returns for a row written from `row` (server stamps added). */
function asStored<T>(row: Record<string, unknown>): T {
  return { created_at: audit.createdAt, created_by: 'u1', updated_at: audit.updatedAt, updated_by: 'u1', void_by: row.void_reason ? 'u1' : null, ...row } as T;
}

describe('mappers', () => {
  it('round-trips a transaction, keeping absent optional fields absent', () => {
    const t: Transaction = {
      ...audit, id: 'txn_1', kind: 'advance_applied', date: '2026-06-02', amount: 12345, currency: 'INR',
      advanceId: 'adv_1', documentId: 'inv_1', contactId: 'c1', description: 'Applied', status: 'void',
      void: { at: '2026-06-03T00:00:00.000Z', by: 'u1', reason: 'Mistake' },
    };
    const back = transactionFromRow(asStored<TransactionRow>(transactionToRow(t, 'org_1')));
    expect(back).toEqual(t);
    expect('accountId' in back).toBe(false);
  });

  it('round-trips a document with lines and conversion links', () => {
    const d: BusinessDocument = {
      ...audit, id: 'inv_1', type: 'invoice', number: 'INV/2026-27/0001', status: 'issued', contactId: 'c1',
      issueDate: '2026-06-01', dueDate: '2026-06-15', currency: 'INR', convertedFromId: 'quo_1',
      lines: [{ id: 'l1', description: 'Work', quantity: '1.5', unitPrice: 10001, taxRateBps: 1800 }],
    };
    expect(documentFromRow(asStored<DocumentRow>(documentToRow(d, 'org_1')))).toEqual(d);
  });

  it('converts numeric strings from the database to numbers', () => {
    const row = asStored<TransactionRow>({ ...transactionToRow({ ...audit, id: 't', kind: 'income', date: '2026-06-01', amount: 5, currency: 'INR', accountId: 'a', description: 'x', status: 'posted' }, 'o'), amount: '900719925474' });
    expect(transactionFromRow(row).amount).toBe(900719925474);
  });

  it('refuses to send sample records to the cloud', () => {
    const sample: Transaction = { ...audit, origin: 'sample', id: 's', kind: 'income', date: '2026-06-01', amount: 1, currency: 'INR', accountId: 'a', description: 'x', status: 'posted' };
    expect(() => transactionToRow(sample, 'org_1')).toThrow(CloudError);
  });
});

describe('toCloudError', () => {
  it.each([
    [{ message: 'TypeError: Failed to fetch' }, 'network'],
    [{ message: 'fetch failed' }, 'network'],
    [{ code: '23505', message: 'duplicate key value' }, 'duplicate'],
    [{ code: '42501', message: 'new row violates row-level security policy' }, 'permission'],
    [{ code: 'P0001', message: 'Amount is more than the outstanding balance' }, 'validation'],
    [{ code: '23503', message: 'violates foreign key constraint' }, 'validation'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'auth'],
    [{ status: 401, message: 'unauthorized' }, 'auth'],
  ])('%o → %s', (input, kind) => {
    expect(toCloudError(input).kind).toBe(kind);
  });

  it('passes database rule messages through unchanged (they are written for users)', () => {
    expect(toCloudError({ code: 'P0001', message: 'Money movements cannot be dated in the future' }).message).toBe(
      'Money movements cannot be dated in the future',
    );
  });

  it('never claims something was saved on a network failure', () => {
    expect(toCloudError({ message: 'Failed to fetch' }).message).toMatch(/Nothing was saved/);
  });
});
