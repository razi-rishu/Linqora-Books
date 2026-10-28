import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import {
  todayInTimeZone,
  type Actor,
  type BooksData,
  type BusinessDocument,
  type BusinessProfile,
  type Contact,
  type ISODate,
  type MoneyAccount,
  type Project,
  type Transaction,
} from '@linqora-books/accounting-core';
import { evaluateAccess, NO_ENTITLEMENT, type AccessDecision, type Entitlement } from '@linqora-books/billing';
import { CloudBooksRepository, CloudError } from '@linqora-books/cloud';
import type { BooksRepository } from './repository';
import { useSubscription } from '@/state/subscription';
import { useCurrentUser } from '@/auth/auth-store';
import { nowISO } from '@/lib/utils';

export const RepositoryContext = createContext<BooksRepository | null>(null);

export function useRepository(): BooksRepository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('RepositoryContext missing');
  return repo;
}

/** Cached data is keyed to the signed-in user, so switching accounts never shows the previous books. */
export function booksKey(userId: string | undefined) {
  return ['books', userId ?? 'anonymous'] as const;
}

export function useBooksQuery() {
  const repo = useRepository();
  const user = useCurrentUser();
  return useQuery({ queryKey: booksKey(user?.id), queryFn: () => repo.load() });
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

/**
 * Cloud: the entitlement the SERVER holds (read-only for the app; the database also
 * enforces it on every write). Local preview: the on-device TEST MODE entitlement.
 */
export function useEntitlement(): { entitlement: Entitlement; source: 'server' | 'local-test' } {
  const repo = useRepository();
  const user = useCurrentUser();
  const local = useSubscription((s) => s.entitlement);
  const isCloud = repo instanceof CloudBooksRepository;
  const { data } = useQuery({
    queryKey: ['entitlement', user?.id ?? 'anonymous'],
    queryFn: () => (repo as CloudBooksRepository).loadEntitlement(),
    enabled: isCloud,
  });
  return isCloud ? { entitlement: data ?? NO_ENTITLEMENT, source: 'server' } : { entitlement: local, source: 'local-test' };
}

export function useAccess(): AccessDecision {
  const { entitlement } = useEntitlement();
  return evaluateAccess(entitlement, useToday());
}

/** The user ID and timestamp to stamp on changes (the server stamps its own in cloud mode). */
export function useActor() {
  const user = useCurrentUser();
  return (): Actor => ({ userId: user?.id ?? 'unknown', now: nowISO() });
}

/** Last failed save, shown by <SaveErrorToast>. Never cleared by a "success" that did not happen. */
export const useSaveError = create<{ message: string | null; set(message: string | null): void }>()((set) => ({
  message: null,
  set: (message) => set({ message }),
}));

export function describeSaveError(error: unknown): string {
  if (error instanceof CloudError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Could not save. Please try again.';
}

type Mutation =
  | { type: 'business'; business: BusinessProfile; seed?: Partial<Omit<BooksData, 'business'>> }
  | { type: 'contact'; contact: Contact }
  | { type: 'account'; account: MoneyAccount }
  | { type: 'project'; project: Project }
  | { type: 'transaction'; transaction: Transaction }
  | { type: 'documents'; documents: BusinessDocument[] }
  | { type: 'deleteDraft'; id: string; actor: Actor }
  | { type: 'removeSample' }
  | { type: 'clear' };

/** `silent`: the screen shows this save's error itself, so the global "Not saved" toast stays quiet. */
type MutationInput = Mutation & { silent?: boolean };

/** Single mutation entry point; every write refreshes the cached snapshot. */
export function useBooksMutation() {
  const repo = useRepository();
  const client = useQueryClient();
  const setError = useSaveError((s) => s.set);
  return useMutation({
    mutationFn: async (m: MutationInput) => {
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
          return repo.deleteDraftDocument(m.id, m.actor);
        case 'removeSample':
          return repo.removeSampleData();
        case 'clear':
          return repo.clear();
      }
    },
    onMutate: () => setError(null),
    onError: (error, vars) => {
      if (!vars.silent) setError(describeSaveError(error));
    },
    // refetchType "all": screens that mount next (e.g. the app shell after setup)
    // must never see the pre-mutation snapshot.
    onSettled: () => client.invalidateQueries({ queryKey: ['books'], refetchType: 'all' }),
  });
}

export function hasSampleData(data: BooksData): boolean {
  return [data.contacts, data.accounts, data.transactions, data.documents, data.projects].some((list) =>
    list.some((x) => x.origin === 'sample'),
  );
}
