import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayInTimeZone, type BusinessProfile } from '@linqora-books/accounting-core';
import { App } from '@/App';
import { LocalBooksRepository } from '@/data/local-repository';
import { buildSampleData } from '@/data/sample-data';
import { useSession } from '@/state/session';
import { useSubscription } from '@/state/subscription';

// Simulated Android: capture the native backButton listener and record exits.
const native = vi.hoisted(() => ({ listeners: [] as (() => void)[], exits: 0 }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, cb: () => void) => {
      native.listeners.push(cb);
      return { remove: vi.fn() };
    }),
    exitApp: vi.fn(async () => {
      native.exits += 1;
    }),
  },
}));
vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true } };
});

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

/** Press the Android Back button. */
async function pressBack() {
  expect(native.listeners).toHaveLength(1);
  await act(async () => native.listeners[0]!());
}

const hash = () => window.location.hash;

async function setup(path: string) {
  const repo = new LocalBooksRepository(localStorage);
  await repo.saveBusiness(business, buildSampleData(business, 'user_1', todayInTimeZone(business.timeZone), new Date().toISOString()));
  const user = { id: 'user_1', email: 'a@example.test', name: 'A' };
  useSession.setState({ user, knownUsers: [user] });
  useSubscription.setState({
    introSeen: true,
    entitlement: { status: 'trialing', environment: 'test', source: 'test_mode', autoRenew: true, accessEndsAt: '2999-01-01' },
  });
  window.history.replaceState(null, '', `/${path}`);
  const utils = render(
    <StrictMode>
      <App repository={repo} />
    </StrictMode>,
  );
  return { repo, user: userEvent.setup(), ...utils };
}

describe('Android hardware Back', () => {
  beforeEach(() => {
    native.exits = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('installs exactly one native listener, even under StrictMode and remounts', async () => {
    const { unmount } = await setup('#/app');
    await screen.findByRole('heading', { name: 'Orbit Events' });
    unmount();
    await setup('#/app');
    await screen.findByRole('heading', { name: 'Orbit Events' });
    expect(native.listeners).toHaveLength(1);
  });

  it('goes back to the previous screen instead of closing the app', async () => {
    const { user } = await setup('#/app');
    await screen.findByRole('heading', { name: 'Orbit Events' });
    await user.click(screen.getAllByRole('link', { name: /^Reports$/ })[0]!);
    await screen.findByRole('heading', { name: 'Reports' });
    await user.click(screen.getAllByRole('link', { name: /Invoices/ })[0]!);
    await screen.findByRole('heading', { name: 'Quotations & invoices' });

    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app/reports'));
    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app'));
    expect(native.exits).toBe(0);
  });

  it('opens the logical parent when a screen has no history (e.g. after a reload)', async () => {
    await setup('#/app/documents/sample_doc_inv1');
    await screen.findByRole('heading', { name: /^Invoice INV/ });
    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app/documents'));
    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app'));
    expect(native.exits).toBe(0);
  });

  it('on the dashboard: first press shows a hint, second press exits', async () => {
    await setup('#/app');
    await screen.findByRole('heading', { name: 'Orbit Events' });
    await pressBack();
    expect(await screen.findByText('Press back again to exit')).toBeInTheDocument();
    expect(native.exits).toBe(0);
    expect(hash()).toBe('#/app');
    await pressBack();
    expect(native.exits).toBe(1);
  });

  it('does not exit if the second press comes after the hint expired', async () => {
    await setup('#/app');
    await screen.findByRole('heading', { name: 'Orbit Events' });
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await pressBack();
    now.mockReturnValue(1_000_000 + 5_000);
    await pressBack();
    expect(native.exits).toBe(0);
    expect(screen.getByText('Press back again to exit')).toBeInTheDocument();
    now.mockRestore();
  });

  it('closes an open panel first and stays on the screen', async () => {
    const { user } = await setup('#/app/documents/sample_doc_inv1');
    await user.click(await screen.findByRole('button', { name: /Record payment/ }));
    expect(screen.getByRole('heading', { name: 'Record payment' })).toBeInTheDocument();
    await pressBack();
    expect(screen.queryByRole('heading', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(hash()).toBe('#/app/documents/sample_doc_inv1');
  });

  it('hides the keyboard (blurs the field) before navigating', async () => {
    const { user } = await setup('#/app/transactions');
    const search = await screen.findByLabelText('Search transactions');
    await user.click(search);
    expect(search).toHaveFocus();
    await pressBack();
    expect(search).not.toHaveFocus();
    expect(hash()).toBe('#/app/transactions');
    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app'));
  });

  it('warns before discarding unsaved changes and keeps them when the user stays', async () => {
    const { user } = await setup('#/app/transactions/new?kind=expense');
    const description = await screen.findByLabelText('Description');
    await user.type(description, 'Half-typed entry');
    await pressBack(); // hides keyboard
    await pressBack(); // tries to leave
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();

    // Back on the dialog = keep editing.
    await pressBack();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(hash()).toBe('#/app/transactions/new?kind=expense');
    expect(screen.getByLabelText('Description')).toHaveValue('Half-typed entry');

    await pressBack();
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    // Opened directly (no history), so Back leads to the form's parent screen.
    await waitFor(() => expect(hash()).toBe('#/app/transactions'));
  });

  it('leaves an untouched form without asking', async () => {
    await setup('#/app/transactions/new?kind=expense');
    await screen.findByLabelText('Description');
    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app/transactions'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not ask after a successful save', async () => {
    const { user } = await setup('#/app/transactions/new?kind=expense');
    await user.type(await screen.findByLabelText('Amount (INR)'), '100');
    await user.type(screen.getByLabelText('Description'), 'Tea');
    await user.selectOptions(screen.getByLabelText('Category'), 'exp_office');
    await user.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(hash()).toBe('#/app/transactions'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('protects unsaved changes from browser Back too', async () => {
    const { user } = await setup('#/app');
    await screen.findByRole('heading', { name: 'Orbit Events' });
    await user.click(screen.getAllByRole('link', { name: /^Add$/ })[0]!);
    await user.type(await screen.findByLabelText('Description'), 'Draft');
    await act(async () => window.history.back());
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Description')).toHaveValue('Draft');
  });

  it('Settings: saving the profile clears the unsaved state', async () => {
    const { user } = await setup('#/app/settings');
    const name = await screen.findByLabelText('Business name');
    await user.clear(name);
    await user.type(name, 'Orbit Events Pvt Ltd');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved.');
    await pressBack();
    await waitFor(() => expect(hash()).toBe('#/app'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  }, 20_000);
});
