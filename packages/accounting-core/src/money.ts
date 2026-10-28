/**
 * Money arithmetic.
 *
 * Amounts are stored as integers in the currency's minor unit (paise for INR,
 * cents for USD). Addition and subtraction of safe integers is exact in JavaScript.
 * Multiplication (quantity × price, amount × tax rate) is done in BigInt and rounded
 * half away from zero, so no binary floating-point value ever enters a total.
 */

export type MinorUnits = number;

export const CURRENCY_CODES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  minorDigits: number;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorDigits: 2, locale: 'en-IN' },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', minorDigits: 2, locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', minorDigits: 2, locale: 'en-IE' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', minorDigits: 2, locale: 'en-GB' },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED ', minorDigits: 2, locale: 'en-AE' },
};

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export class CurrencyMismatchError extends MoneyError {
  override name = 'CurrencyMismatchError';
  constructor(expected: CurrencyCode, actual: string) {
    super(`Cannot combine ${actual} with ${expected} without an explicit exchange rate.`);
  }
}

export function assertMinor(value: number, label = 'amount'): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of minor units, got ${value}`);
  }
  return value;
}

export function sumMinor(values: Iterable<MinorUnits>): MinorUnits {
  let total = 0;
  for (const v of values) total += assertMinor(v);
  return assertMinor(total, 'total');
}

/** Sums amounts that each carry a currency, refusing to mix currencies. */
export function sumInCurrency(
  items: Iterable<{ amount: MinorUnits; currency: string }>,
  currency: CurrencyCode,
): MinorUnits {
  let total = 0;
  for (const item of items) {
    if (item.currency !== currency) throw new CurrencyMismatchError(currency, item.currency);
    total += assertMinor(item.amount);
  }
  return assertMinor(total, 'total');
}

/** Integer division rounded half away from zero. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new MoneyError('denominator must be positive');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const q = (abs * 2n + denominator) / (denominator * 2n);
  return negative ? -q : q;
}

const QUANTITY_SCALE = 1000n;
const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

/** Parses a quantity like "2", "1.5" or "0.125" into thousandths. */
export function parseQuantity(quantity: string): bigint {
  const trimmed = quantity.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) {
    throw new MoneyError(`Invalid quantity "${quantity}" (up to 3 decimal places)`);
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, '0'));
}

export function multiplyByQuantity(unitPrice: MinorUnits, quantity: string): MinorUnits {
  const result = divRoundHalfUp(BigInt(assertMinor(unitPrice)) * parseQuantity(quantity), QUANTITY_SCALE);
  return assertMinor(Number(result), 'line amount');
}

/** Applies a rate expressed in basis points (1800 = 18%). */
export function applyRateBps(amount: MinorUnits, rateBps: number): MinorUnits {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 100_000) {
    throw new MoneyError(`Invalid rate ${rateBps} bps`);
  }
  return assertMinor(Number(divRoundHalfUp(BigInt(assertMinor(amount)) * BigInt(rateBps), 10_000n)), 'rate amount');
}

/**
 * Parses user input such as "1,234.50" into minor units. Grouping commas and
 * spaces are ignored. More decimal places than the currency supports is an error
 * rather than a silent rounding.
 */
export function parseAmount(input: string, currency: CurrencyCode, options: { allowNegative?: boolean } = {}): MinorUnits {
  const digits = CURRENCIES[currency].minorDigits;
  const cleaned = input.replace(/[,\s]/g, '').replace(/^[₹$€£]/, '');
  const pattern = digits > 0 ? new RegExp(`^(-)?(\\d+)(?:\\.(\\d{1,${digits}}))?$`) : /^(-)?(\d+)$/;
  const match = pattern.exec(cleaned);
  if (!match) throw new MoneyError(`"${input}" is not a valid amount`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (sign && !options.allowNegative) throw new MoneyError('Amount cannot be negative');
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0');
  const value = Number(sign ? -minor : minor);
  return assertMinor(value);
}

/** Converts minor units to a plain decimal string (e.g. 123450 → "1234.50"). */
export function toDecimalString(amount: MinorUnits, currency: CurrencyCode): string {
  const digits = CURRENCIES[currency].minorDigits;
  const negative = assertMinor(amount) < 0;
  const abs = BigInt(Math.abs(amount));
  const base = 10n ** BigInt(digits);
  const whole = (abs / base).toString();
  const fraction = digits > 0 ? '.' + (abs % base).toString().padStart(digits, '0') : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

export interface FormatMoneyOptions {
  /** "always" prefixes + for positive values; useful for signed movements. */
  signDisplay?: 'auto' | 'always';
  hideSymbol?: boolean;
}

/** Formats minor units with locale grouping, e.g. 12345050 INR → "₹1,23,450.50". */
export function formatMoney(amount: MinorUnits, currency: CurrencyCode, options: FormatMoneyOptions = {}): string {
  const info = CURRENCIES[currency];
  const negative = assertMinor(amount) < 0;
  const abs = BigInt(Math.abs(amount));
  const base = 10n ** BigInt(info.minorDigits);
  const grouped = new Intl.NumberFormat(info.locale).format(abs / base);
  const fraction = info.minorDigits > 0 ? '.' + (abs % base).toString().padStart(info.minorDigits, '0') : '';
  const sign = negative ? '−' : options.signDisplay === 'always' && amount > 0 ? '+' : '';
  return `${sign}${options.hideSymbol ? '' : info.symbol}${grouped}${fraction}`;
}
