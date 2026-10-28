# Integrations

Goal: let a business connect its own website or software so quotations, invoices and payments flow into
Linqora Books automatically. First target: the Orvella event-management website's admin quotation maker.
The design is generic so any website or supported business software can connect.

**Nothing in Phase 1 connects to, reads from, or modifies the Orvella website.**

## Desired behaviour

1. The business creates a connection in Linqora Books → Settings → Integrations.
2. Authorised quotation records are imported automatically.
3. Repeated saves on the website update the **same** imported quotation.
4. Quotations stay quotations unless formally converted/issued.
5. Invoices are imported as invoices.
6. Recorded payments update the invoice balance.
7. The user sees sync status and errors.
8. Sync is server-to-server, so it works with the phone switched off.

## Authentication

- Linqora Books issues a **connection token** (random, shown once, stored hashed, revocable, scoped to
  `quotations.write`, `invoices.write`, `payments.write` for one organization).
- The website stores the token server-side and calls the Linqora Books Worker API.
- **Never** request the website's admin password or database credentials.

## Endpoints (Phase 6, Worker)

```
POST /v1/integrations/{connectionId}/documents   ExternalDocumentPayload
POST /v1/integrations/{connectionId}/payments    ExternalPaymentPayload
GET  /v1/integrations/{connectionId}/status
DELETE /v1/integrations/{connectionId}           (revoke)
```

Headers: `Authorization: Bearer <connection token>`, `Idempotency-Key: <inboundEventKey>`.
Optionally an HMAC signature of the body for push-style webhooks.

## Idempotency and conflicts

Implemented contract: `packages/integrations` (`decideImport`, `inboundEventKey`, tested).

| Situation | Decision |
|---|---|
| Unknown `(connectionId, externalId)` | create |
| Same `externalVersion` again | skip (idempotent retry) |
| Older version arrives late | skip (out-of-order) |
| Newer version, quotation/draft | update same record |
| Record already converted, or an issued invoice | **conflict** — shown to the user, not overwritten |
| Type changed (quotation ↔ invoice) | conflict |

Database uniqueness: `(organization_id, external_connection_id, external_id)`. Imported records have
`origin = 'integration'` and an `externalRef` (source attribution).

## Reliability

- Inbound: the website retries on non-2xx with backoff; duplicates are harmless.
- Outbound / pull connectors: a server-side queue (Cloudflare Queues) with retry, dead-letter and per-connection
  error state visible in the app.
- Disconnect: revokes the token immediately; imported records remain (with attribution).

## Inspecting Orvella's quotation storage (future phase — read-only, with permission)

Before building the connector, with the owner's authorisation:

1. Identify how the admin quotation maker persists data (database table, JSON file, headless CMS, local storage).
2. Document the quotation fields, status values, number format, customer fields, tax handling and how edits
   are versioned (updated-at timestamp or revision number → `externalVersion`).
3. Determine where a server-side hook can run on save (API route, database trigger, scheduled export).
4. Map fields to `ExternalDocumentPayload`; list gaps (e.g. missing stable IDs).
5. Agree a change plan with the site owner; the website change itself is a separate, approved task.

No step above is performed in Phase 1.
