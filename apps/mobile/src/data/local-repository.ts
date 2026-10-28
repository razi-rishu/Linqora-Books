import type { Actor, BooksData, BusinessDocument, Transaction } from '@linqora-books/accounting-core';
import { isCurrencyLocked, releaseConvertedQuotation, validateTransaction } from '@linqora-books/accounting-core';
import { RepositoryError, type BooksRepository } from './repository';

const STORAGE_KEY = 'linqora-books:data:v1';

type Collection = 'contacts' | 'accounts' | 'projects' | 'transactions' | 'documents';

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

/**
 * Stores everything on this device as one JSON document. Each save rewrites the
 * whole snapshot, so a write either fully happens or not at all.
 *
 * This is a prototype store: no encryption at rest, no cloud backup, no sync.
 */
export class LocalBooksRepository implements BooksRepository {
  readonly kind = 'local-device' as const;

  constructor(private readonly storage: Storage = window.localStorage) {}

  private read(): BooksData | null {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BooksData;
    } catch {
      throw new RepositoryError('Local data is corrupted and could not be read.');
    }
  }

  private write(data: BooksData): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private mutate(fn: (data: BooksData) => BooksData): void {
    const data = this.read();
    if (!data) throw new RepositoryError('Set up your business first.');
    this.write(fn(data));
  }

  private save<K extends Collection>(collection: K, item: BooksData[K][number]): Promise<void> {
    this.mutate((data) => ({ ...data, [collection]: upsert(data[collection] as { id: string }[], item) }));
    return Promise.resolve();
  }

  async load(): Promise<BooksData | null> {
    return this.read();
  }

  async saveBusiness(business: BooksData['business'], seed: Partial<Omit<BooksData, 'business'>> = {}): Promise<void> {
    const existing = this.read();
    if (existing && existing.business.currency !== business.currency && isCurrencyLocked(existing)) {
      throw new RepositoryError('The currency cannot be changed once accounts, projects or records exist.');
    }
    this.write({
      contacts: [],
      accounts: [],
      transactions: [],
      documents: [],
      projects: [],
      categories: [],
      ...existing,
      ...seed,
      business,
    });
  }

  saveContact(contact: BooksData['contacts'][number]) {
    return this.save('contacts', contact);
  }

  saveAccount(account: BooksData['accounts'][number]) {
    return this.save('accounts', account);
  }

  saveProject(project: BooksData['projects'][number]) {
    return this.save('projects', project);
  }

  async saveTransaction(transaction: Transaction): Promise<void> {
    const errors = validateTransaction(transaction);
    if (errors.length) throw new RepositoryError(errors.join('. '));
    const existing = this.read()?.transactions.find((t) => t.id === transaction.id);
    if (existing?.status === 'void') throw new RepositoryError('Void transactions cannot be changed.');
    return this.save('transactions', transaction);
  }

  async saveDocuments(documents: BusinessDocument[]): Promise<void> {
    this.mutate((data) => {
      let list = data.documents;
      for (const doc of documents) {
        const previous = list.find((d) => d.id === doc.id);
        if (previous?.number && doc.number !== previous.number) {
          throw new RepositoryError('Document numbers cannot be changed once assigned.');
        }
        if (previous?.status === 'void') throw new RepositoryError('Void documents cannot be changed.');
        if (doc.convertedFromId && list.some((d) => d.id !== doc.id && d.convertedFromId === doc.convertedFromId)) {
          throw new RepositoryError('An invoice has already been created from this quotation.');
        }
        list = upsert(list, doc);
      }
      return { ...data, documents: list };
    });
  }

  async deleteDraftDocument(id: string, actor: Actor): Promise<void> {
    this.mutate((data) => {
      const doc = data.documents.find((d) => d.id === id);
      if (!doc) return data;
      if (doc.status !== 'draft') throw new RepositoryError('Only drafts can be deleted. Void finalised documents instead.');
      // Deleting the draft invoice of a conversion hands the quotation back (same write).
      const documents = data.documents
        .filter((d) => d.id !== id)
        .map((d) => (d.id === doc.convertedFromId && d.convertedToId === doc.id ? releaseConvertedQuotation(d, doc, actor) : d));
      return { ...data, documents };
    });
  }

  async removeSampleData(): Promise<void> {
    const current = this.read();
    if (current) {
      const sampleIds = new Set(
        [...current.contacts, ...current.accounts, ...current.projects, ...current.documents]
          .filter((x) => x.origin === 'sample')
          .map((x) => x.id),
      );
      const ownRefs = [...current.transactions, ...current.documents, ...current.projects]
        .filter((x) => x.origin !== 'sample')
        .flatMap((x) => Object.values(x).filter((v): v is string => typeof v === 'string'));
      if (ownRefs.some((ref) => sampleIds.has(ref))) {
        throw new RepositoryError(
          'Some of your own records use a sample customer, account, project or document. Change or void them first.',
        );
      }
    }
    this.mutate((data) => ({
      ...data,
      contacts: data.contacts.filter((x) => x.origin !== 'sample'),
      accounts: data.accounts.filter((x) => x.origin !== 'sample'),
      projects: data.projects.filter((x) => x.origin !== 'sample'),
      transactions: data.transactions.filter((x) => x.origin !== 'sample'),
      documents: data.documents.filter((x) => x.origin !== 'sample'),
    }));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(STORAGE_KEY);
  }
}
