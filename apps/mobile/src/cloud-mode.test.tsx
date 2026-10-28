import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudError } from '@linqora-books/cloud';
import { defaultCategories, todayInTimeZone, type BooksData } from '@linqora-books/accounting-core';
import { App } from './App';
import { setAuthServiceForTests, useAuth } from './auth/auth-store';
import { FakeAuth, FakeCloudRepo } from './test/cloud-fakes';
import { LOCAL_DATA_KEY } from './import/local-snapshot';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config/env')>()),
  DATA_MODE: 'cloud',
  BILLING_MODE: 'unavailable',
  IS_PROTOTYPE: false,
}));

// Simulated Android: deep links, app resume and the Back button.
const native = vi.hoisted(() => ({ listeners: {} as Record<string, ((e: unknown) => void)[]>, exits: 0 }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (event: string, cb: (e: unknown) => void) => {
      (native.listeners[event] ??= []).push(cb);
      return { remove: vi.fn() };
    }),
    getLaunchUrl: vi.fn(async () => undefined),
    exitApp: vi.fn(async () => {
      native.exits += 1;
    }),
  },
}));
vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true } };
});

const fire = async (event: string, payload?: unknown) => {
  await act(async () => native.listeners[event]?.forEach((cb) => cb(payload)));
};
const openLink = (url: string) => fire('appUrlOpen', { url });
const hash = () => window.location.hash;

let auth: FakeAuth;
let repo: FakeCloudRepo;

function start(path = '#/') {
  window.history.replaceState(null, '', `/${path}`);
  const user = userEvent.setup();
  render(<App repository={repo} />);
  return user;
}

async function createBusinessFor(email: string, name: string) {
  auth.session = auth.addVerifiedUser(email, 'secret-pass-1');
  await repo.saveBusiness(
    { id: crypto.randomUUID(), name, category: 'events', address: '', currency: 'INR', financialYearStartMonth: 4, timeZone: 'Asia/Kolkata', modules: { projects: true }, createdAt: new Date().toISOString() },
    { categories: defaultCategories('events') },
  );
}

beforeEach(() => {
  auth = new FakeAuth();
  repo = new FakeCloudRepo(auth);
  setAuthServiceForTests(auth);
  useAuth.setState({ status: 'loading', user: null, recovery: false, notice: null });
});
afterEach(() => {
  setAuthServiceForTests(null);
});

describe('cloud mode: sign-up, verification and business creation', () => {
  it('signs up, verifies through the e-mail deep link, and creates a business (no sample data offered)', async () => {
    const user = start('#/sign-up');
    await user.type(await screen.findByLabelText('Your name'), 'Asha');
    await user.type(screen.getByLabelText('E-mail'), 'asha@example.test');
    await user.type(screen.getByLabelText('Password'), 'secret-pass-1');
    await user.type(screen.getByLabelText('Confirm password'), 'secret-pass-1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByRole('heading', { name: 'Verify your e-mail' })).toBeInTheDocument();
    expect(screen.getByText('asha@example.test')).toBeInTheDocument();

    // Signing in before verifying is refused, with a way to resend the e-mail.
    window.location.hash = '#/sign-in';
    await user.type(await screen.findByLabelText('E-mail'), 'asha@example.test');
    await user.type(screen.getByLabelText('Password'), 'secret-pass-1');
    await user.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(await screen.findByText(/verify your e-mail first/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Send the verification e-mail again/ }));
    expect(auth.resent).toEqual(['asha@example.test']);

    // The verification link opens the app (com.linqora.books://auth/callback?code=…).
    await openLink('com.linqora.books://auth/callback?type=signup&code=verify-asha@example.test');
    expect(await screen.findByRole('heading', { name: 'Set up your business' })).toBeInTheDocument();
    expect(screen.queryByText('Explore with sample data')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Business name'), 'Asha Events');
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByRole('heading', { name: 'Asha Events' })).toBeInTheDocument();
    expect(screen.getByText(/DEVELOPMENT BUILD/)).toBeInTheDocument();
    expect(screen.queryByText('TEST MODE')).not.toBeInTheDocument();
  });

  it('a used or unknown link sends the user to sign-in with an explanation', async () => {
    start('#/');
    await openLink('com.linqora.books://auth/callback?type=signup&code=nope');
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(hash()).toBe('#/sign-in');
  });
});

describe('cloud mode: sessions', () => {
  it('restores the saved session after an app restart (straight to the dashboard)', async () => {
    await createBusinessFor('owner@example.test', 'Restart Co');
    start('#/');
    expect(await screen.findByRole('heading', { name: 'Restart Co' })).toBeInTheDocument();
  });

  it('an expired session returns to sign-in with a message and clears the data on screen', async () => {
    await createBusinessFor('owner@example.test', 'Expiring Co');
    start('#/');
    await screen.findByRole('heading', { name: 'Expiring Co' });
    await act(async () => auth.expireSession());
    expect(await screen.findByText('Your session has expired. Please sign in again.')).toBeInTheDocument();
    expect(screen.queryByText('Expiring Co')).not.toBeInTheDocument();
    expect(hash()).toBe('#/sign-in');
  });

  it('signing out does not claim the session expired, and another account never sees the first one\'s books', async () => {
    await createBusinessFor('first@example.test', 'First Co');
    const user = start('#/app/more');
    await user.click(await screen.findByRole('button', { name: /Sign out/ }));
    await waitFor(() => expect(hash()).toBe('#/welcome'));
    expect(useAuth.getState().notice).toBeNull();

    auth.addVerifiedUser('second@example.test', 'secret-pass-2');
    window.location.hash = '#/sign-in';
    await user.type(await screen.findByLabelText('E-mail'), 'second@example.test');
    await user.type(screen.getByLabelText('Password'), 'secret-pass-2');
    await user.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(await screen.findByRole('heading', { name: 'Set up your business' })).toBeInTheDocument();
    expect(screen.queryByText('First Co')).not.toBeInTheDocument();
  });

  it('pauses token refresh in the background and refreshes data on resume', async () => {
    await createBusinessFor('owner@example.test', 'Resume Co');
    start('#/');
    await screen.findByRole('heading', { name: 'Resume Co' });
    await fire('appStateChange', { isActive: false });
    await fire('appStateChange', { isActive: true });
    expect(auth.foreground).toEqual([false, true]);
  });
});

describe('cloud mode: password reset', () => {
  it('requests a reset, follows the link and sets a new password', async () => {
    auth.addVerifiedUser('reset@example.test', 'old-password-1');
    const user = start('#/forgot-password');
    await user.type(await screen.findByLabelText('E-mail'), 'reset@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/a reset link has been sent/)).toBeInTheDocument();
    expect(screen.queryByText(/no e-mail is actually sent/)).not.toBeInTheDocument();

    await openLink('com.linqora.books://auth/callback?type=recovery&code=reset-reset@example.test');
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), 'new-password-2');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-2');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() => expect(auth.users.get('reset@example.test')!.password).toBe('new-password-2'));
    expect(useAuth.getState().recovery).toBe(false);
  });
});

describe('cloud mode: saving, network failures and access', () => {
  it('a failed save is reported as not saved, keeps the form, and the retry does not duplicate', async () => {
    await createBusinessFor('owner@example.test', 'Net Co');
    const { accounts } = { accounts: [] };
    void accounts;
    await repo.saveAccount({
      id: 'acc_1', organizationId: 'x', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '', origin: 'user',
      name: 'Bank', kind: 'bank', currency: 'INR', openingBalance: 0, openingDate: '2026-01-01', archived: false,
    });
    const user = start('#/app/transactions/new?kind=expense');
    await user.type(await screen.findByLabelText('Amount (INR)'), '250');
    await user.type(screen.getByLabelText('Description'), 'Courier');
    await user.selectOptions(screen.getByLabelText('Category'), 'exp_office');

    repo.failures.push(new CloudError('network', 'Could not reach the server. Nothing was saved — check your connection and try again.'));
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    expect(hash()).toBe('#/app/transactions/new?kind=expense');
    expect(screen.getByLabelText('Description')).toHaveValue('Courier');

    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(hash()).toBe('#/app/transactions'));
    // Both attempts used the same record id; only one transaction exists.
    expect(new Set(repo.saves).size).toBe(1);
    const data = (await repo.load())!;
    expect(data.transactions.filter((t) => t.description === 'Courier')).toHaveLength(1);
  });

  it('without server-granted access the app is view-only and says why', async () => {
    await createBusinessFor('owner@example.test', 'Readonly Co');
    repo.entitlement = { status: 'none', environment: 'test', source: 'development', autoRenew: false };
    start('#/app/subscription');
    expect(await screen.findByText('Not activated')).toBeInTheDocument();
    expect(screen.getByText(/Billing is not available yet/)).toBeInTheDocument();
    window.location.hash = '#/app/transactions';
    expect(await screen.findByText('View-only')).toBeInTheDocument();
  });

  it('shows when the device is offline', async () => {
    await createBusinessFor('owner@example.test', 'Offline Co');
    start('#/');
    await screen.findByRole('heading', { name: 'Offline Co' });
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
    online.mockRestore();
  });

  it('cloud builds do not offer the local TEST MODE trial', async () => {
    await createBusinessFor('owner@example.test', 'Trial Co');
    start('#/subscribe/trial');
    await waitFor(() => expect(hash()).toBe('#/app/subscription'));
  });

  it('Android Back still works in cloud mode (dashboard asks before exiting)', async () => {
    await createBusinessFor('owner@example.test', 'Back Co');
    start('#/');
    await screen.findByRole('heading', { name: 'Back Co' });
    await fire('backButton');
    expect(await screen.findByText('Press back again to exit')).toBeInTheDocument();
    expect(native.exits).toBe(0);
  });
});

describe('cloud mode: importing records from the earlier offline version', () => {
  function localSnapshot(): BooksData {
    const audit = { organizationId: 'org_local', createdAt: '2026-05-01T00:00:00Z', createdBy: 'u', updatedAt: '2026-05-01T00:00:00Z', updatedBy: 'u' };
    return {
      business: { id: 'org_local', name: 'My Old Shop', category: 'retail', address: '', currency: 'INR', financialYearStartMonth: 4, timeZone: 'Asia/Kolkata', modules: { projects: false }, createdAt: '2026-05-01T00:00:00Z' },
      categories: defaultCategories('retail'),
      contacts: [
        { ...audit, id: 'con_mine', origin: 'user', kind: 'customer', name: 'My customer', archived: false },
        { ...audit, id: 'con_sample', origin: 'sample', kind: 'customer', name: 'Sample person', archived: false },
      ],
      accounts: [{ ...audit, id: 'acc_mine', origin: 'user', name: 'Till', kind: 'cash', currency: 'INR', openingBalance: 0, openingDate: '2026-04-01', archived: false }],
      projects: [],
      documents: [],
      transactions: [
        { ...audit, id: 'sale_mine', origin: 'user', kind: 'income', date: todayInTimeZone('Asia/Kolkata') < '2026-05-02' ? todayInTimeZone('Asia/Kolkata') : '2026-05-02', amount: 1000, currency: 'INR', accountId: 'acc_mine', categoryId: 'inc_sales', description: 'Old sale', status: 'posted' },
      ],
    };
  }

  it('offers, reviews and imports only user records, keeping the local copy', async () => {
    window.localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(localSnapshot()));
    await createBusinessFor('owner@example.test', 'Cloud Co');
    const user = start('#/');
    expect(await screen.findByText(/from the earlier offline version/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Review & import/ }));

    expect(await screen.findByText('My customer')).toBeInTheDocument();
    expect(screen.getByText('Till')).toBeInTheDocument();
    expect(screen.getByText('Old sale')).toBeInTheDocument();
    expect(screen.queryByText('Sample person')).not.toBeInTheDocument();
    expect(screen.getByText(/1 sample records are not uploaded/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import 3 records/ }));
    expect(await screen.findByText('Import complete.')).toBeInTheDocument();
    expect(repo.imports).toHaveLength(1);
    expect(repo.imports[0]!.payload.contacts.map((c) => c.id)).toEqual(['con_mine']);
    // Nothing local is deleted.
    expect(window.localStorage.getItem(LOCAL_DATA_KEY)).not.toBeNull();
  });
});
