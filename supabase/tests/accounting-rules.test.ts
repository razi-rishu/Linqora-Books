import { beforeAll, describe, expect, it } from 'vitest';
import { documentTotals, type DocumentLine } from '@linqora-books/accounting-core';
import { rejects, TestDb, user, type Role } from './harness';
import { issuedInvoice, LINES, seedBasics, setupOrg, txnSql, type OrgFixture } from './fixtures';

let db: TestDb;
let A: OrgFixture;
let u: Role;

const base = (o: OrgFixture) => ({ organization_id: o.org, currency: 'INR', description: 'entry' });
async function insertTxn(cols: Record<string, unknown>, role: Role = u) {
  const t = txnSql({ ...base(A), ...cols });
  return db.as(role, t.sql, t.params);
}

beforeAll(async () => {
  db = await TestDb.create();
  A = await setupOrg(db, 'owner@example.test');
  u = user(A.uid);
  await seedBasics(db, A);
  await issuedInvoice(db, A); // inv_1, 10 Jun 2026, total 118000
});

describe('money: SQL totals equal the app\'s decimal-safe totals', () => {
  it('matches documentTotals() for 300 random documents', async () => {
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let i = 0; i < 300; i++) {
      const lines: DocumentLine[] = Array.from({ length: 1 + rand(5) }, (_, k) => ({
        id: `l${k}`,
        description: 'x',
        quantity: `${rand(50)}.${String(rand(1000)).padStart(3, '0')}`.replace(/^0\./, '1.'),
        unitPrice: rand(10_000_000),
        taxRateBps: [0, 500, 1200, 1800, 2800, 333][rand(6)]!,
      }));
      const [sql] = await db.admin<{ subtotal: string; tax: string; total: string }>(
        `select (t).subtotal, (t).tax, (t).total from (select public.document_totals($1::jsonb) as t) x`,
        [JSON.stringify(lines)],
      );
      const js = documentTotals({ lines });
      expect({ subtotal: Number(sql!.subtotal), tax: Number(sql!.tax), total: Number(sql!.total) }).toEqual(js);
    }
  });
});

describe('payments settle invoices and never count as revenue twice', () => {
  it('accepts partial payments up to the balance and rejects overpayment', async () => {
    await insertTxn({ id: 'pay_1', kind: 'payment_received', date: '2026-06-12', amount: 18000, account_id: 'acc_bank', document_id: 'inv_1', contact_id: 'con_cust' });
    await rejects(
      insertTxn({ id: 'pay_2', kind: 'payment_received', date: '2026-06-12', amount: 100001, account_id: 'acc_bank', document_id: 'inv_1' }),
      /outstanding balance/,
    );
    await insertTxn({ id: 'pay_3', kind: 'payment_received', date: '2026-06-13', amount: 100000, account_id: 'acc_bank', document_id: 'inv_1' });
    await rejects(
      insertTxn({ id: 'pay_4', kind: 'payment_received', date: '2026-06-14', amount: 1, account_id: 'acc_bank', document_id: 'inv_1' }),
      /outstanding balance/,
    );
  });

  it('a retried submission with the same id is rejected as a duplicate, not double-counted', async () => {
    await rejects(
      insertTxn({ id: 'pay_1', kind: 'payment_received', date: '2026-06-12', amount: 18000, account_id: 'acc_bank', document_id: 'inv_1' }),
      /duplicate key|outstanding balance/,
    );
    const [row] = await db.as<{ n: number }>(u, `select count(*)::int as n from public.transactions where id = 'pay_1'`);
    expect(row!.n).toBe(1);
  });

  it('payments must match document type and contact, and need an issued document', async () => {
    await db.as(u, `insert into public.documents (organization_id, id, type, status, contact_id, issue_date, currency, lines)
                    values ($1, 'inv_draft', 'invoice', 'draft', 'con_cust', '2026-06-10', 'INR', $2)`, [A.org, LINES]);
    await rejects(insertTxn({ id: 'p_draft', kind: 'payment_received', date: '2026-06-12', amount: 1, account_id: 'acc_bank', document_id: 'inv_draft' }), /draft invoice/);
    await rejects(insertTxn({ id: 'p_type', kind: 'payment_made', date: '2026-06-12', amount: 1, account_id: 'acc_bank', document_id: 'inv_1' }), /linked to a bill/);
    await rejects(insertTxn({ id: 'p_contact', kind: 'payment_received', date: '2026-06-12', amount: 1, account_id: 'acc_bank', document_id: 'inv_1', contact_id: 'con_supp' }), /contact does not match|outstanding/);
    await rejects(insertTxn({ id: 'p_nodoc', kind: 'payment_received', date: '2026-06-12', amount: 1, account_id: 'acc_bank' }), /check constraint|linked to an invoice/);
    await rejects(insertTxn({ id: 'p_income_doc', kind: 'income', date: '2026-06-12', amount: 1, account_id: 'acc_bank', document_id: 'inv_1' }), /check constraint/);
  });
});

describe('date rules', () => {
  it('D1: no entries before the account opening date (both transfer sides)', async () => {
    await rejects(insertTxn({ id: 'd1', kind: 'income', date: '2026-03-31', amount: 1, account_id: 'acc_bank', category_id: 'inc_sales' }), /starts on 01 Apr 2026/);
    await rejects(insertTxn({ id: 'd1t', kind: 'transfer', date: '2026-03-31', amount: 1, account_id: 'acc_bank', to_account_id: 'acc_cash' }), /starts on/);
    await insertTxn({ id: 'd1ok', kind: 'income', date: '2026-04-01', amount: 1, account_id: 'acc_bank', category_id: 'inc_sales' });
  });

  it('D2: no future-dated money (server clock)', async () => {
    await rejects(insertTxn({ id: 'd2', kind: 'expense', date: '2999-01-01', amount: 1, account_id: 'acc_bank', category_id: 'exp_rent' }), /future/);
  });

  it('D3: no payment before its invoice — use an advance instead', async () => {
    await issuedInvoice(db, A, 'inv_2', 'INV/2026-27/0002');
    await rejects(
      insertTxn({ id: 'd3', kind: 'payment_received', date: '2026-06-01', amount: 1, account_id: 'acc_bank', document_id: 'inv_2' }),
      /before the invoice date .* customer advance/,
    );
  });

  it('opening details are fixed once entries use the account; opening date not in the future', async () => {
    await rejects(db.as(u, `update public.money_accounts set opening_date = '2026-05-01' where organization_id = $1 and id = 'acc_bank'`, [A.org]), /cannot change once entries/);
    await rejects(
      db.as(u, `insert into public.money_accounts (organization_id, id, name, kind, currency, opening_date) values ($1, 'acc_future', 'F', 'cash', 'INR', '2999-01-01')`, [A.org]),
      /cannot be in the future/,
    );
  });
});

describe('customer advances', () => {
  it('advance → apply → refund stays within the advance and the invoice balance', async () => {
    await issuedInvoice(db, A, 'inv_3', 'INV/2026-27/0003');
    await insertTxn({ id: 'adv_1', kind: 'advance_received', date: '2026-06-01', amount: 50000, account_id: 'acc_bank', contact_id: 'con_cust' });
    await rejects(insertTxn({ id: 'adv_s', kind: 'advance_received', date: '2026-06-01', amount: 1, account_id: 'acc_bank', contact_id: 'con_supp' }), /not suppliers/);
    await insertTxn({ id: 'app_1', kind: 'advance_applied', date: '2026-06-10', amount: 40000, advance_id: 'adv_1', document_id: 'inv_3', contact_id: 'con_cust', account_id: null });
    await rejects(insertTxn({ id: 'app_2', kind: 'advance_applied', date: '2026-06-10', amount: 10001, advance_id: 'adv_1', document_id: 'inv_3', account_id: null }), /unused part/);
    await rejects(insertTxn({ id: 'app_acc', kind: 'advance_applied', date: '2026-06-10', amount: 1, advance_id: 'adv_1', document_id: 'inv_3', account_id: 'acc_bank' }), /check constraint/);
    await insertTxn({ id: 'ref_1', kind: 'advance_refunded', date: '2026-06-20', amount: 10000, advance_id: 'adv_1', account_id: 'acc_bank' });
    await rejects(insertTxn({ id: 'ref_2', kind: 'advance_refunded', date: '2026-06-20', amount: 1, advance_id: 'adv_1', account_id: 'acc_bank' }), /unused part/);
    // Invoice balance includes the applied advance.
    const [bal] = await db.admin<{ b: string }>(`select (public.document_totals(lines)).total - public.document_settled(organization_id, id, 'invoice') as b from public.documents where id = 'inv_3'`);
    expect(Number(bal!.b)).toBe(118000 - 40000);
  });

  it('an advance cannot be voided while applied', async () => {
    await rejects(
      db.as(u, `update public.transactions set status = 'void', void_reason = 'x', void_at = now() where organization_id = $1 and id = 'adv_1'`, [A.org]),
      /applications and refunds/,
    );
  });
});

describe('corrections: void, never edit or delete', () => {
  it('posted transactions cannot be edited or deleted, only voided', async () => {
    await rejects(db.as(u, `update public.transactions set amount = 1 where organization_id = $1 and id = 'pay_1'`, [A.org]), /cannot be edited/);
    await rejects(db.as(u, `delete from public.transactions where organization_id = $1 and id = 'pay_1'`, [A.org]), /permission denied|never deleted/);
    const [v] = await db.as<{ status: string; void_by: string }>(
      u, `update public.transactions set status = 'void', void_reason = 'Entered twice', void_at = now() where organization_id = $1 and id = 'pay_1' returning status, void_by`, [A.org]);
    expect(v).toEqual({ status: 'void', void_by: A.uid });
    await rejects(db.as(u, `update public.transactions set status = 'posted', void_reason = null, void_at = null where organization_id = $1 and id = 'pay_1'`, [A.org]), /Void transactions cannot be changed/);
  });

  it('documents: drafts only on insert; numbers immutable; issued content frozen; only drafts deleted', async () => {
    await rejects(
      db.as(u, `insert into public.documents (organization_id, id, type, status, number, contact_id, issue_date, currency, lines) values ($1, 'x_issued', 'invoice', 'issued', 'INV/X', 'con_cust', '2026-06-01', 'INR', $2)`, [A.org, LINES]),
      /start as drafts/,
    );
    await rejects(db.as(u, `update public.documents set number = 'INV/2026-27/9999' where organization_id = $1 and id = 'inv_1'`, [A.org]), /numbers cannot be changed/);
    await rejects(db.as(u, `update public.documents set lines = '[]' where organization_id = $1 and id = 'inv_1'`, [A.org]), /Only drafts can be edited/);
    await rejects(db.as(u, `delete from public.documents where organization_id = $1 and id = 'inv_1'`, [A.org]), /Only drafts can be deleted/);
    await rejects(db.as(u, `update public.documents set number = 'INV/2026-27/0001' where organization_id = $1 and id = 'inv_draft'`, [A.org]), /duplicate key/);
  });

  it('an invoice with payments cannot be voided until the payments are voided', async () => {
    await rejects(
      db.as(u, `update public.documents set status = 'void', void_reason = 'x', void_at = now() where organization_id = $1 and id = 'inv_1'`, [A.org]),
      /Void the payments/,
    );
  });
});

describe('quotation → invoice (atomic server functions)', () => {
  it('converts exactly once; a retry with the same id is harmless', async () => {
    await db.as(u, `insert into public.documents (organization_id, id, type, status, number, contact_id, issue_date, currency, lines)
                    values ($1, 'quo_1', 'quotation', 'draft', 'QUO/2026-27/0001', 'con_cust', '2026-06-01', 'INR', $2)`, [A.org, LINES]);
    await rejects(db.as(u, `select public.convert_quotation($1, 'quo_1', 'inv_from_q', '2026-06-05')`, [A.org]), /Only accepted/);
    await db.as(u, `update public.documents set status = 'accepted' where organization_id = $1 and id = 'quo_1'`, [A.org]);
    await rejects(db.as(u, `update public.documents set status = 'converted', converted_to_id = 'inv_1' where organization_id = $1 and id = 'quo_1'`, [A.org]), /Cannot change a quotation|Conversion links/);
    await db.as(u, `select public.convert_quotation($1, 'quo_1', 'inv_from_q', '2026-06-05')`, [A.org]);
    await db.as(u, `select public.convert_quotation($1, 'quo_1', 'inv_from_q', '2026-06-05')`, [A.org]); // retry
    await rejects(db.as(u, `select public.convert_quotation($1, 'quo_1', 'inv_other', '2026-06-05')`, [A.org]), /already been converted/);
    const rows = await db.as<{ id: string; status: string }>(u, `select id, status from public.documents where converted_from_id = 'quo_1'`);
    expect(rows).toEqual([{ id: 'inv_from_q', status: 'draft' }]);
  });

  it('deleting that draft invoice returns the quotation to accepted, so it can convert again', async () => {
    await rejects(db.as(u, `delete from public.documents where organization_id = $1 and id = 'inv_from_q'`, [A.org]), /delete_draft_document/);
    await db.as(u, `select public.delete_draft_document($1, 'inv_from_q')`, [A.org]);
    const [q] = await db.as<{ status: string; converted_to_id: string | null }>(u, `select status, converted_to_id from public.documents where id = 'quo_1'`);
    expect(q).toEqual({ status: 'accepted', converted_to_id: null });
    await db.as(u, `select public.convert_quotation($1, 'quo_1', 'inv_from_q2', '2026-06-06')`, [A.org]);
  });
});

describe('business settings and audit', () => {
  it('currency is locked once records exist', async () => {
    await rejects(db.as(u, `update public.business_settings set currency = 'USD' where organization_id = $1`, [A.org]), /currency cannot be changed/);
    await db.as(u, `update public.business_settings set address = 'Kochi' where organization_id = $1`, [A.org]);
  });

  it('every change is written to the audit log with the acting user', async () => {
    const rows = await db.as<{ action: string; actor: string }>(
      u, `select action, actor from public.audit_log where table_name = 'transactions' and row_id = 'pay_1' order by id`);
    expect(rows.map((r) => r.action)).toEqual(['insert', 'update']);
    expect(rows.every((r) => r.actor === A.uid)).toBe(true);
  });
});
