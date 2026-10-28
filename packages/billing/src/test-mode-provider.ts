import type { ISODate } from '@linqora-books/accounting-core';
import { addDays } from '@linqora-books/accounting-core';
import type { BillingProvider, TrialTerms } from './provider';
import type { Entitlement } from './entitlements';
import type { BillingInterval } from './plans';

/**
 * TEST MODE billing provider. It never contacts a payment provider and never
 * collects money. Every entitlement it produces has environment "test", which
 * `isProductionAuthorized` rejects and which the UI labels as TEST MODE.
 */
export class TestModeBillingProvider implements BillingProvider {
  readonly id = 'test_mode' as const;
  readonly environment = 'test' as const;
  readonly displayName = 'TEST MODE (no real payment)';

  async startTrial(interval: BillingInterval, terms: TrialTerms): Promise<Entitlement> {
    return {
      status: 'trialing',
      environment: 'test',
      source: 'test_mode',
      interval,
      trialStartedAt: terms.trialStart,
      trialEndsAt: terms.firstBillingDate,
      accessEndsAt: terms.firstBillingDate,
      nextBillingDate: terms.firstBillingDate,
      autoRenew: true,
    };
  }

  async cancel(current: Entitlement): Promise<Entitlement> {
    const { nextBillingDate: _dropped, ...rest } = current;
    void _dropped;
    return { ...rest, status: current.status === 'trialing' ? 'trialing' : 'cancelled_active', autoRenew: false };
  }

  async resume(current: Entitlement): Promise<Entitlement> {
    return {
      ...current,
      status: current.status === 'cancelled_active' ? 'active' : current.status,
      autoRenew: true,
      ...(current.accessEndsAt ? { nextBillingDate: current.accessEndsAt } : {}),
    };
  }

  async restorePurchases(): Promise<Entitlement | null> {
    return null;
  }

  /** TEST MODE only: simulate the trial or subscription ending, to preview read-only mode. */
  simulateExpiry(current: Entitlement, today: ISODate): Entitlement {
    const { nextBillingDate: _dropped, ...rest } = current;
    void _dropped;
    return { ...rest, status: 'expired', autoRenew: false, accessEndsAt: addDays(today, -1) };
  }
}
