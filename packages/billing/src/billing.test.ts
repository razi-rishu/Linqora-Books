import { describe, expect, it } from 'vitest';
import {
  buildTrialTerms,
  evaluateAccess,
  isProductionAuthorized,
  NO_ENTITLEMENT,
  priceFor,
  TestModeBillingProvider,
  trialEndDate,
  yearlySaving,
  type Entitlement,
} from './index';

describe('plans', () => {
  it('has the provisional India prices', () => {
    expect(priceFor('monthly')).toMatchObject({ amount: 19900, currency: 'INR', provisional: true });
    expect(priceFor('yearly').amount).toBe(179900);
    expect(yearlySaving()).toBe(19900 * 12 - 179900);
  });
});

describe('trial', () => {
  it('lasts one calendar month', () => {
    expect(trialEndDate('2026-10-28')).toBe('2026-11-28');
    expect(trialEndDate('2027-01-31')).toBe('2027-02-28');
  });

  it('shows the first billing date in the terms', () => {
    const terms = buildTrialTerms(priceFor('yearly'), '2026-10-28');
    expect(terms.firstBillingDate).toBe('2026-11-28');
    expect(terms.cancellationSummary).toMatch(/not be charged/);
  });
});

describe('access rules', () => {
  const today = '2026-11-10';

  it('without a trial: view and export only', () => {
    const a = evaluateAccess(NO_ENTITLEMENT, today);
    expect(a).toMatchObject({ canView: true, canExport: true, canManageSubscription: true, canWrite: false });
  });

  it('trial grants full access until it ends', async () => {
    const provider = new TestModeBillingProvider();
    const e = await provider.startTrial('monthly', buildTrialTerms(priceFor('monthly'), '2026-10-28'));
    expect(evaluateAccess(e, today).canWrite).toBe(true);
    expect(evaluateAccess(e, '2026-11-29').canWrite).toBe(false);
  });

  it('expired subscriptions keep data readable and exportable', () => {
    const expired: Entitlement = { ...NO_ENTITLEMENT, status: 'expired' };
    const a = evaluateAccess(expired, today);
    expect(a.canWrite).toBe(false);
    expect(a.canView && a.canExport && a.canManageSubscription).toBe(true);
    expect(a.reason).toMatch(/records are safe/);
  });

  it('cancelled subscriptions keep access until the paid period ends', () => {
    const e: Entitlement = { ...NO_ENTITLEMENT, status: 'cancelled_active', accessEndsAt: '2026-12-01' };
    expect(evaluateAccess(e, today).canWrite).toBe(true);
    expect(evaluateAccess(e, '2026-12-02').canWrite).toBe(false);
  });
});

describe('test mode can never authorise production access', () => {
  it('rejects test-mode entitlements even if marked verified', async () => {
    const provider = new TestModeBillingProvider();
    const e = await provider.startTrial('monthly', buildTrialTerms(priceFor('monthly'), '2026-10-28'));
    expect(e.environment).toBe('test');
    expect(evaluateAccess(e, '2026-11-01').isTestMode).toBe(true);
    expect(isProductionAuthorized(e)).toBe(false);
    expect(isProductionAuthorized({ ...e, verifiedAt: '2026-10-28T00:00:00Z' })).toBe(false);
    expect(isProductionAuthorized({ ...e, environment: 'production' })).toBe(false);
  });

  it('accepts only server-verified production entitlements', () => {
    const e: Entitlement = {
      status: 'active',
      environment: 'production',
      source: 'google_play',
      autoRenew: true,
      verifiedAt: '2026-10-28T00:00:00Z',
    };
    expect(isProductionAuthorized(e)).toBe(true);
    const { verifiedAt: _v, ...unverified } = e;
    void _v;
    expect(isProductionAuthorized(unverified)).toBe(false);
  });

  it('simulated expiry makes the app read-only', () => {
    const provider = new TestModeBillingProvider();
    const expired = provider.simulateExpiry({ ...NO_ENTITLEMENT, status: 'trialing' }, '2026-11-10');
    expect(evaluateAccess(expired, '2026-11-10').canWrite).toBe(false);
  });
});
