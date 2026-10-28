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
 * Implementations:
 * - LocalBooksRepository (apps/mobile): this device only — local preview mode.
 * - CloudBooksRepository (this package): Supabase, scoped to the signed-in user's
 *   business and protected by Row Level Security and database triggers.
 */
export interface BooksRepository {
  readonly kind: 'local-device' | 'cloud';
  load(): Promise<BooksData | null>;
  /** Creates the business on first call (cloud: create_organization), updates it afterwards. */
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
  /** Removes all records with origin "sample" (local preview only). */
  removeSampleData(): Promise<void>;
  /** Wipes this device's local data (local preview only). */
  clear(): Promise<void>;
}

export class RepositoryError extends Error {
  override name = 'RepositoryError';
}
