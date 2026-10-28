/**
 * Plans a controlled import of Phase 1 local records (this device) into a cloud
 * business. Nothing is uploaded here: the plan is shown to the user for review,
 * then sent to import_local_books() which applies it atomically.
 *
 * Rules (docs/DATA_MIGRATION.md):
 * - Sample records are never uploaded.
 * - A record whose ESSENTIAL link (account, invoice/bill, advance, document contact)
 *   points at something that will not exist in the cloud is rejected, with a reason.
 * - OPTIONAL links (a transaction's contact or project, a project's customer, a
 *   document's project) to unavailable records are dropped, with a note.
 * - Every transaction is re-validated with the same rules the server enforces, in
 *   dependency order, so one bad record is rejected on its own instead of failing
 *   the whole import.
 * - Records keep their local ids, so importing the same data twice cannot duplicate
 *   it; the fingerprint lets the server refuse a repeated import outright.
 */
import {
  validateTransaction,
  validateTransactionInBooks,
  type BooksData,
  type BusinessDocument,
  type Category,
  type Contact,
  type ISODate,
  type MoneyAccount,
  type Project,
  type Transaction,
} from '@linqora-books/accounting-core';
import { accountToRow, categoryToRow, contactToRow, documentToRow, projectToRow, transactionToRow } from './mappers';

export type ImportKind = 'contact' | 'account' | 'project' | 'document' | 'transaction';

export interface ImportItem {
  kind: ImportKind;
  id: string;
  label: string;
}

export interface RejectedItem extends ImportItem {
  reason: string;
}

export interface LocalImportPlan {
  fingerprint: string;
  sourceBusinessName: string;
  importable: ImportItem[];
  rejected: RejectedItem[];
  notes: string[];
  excludedSampleCount: number;
  /** Rows in database shape, keyed by table, ready for import_local_books(). */
  payload: Record<'categories' | 'contacts' | 'money_accounts' | 'projects' | 'documents' | 'transactions', Record<string, unknown>[]>;
}

const SOURCE = 'linqora-books-local';

function withSource<T extends { id: string; createdAt: string; origin: string; externalRef?: unknown }>(record: T, localBusinessId: string): T {
  return {
    ...record,
    origin: record.origin === 'integration' ? 'integration' : 'user',
    externalRef: { connectionId: localBusinessId, system: SOURCE, externalId: record.id, externalVersion: record.createdAt },
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function label(kind: ImportKind, r: { id: string } & Partial<Record<'name' | 'description' | 'number' | 'type', string>>): string {
  if (kind === 'document') return `${r.type ?? 'document'} ${r.number ?? '(draft)'}`;
  return r.name ?? r.description ?? r.id;
}

/**
 * @param local  the Phase 1 snapshot from this device
 * @param cloud  the signed-in user's cloud business (records already there are kept as is)
 * @param today  today in the cloud business's time zone
 */
export async function planLocalImport(local: BooksData, cloud: BooksData, today: ISODate): Promise<LocalImportPlan> {
  const org = cloud.business.id;
  const rejected: RejectedItem[] = [];
  const notes: string[] = [];
  const reject = (kind: ImportKind, r: { id: string }, reason: string) => rejected.push({ kind, id: r.id, label: label(kind, r as never), reason });

  const isSample = (x: { origin: string }) => x.origin === 'sample';
  const all = [...local.contacts, ...local.accounts, ...local.projects, ...local.documents, ...local.transactions];
  const excludedSampleCount = all.filter(isSample).length;

  // Records that will exist in the cloud after the import (existing + accepted so far).
  const available = {
    contacts: new Set(cloud.contacts.map((c) => c.id)),
    accounts: new Set(cloud.accounts.map((a) => a.id)),
    projects: new Set(cloud.projects.map((p) => p.id)),
    documents: new Set(cloud.documents.map((d) => d.id)),
    transactions: new Set(cloud.transactions.map((t) => t.id)),
    categories: new Set(cloud.categories.map((c) => c.id)),
  };
  const sampleIds = new Set(all.filter(isSample).map((x) => x.id));
  const why = (id: string) => (sampleIds.has(id) ? `uses sample record "${id}", which is not uploaded` : `uses "${id}", which is not being imported`);

  const currencyOk = local.business.currency === cloud.business.currency;
  if (!currencyOk) {
    notes.push(`Your local books are in ${local.business.currency} but this business uses ${cloud.business.currency}. Amounts are never converted, so nothing can be imported.`);
  }

  // Categories: add local ones the cloud business does not have.
  const categories: Category[] = local.categories.filter((c) => !available.categories.has(c.id));
  categories.forEach((c) => available.categories.add(c.id));

  // Contacts
  const contacts: Contact[] = [];
  for (const c of local.contacts.filter((x) => !isSample(x))) {
    if (!currencyOk) reject('contact', c, 'currency differs');
    else if (available.contacts.has(c.id)) notes.push(`${c.name} is already in the cloud and was left unchanged.`);
    else {
      contacts.push(withSource(c, local.business.id));
      available.contacts.add(c.id);
    }
  }

  // Accounts
  const accounts: MoneyAccount[] = [];
  for (const a of local.accounts.filter((x) => !isSample(x))) {
    if (!currencyOk || a.currency !== cloud.business.currency) reject('account', a, 'currency differs from this business');
    else if (a.openingDate > today) reject('account', a, 'opening date is in the future');
    else if (available.accounts.has(a.id)) notes.push(`Account ${a.name} is already in the cloud and was left unchanged.`);
    else {
      accounts.push(withSource(a, local.business.id));
      available.accounts.add(a.id);
    }
  }

  // Projects (customer link optional)
  const projects: Project[] = [];
  for (const p of local.projects.filter((x) => !isSample(x))) {
    if (!currencyOk) {
      reject('project', p, 'currency differs');
      continue;
    }
    if (available.projects.has(p.id)) continue;
    let next: Project = withSource(p, local.business.id);
    if (p.customerId && !available.contacts.has(p.customerId)) {
      const { customerId: _dropped, ...rest } = next;
      void _dropped;
      next = rest;
      notes.push(`Project "${p.name}": customer link removed (${why(p.customerId)}).`);
    }
    projects.push(next);
    available.projects.add(p.id);
  }

  // Documents (contact essential; project/category optional; conversion links only if both sides import)
  const documents: BusinessDocument[] = [];
  const candidateDocs = local.documents.filter((x) => !isSample(x));
  for (const d of candidateDocs) {
    if (!currencyOk) {
      reject('document', d, 'currency differs');
      continue;
    }
    if (available.documents.has(d.id)) continue;
    if (!available.contacts.has(d.contactId)) {
      reject('document', d, why(d.contactId));
      continue;
    }
    if (d.number && cloud.documents.some((x) => x.type === d.type && x.number === d.number)) {
      reject('document', d, `number ${d.number} is already used in this business`);
      continue;
    }
    let next: BusinessDocument = withSource(d, local.business.id);
    if (d.projectId && !available.projects.has(d.projectId)) {
      const { projectId: _p, ...rest } = next;
      void _p;
      next = rest;
      notes.push(`${label('document', d)}: project link removed (${why(d.projectId)}).`);
    }
    if (d.categoryId && !available.categories.has(d.categoryId)) {
      const { categoryId: _c, ...rest } = next;
      void _c;
      next = rest;
    }
    documents.push(next);
    available.documents.add(d.id);
  }
  // Conversion links survive only when both quotation and invoice are imported.
  for (let i = 0; i < documents.length; i++) {
    const d = documents[i]!;
    if (d.convertedToId && !available.documents.has(d.convertedToId)) {
      const { convertedToId: _t, ...rest } = d;
      void _t;
      documents[i] = { ...rest, status: 'accepted' };
      notes.push(`${label('document', d)}: its invoice is not being imported, so it returns to "accepted".`);
    }
    if (d.convertedFromId && !available.documents.has(d.convertedFromId)) {
      const { convertedFromId: _f, ...rest } = documents[i]!;
      void _f;
      documents[i] = rest;
    }
  }

  // Transactions: dependency order, each validated against everything accepted so far.
  const transactions: Transaction[] = [];
  const order = (t: Transaction) => (t.kind === 'advance_applied' || t.kind === 'advance_refunded' ? 1 : 0);
  const candidateTxns = local.transactions
    .filter((x) => !isSample(x))
    .sort((a, b) => order(a) - order(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const t of candidateTxns) {
    if (!currencyOk) {
      reject('transaction', t, 'currency differs');
      continue;
    }
    if (available.transactions.has(t.id)) continue;
    const essential = [
      ['account', t.accountId, available.accounts],
      ['account', t.toAccountId, available.accounts],
      ['document', t.documentId, available.documents],
      ['advance', t.advanceId, available.transactions],
    ] as const;
    const missing = essential.find(([, id, set]) => id && !set.has(id));
    if (missing) {
      reject('transaction', t, why(missing[1]!));
      continue;
    }
    let next: Transaction = withSource(t, local.business.id);
    for (const key of ['contactId', 'projectId', 'categoryId'] as const) {
      const id = next[key];
      const set = key === 'contactId' ? available.contacts : key === 'projectId' ? available.projects : available.categories;
      if (id && !set.has(id)) {
        const copy = { ...next };
        delete copy[key];
        next = copy;
        if (key !== 'categoryId') notes.push(`"${t.description}": ${key === 'contactId' ? 'contact' : 'project'} link removed (${why(id)}).`);
      }
    }
    if (next.status === 'posted') {
      const books = {
        business: cloud.business,
        contacts: [...cloud.contacts, ...contacts],
        accounts: [...cloud.accounts, ...accounts],
        documents: [...cloud.documents, ...documents],
        transactions: [...cloud.transactions, ...transactions],
      };
      const errors = [...validateTransaction(next), ...validateTransactionInBooks(next, books, today)];
      if (errors.length) {
        reject('transaction', t, errors.join(' '));
        continue;
      }
    }
    transactions.push(next);
    available.transactions.add(t.id);
  }

  const importable: ImportItem[] = [
    ...contacts.map((c) => ({ kind: 'contact' as const, id: c.id, label: c.name })),
    ...accounts.map((a) => ({ kind: 'account' as const, id: a.id, label: a.name })),
    ...projects.map((p) => ({ kind: 'project' as const, id: p.id, label: p.name })),
    ...documents.map((d) => ({ kind: 'document' as const, id: d.id, label: label('document', d) })),
    ...transactions.map((t) => ({ kind: 'transaction' as const, id: t.id, label: t.description })),
  ];

  const fingerprint = (
    await sha256Hex(`${local.business.id}|${importable.map((i) => `${i.kind}:${i.id}`).sort().join(',')}`)
  ).slice(0, 40);

  return {
    fingerprint,
    sourceBusinessName: local.business.name,
    importable,
    rejected,
    notes: [...new Set(notes)],
    excludedSampleCount,
    payload: {
      categories: categories.map((c) => categoryToRow(c, org)),
      contacts: contacts.map((c) => contactToRow(c, org)),
      money_accounts: accounts.map((a) => accountToRow(a, org)),
      projects: projects.map((p) => projectToRow(p, org)),
      documents: documents.map((d) => documentToRow(d, org)),
      transactions: transactions.map((t) => transactionToRow(t, org)),
    },
  };
}

/** Local records that are not samples (what the user created on this device). */
export function countUserRecords(local: BooksData | null): number {
  if (!local) return 0;
  return [...local.contacts, ...local.accounts, ...local.projects, ...local.documents, ...local.transactions].filter(
    (x) => x.origin !== 'sample',
  ).length;
}
