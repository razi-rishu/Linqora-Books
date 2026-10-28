import { describe, expect, it } from 'vitest';
import type { BusinessDocument } from '@linqora-books/accounting-core';
import { decideImport, inboundEventKey, type ExternalDocumentPayload } from './index';

const payload: ExternalDocumentPayload = {
  externalId: 'q-17',
  externalVersion: '2026-10-01T10:00:00Z',
  type: 'quotation',
  status: 'sent',
  customer: { externalId: 'c-1', name: 'Asha' },
  issueDate: '2026-10-01',
  currency: 'INR',
  lines: [],
};

function existing(partial: Partial<BusinessDocument>): BusinessDocument {
  return {
    id: 'doc_1',
    organizationId: 'org',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    origin: 'integration',
    type: 'quotation',
    status: 'sent',
    contactId: 'c',
    issueDate: '2026-10-01',
    currency: 'INR',
    lines: [],
    externalRef: { connectionId: 'conn_1', system: 'website', externalId: 'q-17', externalVersion: '2026-10-01T10:00:00Z' },
    ...partial,
  };
}

describe('decideImport', () => {
  it('creates new records', () => {
    expect(decideImport(payload, 'conn_1', [])).toEqual({ action: 'create' });
  });

  it('skips repeats of the same version (idempotent)', () => {
    expect(decideImport(payload, 'conn_1', [existing({})])).toEqual({ action: 'skip', reason: 'same_version' });
  });

  it('updates the same quotation on a newer save', () => {
    const newer = { ...payload, externalVersion: '2026-10-02T10:00:00Z' };
    expect(decideImport(newer, 'conn_1', [existing({})])).toEqual({ action: 'update', documentId: 'doc_1' });
  });

  it('ignores out-of-order older versions', () => {
    const older = { ...payload, externalVersion: '2026-09-30T10:00:00Z' };
    expect(decideImport(older, 'conn_1', [existing({})])).toMatchObject({ action: 'skip', reason: 'older_version' });
  });

  it('does not match records from a different connection', () => {
    expect(decideImport(payload, 'conn_2', [existing({})])).toEqual({ action: 'create' });
  });

  it('flags conflicts on issued invoices and converted quotations', () => {
    const newer = { ...payload, externalVersion: '2026-10-05T00:00:00Z' };
    expect(decideImport(newer, 'conn_1', [existing({ status: 'converted' })]).action).toBe('conflict');
    expect(decideImport({ ...newer, type: 'invoice' }, 'conn_1', [existing({ type: 'invoice', status: 'issued' })]).action).toBe('conflict');
  });

  it('builds stable idempotency keys', () => {
    expect(inboundEventKey('conn_1', 'quotation', 'q-17', 'v2')).toBe('conn_1:quotation:q-17:v2');
  });
});
