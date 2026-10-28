# Moving Phase 1 local records to the cloud

Phase 1 stored everything on the device (`localStorage` key `linqora-books:data:v1`). Phase 2 stores books in the
cloud. **The app never deletes or silently uploads local records.**

## How it works for the user

1. Install the cloud build over the old app (same app ID, so local data survives the update).
2. Sign up / sign in, verify the e-mail, create the business.
3. If the device holds records the user created (not samples), the dashboard shows
   *"This phone has N records from the earlier offline version… Review & import"*. Also in Settings →
   *Import records from this device*.
4. The review screen lists what **will be added**, what **cannot be imported (with the reason)**, and notes.
5. **Import** uploads everything listed in one atomic step. Afterwards the local copy is still on the device.

## Rules (`planLocalImport` in `packages/cloud`, `import_local_books()` in the database)

| Situation | Result |
|---|---|
| Record has origin `sample` | Never uploaded (also blocked by a database constraint) |
| Business currency differs from the cloud business | Nothing imported (amounts are never converted) |
| Transaction's account, invoice/bill or advance is a sample or not imported | **Rejected**, reason shown |
| Document's customer/supplier unavailable | **Rejected** |
| Optional link (transaction contact/project, project customer, document project) unavailable | Link removed, note shown |
| Quotation converted to an invoice that is not imported | Quotation imported as *accepted* |
| Document number already used in the cloud business | **Rejected** |
| Transaction fails the accounting rules (dates, balances, advances) | **Rejected** with the rule's message |
| Record id already in the cloud | Skipped (same record) |
| The same set of records imported again | Refused by fingerprint ("already imported") |
| Any row refused by the database during import | **Whole import rolled back**; nothing half-imported |

Imported records keep their ids and get `external_ref = {system: 'linqora-books-local', externalId, externalVersion: original createdAt}`.
`created_by`/`created_at` are set by the server to the importing user and import time (audit integrity).

## Current state of known local data

- **Browser preview on the development PC** (backed up to `backups/phase1-browser-localstorage-2026-10-28.json`,
  also `apps/mobile/src/import/fixtures/phase1-browser-export.json`): 25 sample records + 1 user payment. The payment
  is recorded against a sample invoice and sample account, so the planner **rejects it** with that reason — there is
  nothing real to import. Verified by an automated test.
- **Phones running Phase 1 builds:** unknown. The import screen will show exactly what is there.

## Backups made before Phase 2

- Git tag `phase-1-final` and full bundle `backups/linqora-books-phase1-2026-10-28.bundle` (git-ignored folder).
- Browser local data export (above).
