/**
 * Generates a random identifier. Records are created with client-generated IDs so
 * that a future sync layer can retry writes idempotently (the same ID is sent again
 * instead of creating a duplicate row).
 */
export function newId(prefix?: string): string {
  const uuid = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/** Idempotency key for a mutation; stable for one user intent, unique across intents. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
