import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Formats an ISO calendar date ("2026-10-28") without time-zone shifting. */
export function formatDate(date: string | undefined): string {
  if (!date) return '—';
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Triggers a browser download of text content (web builds; Android sharing is Phase 4). */
export function downloadText(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          // Quote, and neutralise spreadsheet formula injection.
          const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(','),
    )
    .join('\n');
}
