/**
 * External integration contracts (Phase 6). Nothing here talks to a real system yet;
 * these types define what a connected website or app sends to the Linqora Books API
 * and how imports are made idempotent.
 */
import type { BusinessDocument, CurrencyCode, ISODate, ISODateTime, MinorUnits } from '@linqora-books/accounting-core';

export type ConnectionStatus = 'pending' | 'active' | 'error' | 'revoked';

/**
 * A connection is authorised by an API token that Linqora Books issues to the
 * business. The external site stores that token; Linqora Books never asks for the
 * site's own admin password.
 */
export interface IntegrationConnection {
  id: string;
  organizationId: string;
  system: string;
  displayName: string;
  status: ConnectionStatus;
  /** Only a hash of the token is stored server-side; the UI shows the last 4 chars. */
  tokenHint?: string;
  scopes: IntegrationScope[];
  createdAt: ISODateTime;
  lastSyncAt?: ISODateTime;
  lastError?: string;
}

export type IntegrationScope = 'quotations.write' | 'invoices.write' | 'payments.write';

export interface ExternalLine {
  description: string;
  quantity: string;
  unitPrice: MinorUnits;
  taxRateBps: number;
}

/** Payload an external system sends for a quotation or invoice. */
export interface ExternalDocumentPayload {
  externalId: string;
  /** Monotonic version or updated-at from the source; older versions are ignored. */
  externalVersion: string;
  type: 'quotation' | 'invoice';
  number?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'issued' | 'void';
  customer: { externalId: string; name: string; phone?: string; email?: string };
  issueDate: ISODate;
  dueDate?: ISODate;
  currency: CurrencyCode;
  lines: ExternalLine[];
  notes?: string;
}

export interface ExternalPaymentPayload {
  externalId: string;
  invoiceExternalId: string;
  amount: MinorUnits;
  currency: CurrencyCode;
  date: ISODate;
  method?: string;
}

export type ImportDecision =
  | { action: 'create' }
  | { action: 'update'; documentId: string }
  | { action: 'skip'; reason: 'same_version' | 'older_version' }
  | { action: 'conflict'; documentId: string; reason: string };

/**
 * Decides what to do with an incoming external document so that repeated saves on
 * the website update the same record instead of creating duplicates.
 */
export function decideImport(
  payload: ExternalDocumentPayload,
  connectionId: string,
  existing: BusinessDocument[],
): ImportDecision {
  const match = existing.find(
    (d) => d.externalRef?.connectionId === connectionId && d.externalRef.externalId === payload.externalId,
  );
  if (!match) return { action: 'create' };
  const currentVersion = match.externalRef?.externalVersion;
  if (currentVersion === payload.externalVersion) return { action: 'skip', reason: 'same_version' };
  if (currentVersion && payload.externalVersion < currentVersion) return { action: 'skip', reason: 'older_version' };
  if (match.type !== payload.type) {
    return { action: 'conflict', documentId: match.id, reason: `Record is a ${match.type} here but a ${payload.type} in the source` };
  }
  if (match.type === 'invoice' && match.status !== 'draft') {
    return { action: 'conflict', documentId: match.id, reason: 'Issued invoices cannot be changed by an import; void and re-issue instead' };
  }
  if (match.status === 'converted') {
    return { action: 'conflict', documentId: match.id, reason: 'Quotation was already converted to an invoice' };
  }
  return { action: 'update', documentId: match.id };
}

/** Deterministic idempotency key for an inbound event. */
export function inboundEventKey(connectionId: string, kind: string, externalId: string, externalVersion: string): string {
  return `${connectionId}:${kind}:${externalId}:${externalVersion}`;
}
