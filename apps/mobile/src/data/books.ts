import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  todayInTimeZone,
  type BooksData,
  type BusinessDocument,
  type BusinessProfile,
  type Contact,
  type ISODate,
  type MoneyAccount,
  type Project,
  type Transaction,
} from '@linqora-books/accounting-core';
import { evaluateAccess, type AccessDecision } from '@linqora-books/billing';
import type { BooksRepository } from './repository';
import { useSession } from '@/state/session';
import { useSubscription } from '@/state/subscription';
import { nowISO } from '@/lib/utils';

export const RepositoryContext = createContext<BooksRepository | null>(null);

export function useRepository(): BooksRepository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('RepositoryContext missing');
  return repo;
}

const BOOKS_KEY = ['books'] as const;

export function useBooksQuery() {
  const repo = useRepository();
  return useQuery({ queryKey: BOOKS_KEY, queryFn: () => repo.load() });
}

/** Loaded books for screens inside the app shell (the shell guarantees setup is done). */
export function useBooks(): BooksData {
  const { data } = useBooksQuery();
  if (!data) throw new Error('Books not loaded');
  return data;
}

export function useToday(): ISODate {
  const { data } = useBooksQuery();
  return todayInTimeZone(data?.business.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function useAccess(): AccessDecision {
  const entitlement = useSubscription((s) => s.entitlement);
  return evaluateAccess(entitlement, useToday());
}

/** The user ID and timestamp to stamp on changes. */
export function useActor() {
  const user = useSession((s) => s.user);
  return () => ({ userId: user?.id ?? 'unknown', now: nowISO() });
}

type Mutation =
  | { type: 'business'; business: BusinessProfile; seed?: Partial<Omit<BooksData, 'business'>> }
  | { type: 'contact'; contact: Contact }
  | { type: 'account'; account: MoneyAccount }
  | { type: 'project'; project: Project }
  | { type: 'transaction'; transaction: Transaction }
  | { type: 'documents'; documents: BusinessDocument[] }
  | { type: 'deleteDraft'; id: string }
  | { type: 'removeSample' }
  | { type: 'clear' };

/** Single mutation entry point; every write refreshes the cached snapshot. */
export function useBooksMutation() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (m: Mutation) => {
      switch (m.type) {
        case 'business':
          return repo.saveBusiness(m.business, m.seed);
        case 'contact':
          return repo.saveContact(m.contact);
        case 'account':
          return repo.saveAccount(m.account);
        case 'project':
          return repo.saveProject(m.project);
        case 'transaction':
          return repo.saveTransaction(m.transaction);
        case 'documents':
          return repo.saveDocuments(m.documents);
        case 'deleteDraft':
          return repo.deleteDraftDocument(m.id);
        case 'removeSample':
          return repo.removeSampleData();
        case 'clear':
          return repo.clear();
      }
    },
    // refetchType "all": screens that mount next (e.g. the app shell after setup)
    // must never see the pre-mutation snapshot.
    onSettled: () => client.invalidateQueries({ queryKey: BOOKS_KEY, refetchType: 'all' }),
  });
}

export function hasSampleData(data: BooksData): boolean {
  return [data.contacts, data.accounts, data.transactions, data.documents, data.projects].some((list) =>
    list.some((x) => x.origin === 'sample'),
  );
}
