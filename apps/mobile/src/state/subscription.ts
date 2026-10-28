import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  buildTrialTerms,
  NO_ENTITLEMENT,
  priceFor,
  TestModeBillingProvider,
  type BillingProvider,
  type BillingInterval,
  type Entitlement,
} from '@linqora-books/billing';
import type { ISODate } from '@linqora-books/accounting-core';
import { BILLING_MODE } from '@/config/env';

/**
 * Subscription state for the PROTOTYPE. Entitlements here always come from the
 * TEST MODE provider (environment "test") and are never production access.
 * In Phase 5 this store will only cache what the backend reports.
 */
const testProvider = new TestModeBillingProvider();
export const billingProvider: BillingProvider = testProvider;

interface SubscriptionState {
  entitlement: Entitlement;
  /** The user has seen the subscription intro (and may have skipped it). */
  introSeen: boolean;
  markIntroSeen(): void;
  startTestTrial(interval: BillingInterval, today: ISODate): Promise<void>;
  cancel(today: ISODate): Promise<void>;
  resume(today: ISODate): Promise<void>;
  simulateExpiry(today: ISODate): void;
  reset(): void;
}

export const useSubscription = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      entitlement: NO_ENTITLEMENT,
      introSeen: false,
      markIntroSeen: () => set({ introSeen: true }),
      async startTestTrial(interval, today) {
        if (BILLING_MODE !== 'test') throw new Error('Billing is not available in this build.');
        if (get().entitlement.trialStartedAt) throw new Error('A trial has already been used on this account.');
        const terms = buildTrialTerms(priceFor(interval), today);
        set({ entitlement: await billingProvider.startTrial(interval, terms), introSeen: true });
      },
      async cancel(today) {
        set({ entitlement: await billingProvider.cancel(get().entitlement, today) });
      },
      async resume(today) {
        set({ entitlement: await billingProvider.resume(get().entitlement, today) });
      },
      simulateExpiry(today) {
        set({ entitlement: testProvider.simulateExpiry(get().entitlement, today) });
      },
      reset: () => set({ entitlement: NO_ENTITLEMENT, introSeen: false }),
    }),
    { name: 'linqora-books:subscription-test:v1', storage: createJSONStorage(() => localStorage) },
  ),
);
