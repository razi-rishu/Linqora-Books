import type { ISODate } from './dates';

const DATE_LABEL = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2026-10-28" → "28 Oct 2026" for messages, without time-zone shifting. */
export function formatDateLabel(date: ISODate): string {
  return DATE_LABEL.format(new Date(`${date}T00:00:00Z`));
}
