import { addCalendarMonths, type ISODate, type ISODateTime } from '@linqora-books/accounting-core';
import { TRIAL_LENGTH_MONTHS, type BillingInterval } from './plans';

/**
 * "test" entitlements come from the local TEST MODE provider and can never grant
 * production access. Only an entitlement the backend verified with a real billing
 * provider has environment "production".
 */
export type BillingEnvironment = 'test' | 'production';

export type EntitlementSource =
  | 'test_mode'
  /** Server-granted development/test access (cloud). Never a paid subscription. */
  | 'development'
  | 'google_play'
  | 'app_store'
  | 'revenuecat'
  | 'external_gateway'
  | 'complimentary';

export type EntitlementStatus =
  /** No trial or subscription yet. */
  | 'none'
  /** Trial running with recurring payment authorised. */
  | 'trialing'
  /** Paid subscription active. */
  | 'active'
  /** Cancelled but paid period not yet over. */
  | 'cancelled_active'
  /** Payment failed; provider grace period still running. */
  | 'grace_period'
  /** Trial or subscription ended. */
  | 'expired'
  /** Granted by an administrator. */
  | 'complimentary';

export interface Entitlement {
  status: EntitlementStatus;
  environment: BillingEnvironment;
  source: EntitlementSource;
  interval?: BillingInterval;
  trialStartedAt?: ISODate;
  trialEndsAt?: ISODate;
  /** When access ends unless renewed (end of trial, period or grace). */
  accessEndsAt?: ISODate;
  /** Next charge date, when auto-renewal is on. */
  nextBillingDate?: ISODate;
  autoRenew: boolean;
  /** Backend verification timestamp. Absent = never verified by the server. */
  verifiedAt?: ISODateTime;
}

export const NO_ENTITLEMENT: Entitlement = {
  status: 'none',
  environment: 'test',
  source: 'test_mode',
  autoRenew: false,
};

export interface AccessDecision {
  canView: boolean;
  canExport: boolean;
  canManageSubscription: boolean;
  /** Create or change financial records. */
  canWrite: boolean;
  isTestMode: boolean;
  reason: string;
}

const STATUSES_WITH_WRITE_ACCESS = new Set<EntitlementStatus>([
  'trialing',
  'active',
  'cancelled_active',
  'grace_period',
  'complimentary',
]);

/**
 * Decides what the user may do. Viewing, exporting and managing the subscription
 * are always allowed so that customers can never be locked out of their own data.
 */
export function evaluateAccess(entitlement: Entitlement, today: ISODate): AccessDecision {
  const base = {
    canView: true,
    canExport: true,
    canManageSubscription: true,
    isTestMode: entitlement.environment === 'test',
  };
  if (!STATUSES_WITH_WRITE_ACCESS.has(entitlement.status)) {
    return {
      ...base,
      canWrite: false,
      reason:
        entitlement.status === 'none'
          ? 'Start your free trial to add records.'
          : 'Your access has ended. Your records are safe — renew to add or change entries.',
    };
  }
  if (entitlement.accessEndsAt && entitlement.accessEndsAt < today) {
    return { ...base, canWrite: false, reason: 'Your access period has ended. Renew to add or change entries.' };
  }
  return { ...base, canWrite: true, reason: 'Full access' };
}

/** True only for server-verified, non-test entitlements. Client code must not fake this. */
export function isProductionAuthorized(entitlement: Entitlement): boolean {
  return entitlement.environment === 'production' && entitlement.source !== 'test_mode' && Boolean(entitlement.verifiedAt);
}

export function trialEndDate(start: ISODate): ISODate {
  return addCalendarMonths(start, TRIAL_LENGTH_MONTHS);
}
