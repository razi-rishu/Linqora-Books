import type { BooksData } from '@linqora-books/accounting-core';

/** Where the Phase 1 local preview kept its records on this device. Never deleted by the app. */
export const LOCAL_DATA_KEY = 'linqora-books:data:v1';
const IMPORT_MARKER_KEY = 'linqora-books:cloud-import:v1';

export interface ImportMarker {
  fingerprint: string;
  organizationId: string;
  at: string;
  status: 'imported' | 'already_imported' | 'nothing-to-import';
}

export function readLocalSnapshot(): BooksData | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_DATA_KEY);
    return raw ? (JSON.parse(raw) as BooksData) : null;
  } catch {
    return null;
  }
}

export function readImportMarker(): ImportMarker | null {
  try {
    const raw = window.localStorage.getItem(IMPORT_MARKER_KEY);
    return raw ? (JSON.parse(raw) as ImportMarker) : null;
  } catch {
    return null;
  }
}

/** Records that this device's local data was reviewed/imported. The local data itself is kept. */
export function writeImportMarker(marker: ImportMarker): void {
  try {
    window.localStorage.setItem(IMPORT_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // Storage unavailable: the banner may show again; the server still refuses a repeat import.
  }
}
