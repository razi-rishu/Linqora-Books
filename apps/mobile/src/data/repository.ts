import type {
  Actor,
  BooksData,
  BusinessDocument,
  BusinessProfile,
  Contact,
  MoneyAccount,
  Project,
  Transaction,
} from '@linqora-books/accounting-core';

/**
 * Data access boundary for the app. Screens never touch storage directly.
 *
 * Phase 1: LocalBooksRepository (this device only, localStorage).
 * Phase 2+: a Supabase/API implementation of the same interface, scoped to the
 * signed-in user's organization and protected by Row Level Security.
 */
export interface BooksRepository {
  readonly kind: 'local-device' | 'cloud';
  load(): Promise<BooksData | null>;
  saveBusiness(business: BusinessProfile, seed?: Partial<Omit<BooksData, 'business'>>): Promise<void>;
  saveContact(contact: Contact): Promise<void>;
  saveAccount(account: MoneyAccount): Promise<void>;
  saveProject(project: Project): Promise<void>;
  saveTransaction(transaction: Transaction): Promise<void>;
  /** Saves several documents atomically (e.g. quotation + new invoice on conversion). */
  saveDocuments(documents: BusinessDocument[]): Promise<void>;
  /**
   * Only draft documents may be deleted; finalised ones must be voided. Deleting the
   * draft invoice of a quotation conversion returns that quotation to "accepted".
   */
  deleteDraftDocument(id: string, actor: Actor): Promise<void>;
  /** Removes all records with origin "sample". */
  removeSampleData(): Promise<void>;
  /** Wipes this device's local data. */
  clear(): Promise<void>;
}

export class RepositoryError extends Error {
  override name = 'RepositoryError';
}
