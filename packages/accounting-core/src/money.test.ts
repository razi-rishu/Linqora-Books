import { describe, expect, it } from 'vitest';
import {
  applyRateBps,
  CurrencyMismatchError,
  divRoundHalfUp,
  formatMoney,
  multiplyByQuantity,
  parseAmount,
  sumInCurrency,
  toDecimalString,
} from './money';

describe('parseAmount', () => {
  it('parses rupees with grouping into paise', () => {
    expect(parseAmount('1,23,450.50', 'INR')).toBe(12345050);
    expect(parseAmount('₹ 99', 'INR')).toBe(9900);
    expect(parseAmount('0.5', 'INR')).toBe(50);
  });

  it('rejects too many decimals instead of rounding', () => {
    expect(() => parseAmount('10.005', 'INR')).toThrow();
  });

  it('rejects negatives unless allowed', () => {
    expect(() => parseAmount('-5', 'INR')).toThrow();
    expect(parseAmount('-5', 'INR', { allowNegative: true })).toBe(-500);
  });

  it('rejects garbage', () => {
    expect(() => parseAmount('abc', 'INR')).toThrow();
    expect(() => parseAmount('', 'INR')).toThrow();
    expect(() => parseAmount('1.2.3', 'INR')).toThrow();
  });
});

describe('decimal arithmetic', () => {
  it('avoids floating-point error (0.1 + 0.2)', () => {
    const total = parseAmount('0.10', 'INR') + parseAmount('0.20', 'INR');
    expect(toDecimalString(total, 'INR')).toBe('0.30');
  });

  it('rounds half away from zero', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
  });

  it('multiplies by fractional quantity exactly', () => {
    // 3 × ₹33.33 = ₹99.99 ; 1.5 × ₹10.01 = ₹15.015 → ₹15.02
    expect(multiplyByQuantity(3333, '3')).toBe(9999);
    expect(multiplyByQuantity(1001, '1.5')).toBe(1502);
    expect(() => multiplyByQuantity(100, '1.2345')).toThrow();
  });

  it('applies GST rates in basis points', () => {
    expect(applyRateBps(10000, 1800)).toBe(1800);
    expect(applyRateBps(9999, 1800)).toBe(1800); // 1799.82 → 1800
    expect(applyRateBps(12345, 500)).toBe(617); // 617.25 → 617
  });
});

describe('currency safety', () => {
  it('refuses to sum different currencies', () => {
    expect(() =>
      sumInCurrency(
        [
          { amount: 100, currency: 'INR' },
          { amount: 100, currency: 'USD' },
        ],
        'INR',
      ),
    ).toThrow(CurrencyMismatchError);
  });
});

describe('formatMoney', () => {
  it('uses Indian grouping for INR', () => {
    expect(formatMoney(12345050, 'INR')).toBe('₹1,23,450.50');
  });

  it('marks negatives with a minus sign, not only colour', () => {
    expect(formatMoney(-2500, 'INR')).toBe('−₹25.00');
    expect(formatMoney(2500, 'INR', { signDisplay: 'always' })).toBe('+₹25.00');
  });

  it('handles values beyond float-precision display safely', () => {
    expect(formatMoney(900719925474099, 'INR')).toBe('₹90,07,19,92,54,740.99');
  });
});
