import { defaultCategories } from '@linqora-books/accounting-core';
import { TestDb, user } from './harness';

export interface OrgFixture {
  uid: string;
  org: string;
}

/** Signs up a verified user, creates their business and (optionally) grants test access. */
export async function setupOrg(db: TestDb, email: string, { access = true } = {}): Promise<OrgFixture> {
  const uid = await db.createUser(email, { name: email.split('@')[0]! });
  const [row] = await db.as<{ org: string }>(user(uid), `select public.create_organization($1, $2, $3) as org`, [
    `Business of ${email}`,
    JSON.stringify({ category: 'events', currency: 'INR', financialYearStartMonth: 4, timeZone: 'Asia/Kolkata' }),
    JSON.stringify(defaultCategories('events')),
  ]);
  const org = row!.org;
  if (access) await grantAccess(db, org);
  return { uid, org };
}

/** What an administrator (service role) does to grant complimentary access. */
export async function grantAccess(db: TestDb, org: string): Promise<void> {
  await db.admin(
    `update public.entitlements set status = 'complimentary', access_ends_at = null, note = 'test' where organization_id = $1`,
    [org],
  );
}

/** Adds another member directly (Phase 2 has no invitation flow yet). */
export async function addMember(db: TestDb, org: string, email: string, role: string): Promise<string> {
  const uid = await db.createUser(email);
  await db.admin(`insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)`, [org, uid, role]);
  return uid;
}

/** A customer, a supplier and a bank account opened on 1 Apr 2026. */
export async function seedBasics(db: TestDb, f: OrgFixture): Promise<void> {
  const u = user(f.uid);
  await db.as(u, `insert into public.contacts (organization_id, id, kind, name) values ($1, 'con_cust', 'customer', 'Asha'), ($1, 'con_supp', 'supplier', 'Supplies Co')`, [f.org]);
  await db.as(
    u,
    `insert into public.money_accounts (organization_id, id, name, kind, currency, opening_balance, opening_date)
     values ($1, 'acc_bank', 'Bank', 'bank', 'INR', 100000, '2026-04-01'), ($1, 'acc_cash', 'Cash', 'cash', 'INR', 0, '2026-04-01')`,
    [f.org],
  );
}

export const LINES = JSON.stringify([{ id: 'l1', description: 'Work', quantity: '1', unitPrice: 100000, taxRateBps: 1800 }]); // total 118000

/** Draft → issued invoice dated 10 Jun 2026. */
export async function issuedInvoice(db: TestDb, f: OrgFixture, id = 'inv_1', number = 'INV/2026-27/0001'): Promise<void> {
  const u = user(f.uid);
  await db.as(
    u,
    `insert into public.documents (organization_id, id, type, status, contact_id, issue_date, currency, lines)
     values ($1, $2, 'invoice', 'draft', 'con_cust', '2026-06-10', 'INR', $3)`,
    [f.org, id, LINES],
  );
  await db.as(u, `update public.documents set status = 'issued', number = $3 where organization_id = $1 and id = $2`, [f.org, id, number]);
}

export function txnSql(cols: Record<string, unknown>): { sql: string; params: unknown[] } {
  const keys = Object.keys(cols);
  return {
    sql: `insert into public.transactions (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
    params: Object.values(cols),
  };
}
