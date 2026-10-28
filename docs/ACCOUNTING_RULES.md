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

This is how double counting is avoided: an invoice's revenue is recognised **once**, when issued; its
payments only move cash. Direct income/expense entries cannot be linked to an invoice/bill
(`validateTransaction` rejects it) — payments must be recorded as payments.

**Tax.** Invoice and bill revenue/expense exclude tax; receivable and payable balances include tax
(it is what the customer owes). Direct income/expense entries have no tax breakdown in Phase 1 and are
taken at face value.

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
  overpayments in Phase 1). Status is derived: unpaid / partly paid / paid / overdue.
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

- Opening balance + opening date per account; transactions dated before the opening date are ignored for that account.
- Reconciliation: user enters a statement balance for today; the app stores it and shows the
  difference against the computed balance at that date.

## Financial year

Configurable start month (April default for India). Reports offer this/last month and this/last financial year.

## Scope disclaimer

Linqora Books is a small-business finance tracker. It does not yet implement GST returns, e-invoicing
(IRN/QR), TDS, double-entry general ledger, or statutory reports, and must not be presented as
certified tax/accounting software until those requirements are implemented and validated.
