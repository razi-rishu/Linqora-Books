import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayInTimeZone, type BooksData, type BusinessProfile } from '@linqora-books/accounting-core';
import { App } from './App';
import { LocalBooksRepository } from './data/local-repository';
import { buildSampleData } from './data/sample-data';
import { useSession } from './state/session';
import { useSubscription } from './state/subscription';
import { NO_ENTITLEMENT } from '@linqora-books/billing';

const business: BusinessProfile = {
  id: 'org_1',
  name: 'Orbit Events',
  category: 'events',
  address: '',
  currency: 'INR',
  financialYearStartMonth: 4,
  timeZone: 'Asia/Kolkata',
  modules: { projects: true },
  createdAt: '2026-10-01T00:00:00.000Z',
};

async function setup(path: string, { sample = true, trial = true, seed }: { sample?: boolean; trial?: boolean; seed?: Partial<BooksData> } = {}) {
  const repo = new LocalBooksRepository(localStorage);
  const today = todayInTimeZone(business.timeZone);
  await repo.saveBusiness(business, seed ?? (sample ? buildSampleData(business, 'user_1', today, new Date().toISOString()) : {}));
  const user = { id: 'user_1', email: 'a@example.test', name: 'A' };
  useSession.setState({ user, knownUsers: [user] });
  useSubscription.setState({
    introSeen: true,
    entitlement: trial ? { status: 'trialing', environment: 'test', source: 'test_mode', autoRenew: true, accessEndsAt: '2999-01-01' } : NO_ENTITLEMENT,
  });
  window.location.hash = path;
  render(<App repository={repo} />);
  return { repo };
}

describe('app', () => {
  it('shows the TEST MODE banner and sample-data warning on the dashboard', async () => {
    await setup('#/app');
    expect(await screen.findByRole('heading', { name: 'Orbit Events' })).toBeInTheDocument();
    expect(screen.getByText('TEST MODE')).toBeInTheDocument();
    expect(screen.getByText(/Sample data is loaded/)).toBeInTheDocument();
    // Profit/loss communicated in words, not only colour
    expect(screen.getAllByText(/^(Profit|Loss|Break-even)$/).length).toBeGreaterThan(0);
  });

  it('redirects to welcome when signed out', async () => {
    await setup('#/app');
    useSession.setState({ user: null });
    await waitFor(() => expect(window.location.hash).toBe('#/welcome'));
  });

  it('validates and saves a new expense', async () => {
    const { repo } = await setup('#/app/transactions/new?kind=expense', { sample: true });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('Enter an amount')).toBeInTheDocument();
    expect(screen.getByText('Add a short description')).toBeInTheDocument();
    expect(screen.getByText('Choose a category')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount (INR)'), '1,250.5');
    await user.type(screen.getByLabelText('Description'), 'Printer ink');
    await user.selectOptions(screen.getByLabelText('Category'), 'exp_office');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));

    await waitFor(async () => {
      const saved = (await repo.load())!.transactions.find((t) => t.description === 'Printer ink');
      expect(saved).toMatchObject({ kind: 'expense', amount: 125050, origin: 'user', categoryId: 'exp_office' });
    });
  });

  it('rejects amounts with too many decimals', async () => {
    await setup('#/app/transactions/new?kind=income');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Amount (INR)'), '10.999');
    await user.type(screen.getByLabelText('Description'), 'Tip');
    await user.selectOptions(screen.getByLabelText('Category'), 'inc_sales');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText(/not a valid amount/)).toBeInTheDocument();
  });

  it('is view-only without an active trial or subscription', async () => {
    await setup('#/app/transactions', { trial: false });
    expect(await screen.findByText('View-only')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add/ })).not.toBeInTheDocument();
  });

  it('shows sample invoices with their payment status', async () => {
    await setup('#/app/documents?type=invoice');
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(0);
  });

  it('lets the currency change only while no accounts or records exist', async () => {
    await setup('#/app/settings', { sample: false });
    expect(await screen.findByLabelText('Currency')).toBeEnabled();
  });

  it('locks the currency in Settings once an account exists, even with no records', async () => {
    const account = buildSampleData(business, 'user_1', '2026-10-28', '2026-10-28T00:00:00Z').accounts[0]!;
    await setup('#/app/settings', { seed: { accounts: [{ ...account, origin: 'user' }] } });
    expect(await screen.findByLabelText('Currency')).toBeDisabled();
    expect(screen.getByText('Locked once records exist')).toBeInTheDocument();
  });

  it('records a customer advance as money in without a category, and not as sales', async () => {
    const { repo } = await setup('#/app/transactions/new?kind=advance_received');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('Choose the customer who paid')).toBeInTheDocument();
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount (INR)'), '15000');
    await user.type(screen.getByLabelText('Description'), 'Booking advance');
    await user.selectOptions(screen.getByLabelText('Customer'), 'sample_con_meera');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));

    await waitFor(async () => {
      const saved = (await repo.load())!.transactions.find((t) => t.description === 'Booking advance');
      expect(saved).toMatchObject({ kind: 'advance_received', amount: 1500000, contactId: 'sample_con_meera' });
      expect(saved?.categoryId).toBeUndefined();
    });
  });

  it('shows a clear error for an entry dated in the future', async () => {
    await setup('#/app/transactions/new?kind=income');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Amount (INR)'), '100');
    await user.type(screen.getByLabelText('Description'), 'Future sale');
    await user.selectOptions(screen.getByLabelText('Category'), 'inc_sales');
    const date = screen.getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2999-01-01');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText(/cannot be dated in the future/)).toBeInTheDocument();
  });

  it('applies a customer advance to an invoice from the invoice screen', async () => {
    const { repo } = await setup('#/app/documents/sample_doc_inv2');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Apply advance/ }));
    // Defaults to the smaller of the unused advance (20,000) and the invoice balance (17,700).
    expect(screen.getByLabelText(/^Amount \(balance/)).toHaveValue('17700.00');
    await user.click(screen.getByRole('button', { name: 'Apply to invoice' }));

    await waitFor(async () => {
      const data = (await repo.load())!;
      const applied = data.transactions.find((t) => t.kind === 'advance_applied');
      expect(applied).toMatchObject({ amount: 1770000, documentId: 'sample_doc_inv2', advanceId: 'sample_txn_advance' });
      expect(applied?.accountId).toBeUndefined();
    });
    // Status badge and the totals row both read "Paid"; the payments list names the advance.
    expect(await screen.findAllByText('Paid')).toHaveLength(2);
    expect(screen.getByText(/Advance applied/)).toBeInTheDocument();
  });

  it('lists projects with realised profit', async () => {
    await setup('#/app/projects');
    expect(await screen.findByText('Wedding reception — Nair family')).toBeInTheDocument();
  });
});
