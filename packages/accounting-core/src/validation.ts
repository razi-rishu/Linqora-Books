/**
 * Rules that check a transaction against the rest of the books. See
 * docs/ACCOUNTING_RULES.md → "Dates" and "Customer advances".
 *
 * D1  Opening date: an account's opening balance is its balance at the start of its
 *     opening date. Money cannot move through an account before that date.
 * D2  No future money: cash movements (and advance applications) cannot be dated
 *     after today in the business's time zone.
 * D3  Payment after document: a payment cannot be dated before the invoice or bill it
 *     settles. Money received before an invoice exists is a customer advance.
 * A1  An advance belongs to one customer and can only be applied to that customer's
 *     issued invoices, on or after both the advance date and the invoice date.
 * A2  Applications plus refunds of an advance can never exceed the advance.
 */
import type { BooksData, BusinessDocument, MoneyAccount, Transaction } from './models';
import { advanceRemaining, isPosted } from './ledger';
import { validatePayment } from './documents';
import type { ISODate } from './dates';
import { formatDateLabel } from './format';

type Books = Pick<BooksData, 'business' | 'accounts' | 'contacts' | 'documents' | 'transactions'>;

function checkAccount(account: MoneyAccount | undefined, txn: Transaction, errors: string[]): void {
  if (!account) {
    errors.push('The chosen account does not exist');
    return;
  }
  if (account.currency !== txn.currency) errors.push(`${account.name} is in ${account.currency}, not ${txn.currency}`);
  if (txn.date < account.openingDate) {
    errors.push(
      `${account.name} starts on ${formatDateLabel(account.openingDate)} with its opening balance — ` +
        'entries cannot be dated before that. Adjust the opening balance or date instead.',
    );
  }
}

function checkDocumentDate(txn: Transaction, doc: BusinessDocument, errors: string[]): void {
  if (txn.date < doc.issueDate) {
    const what = doc.type === 'bill' ? 'bill' : 'invoice';
    const hint =
      doc.type === 'invoice' && txn.kind === 'payment_received'
        ? ' Money received before the invoice is a customer advance — record it as an advance and apply it to this invoice.'
        : '';
    errors.push(`This cannot be dated before the ${what} date (${formatDateLabel(doc.issueDate)}).${hint}`);
  }
}

/**
 * Validates a new or changed posted transaction against the books. `today` is the
 * current date in the business's time zone.
 */
export function validateTransactionInBooks(txn: Transaction, books: Books, today: ISODate): string[] {
  const errors: string[] = [];
  if (txn.status !== 'posted') return errors;
  const others = books.transactions.filter((t) => t.id !== txn.id);

  if (txn.currency !== books.business.currency) errors.push(`Amounts must be in ${books.business.currency}`);
  if (txn.date > today) errors.push('Money movements cannot be dated in the future');

  if (txn.accountId) checkAccount(books.accounts.find((a) => a.id === txn.accountId), txn, errors);
  if (txn.toAccountId) checkAccount(books.accounts.find((a) => a.id === txn.toAccountId), txn, errors);

  const doc = txn.documentId ? books.documents.find((d) => d.id === txn.documentId) : undefined;
  if (txn.documentId && !doc) errors.push('The linked document does not exist');

  switch (txn.kind) {
    case 'payment_received':
    case 'payment_made': {
      if (!doc) break;
      const expected = txn.kind === 'payment_received' ? 'invoice' : 'bill';
      if (doc.type !== expected) {
        errors.push(`A ${txn.kind === 'payment_received' ? 'payment received' : 'payment made'} must be linked to a ${expected}`);
        break;
      }
      if (txn.contactId && txn.contactId !== doc.contactId) errors.push('The contact does not match the document');
      const check = validatePayment(doc, txn.amount, others);
      if (!check.ok) errors.push(check.error);
      checkDocumentDate(txn, doc, errors);
      break;
    }
    case 'refund_given': {
      if (!doc) break;
      if (doc.type !== 'invoice' || doc.status !== 'issued') errors.push('A refund can only be linked to an issued invoice');
      checkDocumentDate(txn, doc, errors);
      break;
    }
    case 'advance_received': {
      const contact = books.contacts.find((c) => c.id === txn.contactId);
      if (txn.contactId && !contact) errors.push('The customer does not exist');
      if (contact && contact.kind === 'supplier') errors.push('Advances are received from customers, not suppliers');
      break;
    }
    case 'advance_applied':
    case 'advance_refunded': {
      const advance = others.find((t) => t.id === txn.advanceId);
      if (!advance || advance.kind !== 'advance_received' || !isPosted(advance)) {
        errors.push('The advance does not exist or has been voided');
        break;
      }
      if (txn.contactId && txn.contactId !== advance.contactId) errors.push('The advance belongs to a different customer');
      if (txn.date < advance.date) errors.push(`This cannot be dated before the advance was received (${formatDateLabel(advance.date)})`);
      const remaining = advanceRemaining(advance, others);
      if (txn.amount > remaining) errors.push('Amount is more than the unused part of the advance');
      if (txn.kind === 'advance_applied' && doc) {
        if (doc.type !== 'invoice') {
          errors.push('Advances can only be applied to invoices');
          break;
        }
        if (doc.contactId !== advance.contactId) errors.push('The invoice is for a different customer than the advance');
        const check = validatePayment(doc, txn.amount, others);
        if (!check.ok) errors.push(check.error);
        checkDocumentDate(txn, doc, errors);
      }
      break;
    }
    default:
      break;
  }
  return [...new Set(errors)];
}

/** Rules for voiding a transaction (other transactions may depend on it). */
export function validateVoidTransaction(txn: Transaction, transactions: Transaction[]): string[] {
  if (txn.kind !== 'advance_received') return [];
  const dependants = transactions.filter((t) => isPosted(t) && t.advanceId === txn.id);
  return dependants.length ? ['Void the applications and refunds of this advance first'] : [];
}
