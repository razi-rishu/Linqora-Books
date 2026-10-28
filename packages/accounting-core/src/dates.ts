/**
 * Calendar-date helpers. Accounting dates are plain ISO dates ("2026-04-01")
 * without a time component, interpreted in the business's own time zone.
 */

export type ISODate = string;
export type ISODateTime = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function parts(date: ISODate): [number, number, number] {
  const m = ISO_DATE.exec(date);
  if (!m || !isISODate(date)) throw new Error(`Invalid ISO date "${date}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today's date in the given IANA time zone (e.g. "Asia/Kolkata"). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now);
}

/**
 * Adds calendar months, clamping to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29), which is how most billing providers define
 * "one month".
 */
export function addCalendarMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return toISODate(year, month, Math.min(d, daysInMonth(year, month)));
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface Period {
  start: ISODate;
  end: ISODate;
  label: string;
}

export function isInPeriod(date: ISODate, period: Period): boolean {
  return date >= period.start && date <= period.end;
}

/** Financial year containing `date`, e.g. Apr 2026 – Mar 2027 → "FY 2026-27". */
export function financialYearOf(date: ISODate, startMonth: number): Period {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(`Invalid financial-year start month ${startMonth}`);
  }
  const [y, m] = parts(date);
  const startYear = m >= startMonth ? y : y - 1;
  const start = toISODate(startYear, startMonth, 1);
  const end = addDays(addCalendarMonths(start, 12), -1);
  const label = startMonth === 1 ? `FY ${startYear}` : `FY ${startYear}-${String(startYear + 1).slice(2)}`;
  return { start, end, label };
}

/** Short label used inside document numbers, e.g. "2026-27". */
export function financialYearCode(date: ISODate, startMonth: number): string {
  return financialYearOf(date, startMonth).label.replace('FY ', '');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthOf(date: ISODate): Period {
  const [y, m] = parts(date);
  return {
    start: toISODate(y, m, 1),
    end: toISODate(y, m, daysInMonth(y, m)),
    label: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

/** The calendar months covered by a period, oldest first. */
export function monthsInPeriod(period: Period): Period[] {
  const result: Period[] = [];
  let cursor = monthOf(period.start).start;
  while (cursor <= period.end) {
    result.push(monthOf(cursor));
    cursor = addCalendarMonths(cursor, 1);
  }
  return result;
}
