/**
 * The repository contract lives in @linqora-books/cloud so the database tests can
 * run the cloud implementation against the real schema. Re-exported here for the app.
 */
export type { BooksRepository } from '@linqora-books/cloud';
export { RepositoryError } from '@linqora-books/cloud';
