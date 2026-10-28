# Accounting rules

These rules are implemented in `packages/accounting-core` and covered by its tests.

## Money

- Stored as **integers in the minor unit** (paise for INR). Never floating point.
- Addition/subtraction is exact for safe integers; every result is checked with `Number.isSafeInteger`.
- Quantity × price and amount × tax rate are computed in **BigInt** and rounded **half away from zero**.
- Quantities: decimal strings with up to 3 places. Tax rates: basis points (1800 = 18%).
- User input is parsed by `parseAmount`; more decimals than the currency allows is an **error**, not silent rounding.
- Display uses locale grouping (₹1,23,450.50). Negative values show a minus sign; profit/loss is labelled in words with an icon, never by colour alone.

## Currencies

- A business has one base currency (INR fully supported; USD, EUR, GBP, AED defined).
- Every amount carries a currency. Calculations **throw** `CurrencyMismatchError` rather than combine
  currencies. Multi-currency needs explicit exchange-rate handling (future).
- The business currency is locked once any account, project, transaction or document exists
  (`isCurrencyLocked`), enforced by the repository and reflected in Settings.

## Two views of performance

| | Profit & loss (accrual) | Cash movement |
|---|---|---|
| Invoice issued | + revenue (before tax), on issue date | — |
| Payment received against invoice | — | + money in |
| Direct income (cash sale) | + revenue | + money in |
| Supplier bill issued | + expense (before tax), on bill date | — |
| Payment made against bill | — | + money out |
| Direct expense | + expense | + money out |
| Refund given | − revenue | + money out |
| Transfer between own accounts | — | — (balances move; total unchanged) |
| Customer advance received | — | + money in (held for the customer) |
| Advance applied to an invoice | — (settles the invoice) | — (no money moves) |
| Unused advance refunded | — | + money out |

This is how double counting is avoided: an invoice's revenue is recognised **once**, when issued; its
payments only move cash. Direct income/expense entries cannot be linked to an invoice/bill
(`validateTransaction` rejects it) — payments must be recorded as payments.

**Tax.** Invoice and bill revenue/expense exclude tax; receivable and payable balances include tax
(it is what the customer owes). Direct income/expense entries have no tax breakdown in Phase 1 and are
taken at face value.

## Customer advances

Money a customer pays **before** an invoice exists (booking amounts, deposits) is a **customer advance**,
not sales. Recorded as three transaction kinds:

| Kind | Account | Effect |
|---|---|---|
| `advance_received` | required | Cash in. Increases the advance **held** for that customer (owed to them until used). No revenue. |
| `advance_applied` | **none** | Settles an issued invoice of the same customer from the held advance. No cash, no revenue — the invoice already recognised the revenue when issued. |
| `advance_refunded` | required | Returns unused advance: cash out, held amount falls. Not a sales refund (does not reduce revenue). |

Rules (`validateTransaction`, `validateTransactionInBooks`, `validateVoidTransaction`):

- A1 An advance belongs to one customer (a contact of kind customer/both); it takes no category and no invoice when received.
- A1 It can be applied only to that customer's **issued** invoices, dated on or after both the advance and the invoice.
- A2 Applications + refunds never exceed the advance; an application never exceeds the invoice balance.
- An advance cannot be voided while non-void applications/refunds use it — void those first. An invoice cannot be
  voided while applied advances settle it (same rule as payments).
- `customerAdvances()` reports the unused amount per customer (dashboard tile, customer page, Reports → Customer advances).

Why not record early money as a payment? The invoice does not exist yet, and recording it as income would count
the sale twice when the invoice is issued. The advance keeps cash correct now and revenue correct later.

## Dates

Checked by `validateTransactionInBooks` (and enforced again by the repository on every save):

- **D1 Opening date.** An account's opening balance is its balance at the **start** of its opening date. Entries on
  or after that date count; entries before it are rejected (for both sides of a transfer). This keeps
  "money received/spent" and account balances consistent. To record earlier history, change the opening balance or date.
  The opening date itself cannot be in the future.
- **D2 No future money.** Cash movements (and advance applications) cannot be dated after today in the business's
  time zone. Otherwise "money received this month" could include money that is in no balance yet. Invoices, bills
  and quotations may still be future-dated. (Post-dated cheques are a future feature.)
- **D3 Payment after document.** A payment cannot be dated before the invoice or bill it settles; a refund linked to an
  invoice cannot be dated before it. Money received earlier is a customer advance. Supplier prepayments are not modelled
  yet — record the bill first.
- Payments must match the document type (received → invoice, made → bill) and the document's contact.

## What is excluded from all totals

- Draft invoices and bills
- **All quotations**, in every status (they are offers, not revenue)
- Void documents and void transactions

## Documents

- **Numbering:** `INV/2026-27/0001`, `QUO/…`, `BILL/…` — per type and financial year, sequential.
  Numbers of void documents are never reused. Quotations get a number on first save; invoices and bills on issue.
  A number never changes once assigned (enforced by the repository too).
- **Quotation lifecycle:** draft → sent → accepted / rejected; rejected/sent may reopen to draft;
  accepted → **converted** (exactly once). Only drafts are editable.
- **Conversion:** creates a *draft* invoice with copied lines and `convertedFromId`; the quotation becomes
  `converted` with `convertedToId`. Repeating the conversion throws; the repository also refuses a second
  invoice with the same `convertedFromId`; the button is disabled while saving.
- **Issue:** draft → issued, requires ≥1 line and a positive total.
- **Payments:** only against issued invoices/bills; amount must be > 0 and ≤ outstanding balance (no
  overpayments in Phase 1); dated on or after the document (D3). Invoices may also be settled by applied
  advances. Status is derived from payments + applied advances: unpaid / partly paid / paid / overdue.
- **Void:** issued → void with a required reason, who and when. Not allowed while non-void payments exist.
- **Delete:** only drafts. Finalised records are voided, never deleted. Deleting the draft invoice created
  by a conversion returns its quotation to *accepted* in the same write (`releaseConvertedQuotation`), so it
  can be converted again.

## Corrections and audit trail

- Every record has `createdAt/By`, `updatedAt/By`, and `origin` (`sample` / `user` / `integration`).
- Transactions are corrected by **void + re-enter**; `correctsTransactionId` is reserved for linking them.
- Void records stay visible (struck through) with their reason and are excluded from totals.
- Phase 2 adds an append-only `audit_log` table filled by database triggers (before/after snapshots).

## Accounts

- Opening balance + opening date per account (balance at the start of that day). Entries cannot be dated before it (D1).
- Reconciliation: user enters a statement balance for today; the app stores it and shows the
  difference against the computed balance at that date.

## Financial year

Configurable start month (April default for India). Reports offer this/last month and this/last financial year.

## Scope disclaimer

Linqora Books is a small-business finance tracker. It does not yet implement GST returns, e-invoicing
(IRN/QR), TDS, double-entry general ledger, or statutory reports, and must not be presented as
certified tax/accounting software until those requirements are implemented and validated.
