import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarClock, Cloud, Download, FlaskConical, LogOut, Monitor, Moon, ShieldCheck, Sun, Trash2, Database, Upload, Users } from 'lucide-react';
import { formatMoney, isCurrencyLocked } from '@linqora-books/accounting-core';
import { evaluateAccess, isProductionAuthorized, priceFor } from '@linqora-books/billing';
import { ROLE_LABELS, ORGANIZATION_ROLES } from '@linqora-books/shared';
import { PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hasSampleData, useBooks, useBooksMutation, useEntitlement, useToday } from '@/data/books';
import { useSubscription } from '@/state/subscription';
import { usePreferences, type ThemePreference } from '@/state/preferences';
import { signOut } from '@/auth/sign-out';
import { useCurrentUser } from '@/auth/auth-store';
import { DATA_MODE } from '@/config/env';

const CLOUD = DATA_MODE === 'cloud';
import { BusinessForm } from './business';
import { cn, downloadText, formatDate } from '@/lib/utils';
import { useBackHandler } from '@/navigation/use-back-handler';

export function SettingsScreen() {
  const data = useBooks();
  const mutation = useBooksMutation();
  const navigate = useNavigate();
  const { theme, setTheme } = usePreferences();
  const resetSubscription = useSubscription((s) => s.reset);
  const user = useCurrentUser();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useBackHandler(confirmReset, () => setConfirmReset(false));
  const sample = hasSampleData(data);
  const currencyLocked = isCurrencyLocked(data);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Business profile</CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessForm
              existing={data.business}
              currencyLocked={currencyLocked}
              submitLabel="Save changes"
              onSubmit={async (business) => {
                setProfileError(null);
                try {
                  await mutation.mutateAsync({ silent: true, type: 'business', business });
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2500);
                } catch (err) {
                  setProfileError(err instanceof Error ? err.message : 'Could not save');
                  return false;
                }
              }}
            />
            {saved && (
              <p role="status" className="mt-2 text-sm text-positive">
                Saved.
              </p>
            )}
            {profileError && (
              <p role="alert" className="mt-2 text-sm text-negative">
                {profileError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
              {(
                [
                  ['system', 'System', Monitor],
                  ['light', 'Light', Sun],
                  ['dark', 'Dark', Moon],
                ] as [ThemePreference, string, typeof Sun][]
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => setTheme(value)}
                  className={cn('flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm', theme === value && 'border-primary bg-primary-soft text-primary')}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team members</CardTitle>
            <Badge>Coming later</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> With cloud accounts you will be able to invite people with these roles:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {ORGANIZATION_ROLES.map((r) => (
                <li key={r}>
                  <Badge tone="neutral">{ROLE_LABELS[r]}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {CLOUD ? (
              <>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <Cloud className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Your books are stored in your Linqora Books cloud account and are available on any device where you sign in.
                </p>
                <p className="text-muted-foreground">Signed in as {user?.email}.</p>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink to="/app/import" variant="outline" size="sm">
                    <Upload /> Import records from this device
                  </ButtonLink>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadText(`linqora-books-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')}
                  >
                    <Download /> Export (JSON, browser only)
                  </Button>
                </div>
                <div className="border-t pt-3">
                  <Button variant="ghost" className="text-negative" onClick={() => void signOut().then(() => navigate('/welcome', { replace: true }))}>
                    <LogOut /> Sign out
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deleting your account and business data is done on request in this version — see Help. Self-service deletion
                    comes with the account settings in a later phase.
                  </p>
                </div>
              </>
            ) : (
              <>
            <p className="flex items-start gap-2 text-muted-foreground">
              <Database className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Stored only on this device (local preview). There is no cloud backup — clearing app data or uninstalling deletes it.
            </p>
            <Button
              variant="outline"
              onClick={() => downloadText(`linqora-books-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')}
            >
              <Download /> Export full backup (JSON)
            </Button>
            {sample && (
              <div className="rounded-xl bg-warning-soft p-3 text-warning">
                <p>Sample records are loaded.</p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setError(null);
                    try {
                      await mutation.mutateAsync({ silent: true, type: 'removeSample' });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not remove sample data');
                    }
                  }}
                >
                  <Trash2 /> Remove sample data
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-negative">
                {error}
              </p>
            )}
            <div className="border-t pt-3">
              {confirmReset ? (
                <div className="space-y-2">
                  <p className="font-medium text-negative">Erase all Linqora Books data on this device? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={async () => {
                        try {
                          await mutation.mutateAsync({ type: 'clear' });
                        } catch {
                          return; // shown by the "Not saved" message; the form keeps what was typed
                        }
                        resetSubscription();
                        await signOut();
                        navigate('/welcome', { replace: true });
                      }}
                    >
                      Erase everything
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="text-negative" onClick={() => setConfirmReset(true)}>
                  <Trash2 /> Reset local preview
                </Button>
              )}
            </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const STATUS_TEXT: Record<string, string> = {
  none: 'No trial or subscription',
  trialing: 'Free trial',
  active: 'Active',
  cancelled_active: 'Cancelled — access until period end',
  grace_period: 'Payment problem — grace period',
  expired: 'Expired — view and export only',
  complimentary: 'Complimentary access',
};

function LocalSubscriptionScreen() {
  const today = useToday();
  const { entitlement, cancel, resume, simulateExpiry, reset } = useSubscription();
  const access = evaluateAccess(entitlement, today);
  const price = entitlement.interval ? priceFor(entitlement.interval) : null;

  return (
    <>
      <PageHeader title="Subscription" />
      <div className="mb-4 rounded-xl border-2 border-dashed border-warning bg-warning-soft p-4 text-sm text-warning">
        <p className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-4" aria-hidden="true" /> TEST MODE
        </p>
        <p className="mt-1">
          Everything on this screen is simulated on this device. No payment provider is connected and nothing is charged.
          {isProductionAuthorized(entitlement) ? '' : ' This is not production access.'}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge tone={access.canWrite ? 'positive' : 'warning'}>{STATUS_TEXT[entitlement.status]}</Badge>
          </div>
          {price && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">
                {formatMoney(price.amount, price.currency)} / {price.interval === 'yearly' ? 'year' : 'month'} <span className="text-xs text-muted-foreground">(provisional)</span>
              </span>
            </div>
          )}
          {entitlement.trialEndsAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trial ends</span>
              <span>{formatDate(entitlement.trialEndsAt)}</span>
            </div>
          )}
          {entitlement.nextBillingDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next billing date</span>
              <span>{formatDate(entitlement.nextBillingDate)}</span>
            </div>
          )}
          {entitlement.accessEndsAt && !entitlement.autoRenew && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Access until</span>
              <span>{formatDate(entitlement.accessEndsAt)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Auto-renew</span>
            <span>{entitlement.autoRenew ? 'On' : 'Off'}</span>
          </div>
          <p className="rounded-lg bg-muted p-3 text-muted-foreground">
            <CalendarClock className="mr-1 inline size-4" aria-hidden="true" />
            {access.canWrite ? 'You can add and change records.' : access.reason} Viewing, exporting and backups are always available.
          </p>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        {entitlement.status === 'none' && <ButtonLink to="/subscribe">Start free trial</ButtonLink>}
        {entitlement.status === 'expired' && <ButtonLink to="/subscribe">See plans</ButtonLink>}
        {entitlement.autoRenew && (
          <Button variant="outline" onClick={() => cancel(today)}>
            Cancel auto-renewal
          </Button>
        )}
        {!entitlement.autoRenew && ['trialing', 'cancelled_active'].includes(entitlement.status) && <Button onClick={() => resume(today)}>Turn auto-renew back on</Button>}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Test controls</CardTitle>
          <Badge tone="warning">Developer</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={entitlement.status === 'none' || entitlement.status === 'expired'} onClick={() => simulateExpiry(today)}>
            Simulate expiry (view-only mode)
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset test subscription
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export function SubscriptionScreen() {
  return CLOUD ? <CloudAccessScreen /> : <LocalSubscriptionScreen />;
}

/**
 * Cloud build: access is decided by the server. Billing is not connected in this
 * phase, so nothing here can start a trial, take a payment or change access.
 */
function CloudAccessScreen() {
  const today = useToday();
  const { entitlement } = useEntitlement();
  const access = evaluateAccess(entitlement, today);
  const development = entitlement.source === 'development' || entitlement.environment === 'test';
  const label = entitlement.status === 'none' ? 'Not activated' : development ? 'Development test access' : STATUS_TEXT[entitlement.status];

  return (
    <>
      <PageHeader title="Subscription & access" />
      <div className="mb-4 rounded-xl border-2 border-dashed border-warning bg-warning-soft p-4 text-sm text-warning">
        <p className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-4" aria-hidden="true" /> Billing is not available yet
        </p>
        <p className="mt-1">
          This development build cannot start trials or take payments, and never asks for card or UPI details. Planned pricing:
          one-month free trial, then {formatMoney(priceFor('monthly').amount, 'INR')}/month or {formatMoney(priceFor('yearly').amount, 'INR')}/year
          (provisional).
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Access</span>
            <Badge tone={access.canWrite ? 'positive' : 'warning'}>{label}</Badge>
          </div>
          {entitlement.accessEndsAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Access until</span>
              <span>{formatDate(entitlement.accessEndsAt)}</span>
            </div>
          )}
          <p className="flex gap-2 rounded-lg bg-muted p-3 text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            {access.canWrite
              ? development
                ? 'Granted by Linqora for testing. It is not a paid subscription.'
                : 'You can add and change records.'
              : 'You can view and export your books. Adding or changing records needs access to be activated by Linqora during testing.'}
          </p>
          <p className="text-xs text-muted-foreground">Access is checked by the server on every change; it cannot be altered from this phone.</p>
        </CardContent>
      </Card>
    </>
  );
}
