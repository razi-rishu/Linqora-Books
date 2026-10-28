import type { ISODate } from '@linqora-books/accounting-core';
import type { BillingInterval, PlanPrice } from './plans';
import type { BillingEnvironment, Entitlement } from './entitlements';
import { trialEndDate } from './entitlements';

/** What the customer must see and accept before a trial starts. */
export interface TrialTerms {
  price: PlanPrice;
  trialStart: ISODate;
  firstBillingDate: ISODate;
  cancellationSummary: string;
}

export function buildTrialTerms(price: PlanPrice, today: ISODate): TrialTerms {
  return {
    price,
    trialStart: today,
    firstBillingDate: trialEndDate(today),
    cancellationSummary:
      'Cancel any time before the first billing date and you will not be charged. After cancelling, ' +
      'you keep access until the end of the period you have already paid for, and you can always ' +
      'sign in to view and export your records.',
  };
}

/**
 * Billing provider abstraction. Implementations: TEST MODE (Phase 1), and later
 * Google Play Billing, App Store, RevenueCat and an approved external gateway.
 *
 * Providers return an Entitlement for display only. Real access is decided by the
 * backend after verifying the provider's receipt / webhook.
 */
export interface BillingProvider {
  readonly id: Entitlement['source'];
  readonly environment: BillingEnvironment;
  readonly displayName: string;
  /** Starts the provider's recurring-payment authorisation for a trial. */
  startTrial(interval: BillingInterval, acceptedTerms: TrialTerms): Promise<Entitlement>;
  cancel(current: Entitlement, today: ISODate): Promise<Entitlement>;
  resume(current: Entitlement, today: ISODate): Promise<Entitlement>;
  restorePurchases(): Promise<Entitlement | null>;
}
