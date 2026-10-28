import { beforeAll, describe, expect, it } from 'vitest';
import { anon, rejects, service, TestDb, user } from './harness';
import { addMember, issuedInvoice, seedBasics, setupOrg, txnSql, type OrgFixture } from './fixtures';

let db: TestDb;
let A: OrgFixture;
let B: OrgFixture;

beforeAll(async () => {
  db = await TestDb.create();
  A = await setupOrg(db, 'alice@example.test');
  B = await setupOrg(db, 'bob@example.test');
  await seedBasics(db, A);
  await seedBasics(db, B);
  await issuedInvoice(db, A);
  await issuedInvoice(db, B);
  await db.as(user(A.uid), `insert into public.money_accounts (organization_id, id, name, kind, currency, opening_balance, opening_date)
    values ($1, 'acc_alice_only', 'Alice savings', 'bank', 'INR', 0, '2026-04-01')`, [A.org]);
});

describe('business creation and membership', () => {
  it('makes the creator the owner of exactly one business', async () => {
    const rows = await db.as(user(A.uid), `select organization_id, role from public.organization_members`);
    expect(rows).toEqual([{ organization_id: A.org, role: 'owner' }]);
  });

  it('refuses a second business, unverified e-mail and anonymous callers', async () => {
    await rejects(db.as(user(A.uid), `select public.create_organization('Second', '{}', '[]')`), /already have a business/);
    const unverified = await db.createUser('carol@example.test', { confirmed: false });
    await rejects(db.as(user(unverified), `select public.create_organization('Carol Co', '{}', '[]')`), /Verify your e-mail/);
    await rejects(db.as(anon, `select public.create_organization('Anon Co', '{}', '[]')`), /permission denied/);
  });

  it('does not let anyone add themselves to a business or promote themselves', async () => {
    await rejects(
      db.as(user(B.uid), `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')`, [A.org, B.uid]),
      /permission denied/,
    );
    const viewer = await addMember(db, A.org, 'viewer@example.test', 'viewer');
    await rejects(
      db.as(user(viewer), `update public.organization_members set role = 'owner' where user_id = $1`, [viewer]),
      /permission denied/,
    );
    await rejects(db.as(user(A.uid), `delete from public.organization_members where user_id = $1`, [viewer]), /permission denied/);
  });

  it('keeps entitlements and server settings out of client hands', async () => {
    await rejects(
      db.as(user(A.uid), `update public.entitlements set status = 'active', environment = 'production' where organization_id = $1`, [A.org]),
      /permission denied/,
    );
    await rejects(
      db.as(user(A.uid), `insert into public.entitlements (organization_id, status, environment, source) values ($1, 'active', 'test', 'development')`, [B.org]),
      /permission denied/,
    );
    await rejects(db.as(user(A.uid), `select * from public.app_settings`), /permission denied/);
    // Members can read their own entitlement (to show access state), not others'.
    const own = await db.as(user(A.uid), `select organization_id from public.entitlements`);
    expect(own).toEqual([{ organization_id: A.org }]);
  });

  it('a development grant can never be production access', async () => {
    await rejects(
      db.admin(`update public.entitlements set environment = 'production', verified_at = now() where organization_id = $1`, [A.org]),
      /check constraint/,
    );
  });
});

describe('cross-business isolation (two accounts, two businesses)', () => {
  const tables = ['contacts', 'money_accounts', 'documents', 'categories', 'business_settings', 'entitlements', 'audit_log'];

  it.each(tables)('Bob cannot read Alice\'s %s', async (table) => {
    const rows = await db.as<{ organization_id: string }>(user(B.uid), `select organization_id from public.${table}`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organization_id === B.org)).toBe(true);
  });

  it('Bob cannot see Alice\'s organization or members', async () => {
    expect(await db.as(user(B.uid), `select id from public.organizations where id = $1`, [A.org])).toEqual([]);
    expect(await db.as(user(B.uid), `select user_id from public.organization_members where organization_id = $1`, [A.org])).toEqual([]);
    expect(await db.as(user(B.uid), `select id from public.profiles where id = $1`, [A.uid])).toEqual([]);
  });

  it('Bob cannot insert records into Alice\'s business', async () => {
    await rejects(
      db.as(user(B.uid), `insert into public.contacts (organization_id, id, kind, name) values ($1, 'evil', 'customer', 'X')`, [A.org]),
      /row-level security/,
    );
    const t = txnSql({ organization_id: A.org, id: 'evil_txn', kind: 'income', date: '2026-06-01', amount: 1, currency: 'INR', account_id: 'acc_bank', description: 'x' });
    await rejects(db.as(user(B.uid), t.sql, t.params), /row-level security/);
  });

  it('Bob cannot modify or void Alice\'s records (no rows are visible to update)', async () => {
    const updated = await db.as(user(B.uid), `update public.contacts set name = 'hacked' where organization_id = $1 returning id`, [A.org]);
    expect(updated).toEqual([]);
    const voided = await db.as(
      user(B.uid),
      `update public.documents set status = 'void', void_reason = 'x', void_at = now() where organization_id = $1 returning id`,
      [A.org],
    );
    expect(voided).toEqual([]);
    const deleted = await db.as(user(B.uid), `delete from public.documents where organization_id = $1 returning id`, [A.org]);
    expect(deleted).toEqual([]);
    const renamed = await db.as(user(B.uid), `update public.organizations set name = 'Hacked' where id = $1 returning id`, [A.org]);
    expect(renamed).toEqual([]);
  });

  it('Bob cannot point his own records at Alice\'s accounts, contacts or invoices', async () => {
    // Composite foreign keys: references resolve only within the same business.
    const viaAccount = txnSql({
      organization_id: B.org, id: 'cross_acc', kind: 'income', date: '2026-06-15', amount: 100,
      currency: 'INR', account_id: 'acc_alice_only', description: 'x',
    });
    await rejects(db.as(user(B.uid), viaAccount.sql, viaAccount.params), /does not exist in this business|foreign key/);
    await db.as(user(A.uid), `insert into public.documents (organization_id, id, type, status, contact_id, issue_date, currency, lines)
      values ($1, 'inv_alice_only', 'invoice', 'draft', 'con_cust', '2026-06-10', 'INR', '[]')`, [A.org]);
    const viaInvoice = txnSql({
      organization_id: B.org, id: 'cross_doc', kind: 'payment_received', date: '2026-06-15', amount: 100,
      currency: 'INR', account_id: 'acc_bank', document_id: 'inv_alice_only', description: 'x',
    });
    await rejects(db.as(user(B.uid), viaInvoice.sql, viaInvoice.params), /does not exist in this business|foreign key/);
    const viaContact = await db.as(user(B.uid), `select count(*)::int as n from public.contacts where id = 'con_cust'`);
    expect(viaContact).toEqual([{ n: 1 }]); // only his own con_cust
  });

  it('Bob cannot run Alice\'s server functions', async () => {
    await rejects(db.as(user(B.uid), `select public.delete_draft_document($1, 'inv_1')`, [A.org]), /Not allowed/);
    await rejects(db.as(user(B.uid), `select public.convert_quotation($1, 'q', 'i', '2026-06-01')`, [A.org]), /Not allowed/);
    await rejects(db.as(user(B.uid), `select public.import_local_books($1, '{}', 'fingerprint-x', 'x')`, [A.org]), /Only an owner/);
  });

  it('records keep their business: organization_id and created_by cannot be rewritten', async () => {
    await rejects(
      db.as(user(A.uid), `update public.contacts set organization_id = $2 where organization_id = $1 and id = 'con_cust'`, [A.org, B.org]),
      /row-level security|moved to another business/,
    );
    await db.as(user(A.uid), `update public.contacts set name = 'Asha N', created_by = $2 where organization_id = $1 and id = 'con_cust'`, [A.org, B.uid]);
    const [row] = await db.as<{ created_by: string; updated_by: string }>(
      user(A.uid), `select created_by, updated_by from public.contacts where organization_id = $1 and id = 'con_cust'`, [A.org]);
    expect(row).toEqual({ created_by: A.uid, updated_by: A.uid });
    await rejects(db.as(user(A.uid), `update public.organizations set created_by = $2 where id = $1`, [A.org, B.uid]), /permission denied/);
  });
});

describe('anonymous access', () => {
  it.each(['contacts', 'transactions', 'documents', 'organizations', 'profiles', 'entitlements'])('anon cannot read %s', async (table) => {
    await rejects(db.as(anon, `select * from public.${table}`), /permission denied/);
  });
});

describe('roles', () => {
  it('viewers read but cannot write; staff write but cannot void', async () => {
    const viewer = await addMember(db, A.org, 'viewer2@example.test', 'viewer');
    const staff = await addMember(db, A.org, 'staff@example.test', 'staff');
    expect((await db.as(user(viewer), `select id from public.contacts`)).length).toBeGreaterThan(0);
    await rejects(
      db.as(user(viewer), `insert into public.contacts (organization_id, id, kind, name) values ($1, 'v1', 'customer', 'V')`, [A.org]),
      /row-level security/,
    );
    await db.as(user(staff), `insert into public.contacts (organization_id, id, kind, name) values ($1, 's1', 'customer', 'S')`, [A.org]);
    const t = txnSql({ organization_id: A.org, id: 'staff_txn', kind: 'income', date: '2026-06-01', amount: 500, currency: 'INR', account_id: 'acc_bank', description: 'sale', category_id: 'inc_sales' });
    await db.as(user(staff), t.sql, t.params);
    await rejects(
      db.as(user(staff), `update public.transactions set status = 'void', void_reason = 'x', void_at = now() where organization_id = $1 and id = 'staff_txn'`, [A.org]),
      /cannot void/,
    );
  });
});

describe('server-side entitlement (no trust in client state or clock)', () => {
  it('without access a member can read but not write', async () => {
    const C = await setupOrg(db, 'nopay@example.test', { access: false });
    const [ent] = await db.as<{ status: string }>(user(C.uid), `select status from public.entitlements`);
    expect(ent!.status).toBe('none');
    await rejects(
      db.as(user(C.uid), `insert into public.contacts (organization_id, id, kind, name) values ($1, 'c', 'customer', 'C')`, [C.org]),
      /row-level security/,
    );
  });

  it('expired access stops writes, judged by the server clock', async () => {
    const D = await setupOrg(db, 'expired@example.test');
    await db.admin(`update public.entitlements set access_ends_at = current_date - 2 where organization_id = $1`, [D.org]);
    await rejects(
      db.as(user(D.uid), `insert into public.contacts (organization_id, id, kind, name) values ($1, 'c', 'customer', 'C')`, [D.org]),
      /row-level security/,
    );
  });

  it('a server-configured development grant gives clearly-labelled test access', async () => {
    await db.admin(`insert into public.app_settings (key, value) values ('dev_test_access_days', '30')`);
    const E = await setupOrg(db, 'devgrant@example.test', { access: false });
    const [ent] = await db.as<Record<string, unknown>>(user(E.uid), `select status, environment, source, note from public.entitlements`);
    expect(ent).toMatchObject({ status: 'complimentary', environment: 'test', source: 'development' });
    await db.as(user(E.uid), `insert into public.contacts (organization_id, id, kind, name) values ($1, 'c', 'customer', 'C')`, [E.org]);
    await db.admin(`delete from public.app_settings where key = 'dev_test_access_days'`);
  });
});

describe('private storage', () => {
  it('members can store and read files only under their own business folder', async () => {
    await db.as(user(A.uid), `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${A.org}/r1.jpg`]);
    expect(await db.as(user(A.uid), `select name from storage.objects where bucket_id = 'receipts'`)).toHaveLength(1);
    expect(await db.as(user(B.uid), `select name from storage.objects where bucket_id = 'receipts'`)).toEqual([]);
    await rejects(
      db.as(user(B.uid), `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${A.org}/planted.jpg`]),
      /row-level security/,
    );
    await rejects(
      db.as(user(A.uid), `insert into storage.objects (bucket_id, name) values ('receipts', 'not-a-uuid/x.jpg')`),
      /row-level security/,
    );
  });

  it('all Linqora Books buckets are private', async () => {
    const rows = await db.admin<{ id: string; public: boolean }>(`select id, public from storage.buckets order by id`);
    expect(rows).toEqual([
      { id: 'attachments', public: false },
      { id: 'business-logos', public: false },
      { id: 'receipts', public: false },
    ]);
  });
});

describe('service role', () => {
  it('is the only role that writes entitlements (used by the backend / admin tools)', async () => {
    await db.as(service, `update public.entitlements set note = 'reviewed' where organization_id = $1`, [B.org]);
    const [row] = await db.admin<{ note: string }>(`select note from public.entitlements where organization_id = $1`, [B.org]);
    expect(row!.note).toBe('reviewed');
  });
});
