import type { CurrencyCode, MinorUnits } from '@linqora-books/accounting-core';

export type BillingInterval = 'monthly' | 'yearly';

export interface PlanPrice {
  planId: string;
  interval: BillingInterval;
  currency: CurrencyCode;
  amount: MinorUnits;
  /** Provisional prices are shown with a notice and must be confirmed before launch. */
  provisional: boolean;
}

/**
 * PROVISIONAL India pricing. These values are configuration, not live products:
 * the authoritative price at checkout always comes from the billing provider.
 */
export const INDIA_PLAN_PRICES: readonly PlanPrice[] = [
  { planId: 'books_monthly_inr', interval: 'monthly', currency: 'INR', amount: 19900, provisional: true },
  { planId: 'books_yearly_inr', interval: 'yearly', currency: 'INR', amount: 179900, provisional: true },
];

export const TRIAL_LENGTH_MONTHS = 1;

export function priceFor(interval: BillingInterval, prices: readonly PlanPrice[] = INDIA_PLAN_PRICES): PlanPrice {
  const price = prices.find((p) => p.interval === interval);
  if (!price) throw new Error(`No ${interval} price configured`);
  return price;
}

/** Yearly saving compared with 12 monthly payments, in minor units. */
export function yearlySaving(prices: readonly PlanPrice[] = INDIA_PLAN_PRICES): MinorUnits {
  return priceFor('monthly', prices).amount * 12 - priceFor('yearly', prices).amount;
}
