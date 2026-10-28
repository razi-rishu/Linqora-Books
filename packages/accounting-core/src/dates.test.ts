import { describe, expect, it } from 'vitest';
import { addCalendarMonths, financialYearCode, financialYearOf, isISODate, monthsInPeriod, todayInTimeZone } from './dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('26-1-1')).toBe(false);
  });

  it('adds calendar months with end-of-month clamping', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addCalendarMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('computes the Indian financial year (April start)', () => {
    expect(financialYearOf('2026-10-28', 4)).toEqual({ start: '2026-04-01', end: '2027-03-31', label: 'FY 2026-27' });
    expect(financialYearOf('2027-02-01', 4).label).toBe('FY 2026-27');
    expect(financialYearCode('2026-03-31', 4)).toBe('2025-26');
  });

  it('computes a calendar financial year', () => {
    expect(financialYearOf('2026-06-01', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31', label: 'FY 2026' });
  });

  it('lists months in a period', () => {
    const months = monthsInPeriod(financialYearOf('2026-10-28', 4));
    expect(months).toHaveLength(12);
    expect(months[0]!.label).toBe('Apr 2026');
    expect(months[11]!.end).toBe('2027-03-31');
  });

  it('reads today in a time zone', () => {
    // 2026-10-27T20:00Z is already 28 Oct in India
    expect(todayInTimeZone('Asia/Kolkata', new Date('2026-10-27T20:00:00Z'))).toBe('2026-10-28');
    expect(todayInTimeZone('UTC', new Date('2026-10-27T20:00:00Z'))).toBe('2026-10-27');
  });
});
