import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarClock, Download, FlaskConical, Monitor, Moon, Sun, Trash2, Database, Users } from 'lucide-react';
import { formatMoney } from '@linqora-books/accounting-core';
import { evaluateAccess, isProductionAuthorized, priceFor } from '@linqora-books/billing';
import { ROLE_LABELS, ORGANIZATION_ROLES } from '@linqora-books/shared';
import { PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hasSampleData, useBooks, useBooksMutation, useToday } from '@/data/books';
import { useSubscription } from '@/state/subscription';
import { usePreferences, type ThemePreference } from '@/state/preferences';
import { useSession } from '@/state/session';
import { BusinessForm } from './business';
import { cn, downloadText, formatDate } from '@/lib/utils';

export function SettingsScreen() {
  const data = useBooks();
  const mutation = useBooksMutation();
  const navigate = useNavigate();
  const { theme, setTheme } = usePreferences();
  const resetSubscription = useSubscription((s) => s.reset);
  const signOut = useSession((s) => s.signOut);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const sample = hasSampleData(data);
  const hasRecords = data.transactions.length + data.documents.length > 0;

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
              currencyLocked={hasRecords}
              submitLabel="Save changes"
              onSubmit={async (business) => {
                await mutation.mutateAsync({ type: 'business', business });
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
              }}
            />
            {saved && (
              <p role="status" className="mt-2 text-sm text-positive">
                Saved.
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
            <p className="flex items-start gap-2 text-muted-foreground">
              <Database className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Stored only on this device (prototype). There is no cloud backup yet — clearing app data or uninstalling deletes it.
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
                      await mutation.mutateAsync({ type: 'removeSample' });
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
                        await mutation.mutateAsync({ type: 'clear' });
                        resetSubscription();
                        signOut();
                        navigate('/welcome', { replace: true });
                      }}
                    >
                      Erase everything
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="text-negative" onClick={() => setConfirmReset(true)}>
                  <Trash2 /> Reset local prototype
                </Button>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Account deletion for cloud accounts will be available with Phase 2.</p>
            </div>
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

export function SubscriptionScreen() {
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
