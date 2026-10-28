import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Check, FlaskConical, CalendarClock, ShieldCheck } from 'lucide-react';
import { formatMoney, todayInTimeZone } from '@linqora-books/accounting-core';
import { buildTrialTerms, INDIA_PLAN_PRICES, priceFor, yearlySaving, type BillingInterval } from '@linqora-books/billing';
import { BrandMark, TestModeBanner } from '@/components/common';
import { Button, ButtonLink } from '@/components/ui/button';
import { useSubscription } from '@/state/subscription';
import { useBooksQuery } from '@/data/books';
import { BILLING_MODE } from '@/config/env';
import { cn, formatDate } from '@/lib/utils';

const INCLUDED = [
  'Income, expenses and profit & loss',
  'Quotations, invoices and payments',
  'Customers, suppliers and projects',
  'Cash and bank accounts',
  'Reports with PDF and CSV export',
  'Website integrations (when available)',
];

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="pt-safe bg-warning-soft">
        <TestModeBanner />
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <BrandMark className="mb-6" />
        {children}
      </div>
    </div>
  );
}

function useAfterSubscriptionRoute() {
  const { data } = useBooksQuery();
  return data ? '/app' : '/setup';
}

export function SubscriptionIntroScreen() {
  const navigate = useNavigate();
  const markIntroSeen = useSubscription((s) => s.markIntroSeen);
  const next = useAfterSubscriptionRoute();
  const [interval, setPlan] = useState<BillingInterval>('yearly');
  const saving = yearlySaving();

  return (
    <Layout>
      <h1 className="text-2xl font-semibold tracking-tight">Try everything free for one month</h1>
      <p className="mt-1 text-sm text-muted-foreground">Full access during the trial. Choose how you'd like to pay afterwards.</p>

      <fieldset className="mt-6 space-y-3">
        <legend className="sr-only">Billing period</legend>
        {INDIA_PLAN_PRICES.map((price) => (
          <label
            key={price.planId}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4 transition-colors',
              interval === price.interval && 'border-primary ring-2 ring-primary/30',
            )}
          >
            <input
              type="radio"
              name="interval"
              value={price.interval}
              checked={interval === price.interval}
              onChange={() => setPlan(price.interval)}
              className="size-5 accent-[var(--primary)]"
            />
            <div className="flex-1">
              <p className="font-medium capitalize">{price.interval}</p>
              {price.interval === 'yearly' && saving > 0 && (
                <p className="text-xs text-positive">Save {formatMoney(saving, price.currency)} compared with monthly</p>
              )}
            </div>
            <p className="tabular text-right">
              <span className="text-lg font-semibold">{formatMoney(price.amount, price.currency)}</span>
              <span className="text-sm text-muted-foreground">/{price.interval === 'yearly' ? 'year' : 'month'}</span>
            </p>
          </label>
        ))}
      </fieldset>
      <p className="mt-2 text-xs text-muted-foreground">Provisional India prices. The final price is always confirmed by the payment provider at checkout.</p>

      <ul className="mt-6 space-y-2">
        {INCLUDED.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-primary" aria-hidden="true" /> {item}
          </li>
        ))}
      </ul>

      <div className="mt-8 space-y-3">
        <ButtonLink to={`/subscribe/trial?plan=${interval}`} block size="lg">
          Continue to free trial
        </ButtonLink>
        <Button
          variant="ghost"
          block
          onClick={() => {
            markIntroSeen();
            navigate(next, { replace: true });
          }}
        >
          Not now — explore in view-only mode
        </Button>
      </div>
    </Layout>
  );
}

export function TrialScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const interval: BillingInterval = params.get('plan') === 'monthly' ? 'monthly' : 'yearly';
  const { data } = useBooksQuery();
  const today = todayInTimeZone(data?.business.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const terms = buildTrialTerms(priceFor(interval), today);
  const { startTestTrial, entitlement } = useSubscription();
  const next = useAfterSubscriptionRoute();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadyUsed = Boolean(entitlement.trialStartedAt);

  const rows: [string, string][] = [
    ['Plan', `Linqora Books — ${interval}`],
    ['Free trial', `${formatDate(terms.trialStart)} to ${formatDate(terms.firstBillingDate)}`],
    ['First charge', `${formatMoney(terms.price.amount, terms.price.currency)} on ${formatDate(terms.firstBillingDate)}`],
    ['Then', `${formatMoney(terms.price.amount, terms.price.currency)} every ${interval === 'yearly' ? 'year' : 'month'} until you cancel`],
    ['Currency', terms.price.currency],
  ];

  return (
    <Layout>
      <h1 className="text-2xl font-semibold tracking-tight">Your one-month free trial</h1>
      <p className="mt-1 text-sm text-muted-foreground">Review the details before you authorise automatic payments.</p>

      <dl className="mt-6 divide-y rounded-xl border bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 p-3.5 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-3 text-sm">
        <p className="flex gap-2">
          <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
          We'll remind you before the trial ends.
        </p>
        <p className="flex gap-2">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {terms.cancellationSummary}
        </p>
      </div>

      <div className="mt-6 rounded-xl border-2 border-dashed border-warning bg-warning-soft p-4 text-sm text-warning">
        <p className="flex items-center gap-2 font-semibold">
          <FlaskConical className="size-4" aria-hidden="true" /> TEST MODE — no payment will be authorised
        </p>
        <p className="mt-1">
          This prototype is not connected to any payment provider. Continuing creates a <strong>test entitlement</strong> on
          this device only. It does not start a real trial, does not grant production access and nothing will ever be
          charged.
        </p>
      </div>

      {alreadyUsed ? (
        <p className="mt-6 rounded-xl bg-muted p-3 text-sm">A trial has already been used. Manage your plan from Subscription.</p>
      ) : (
        <>
          <label className="mt-6 flex items-start gap-3 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
            <span>
              I have reviewed the amount, first billing date and cancellation terms. In the live app I would now authorise
              recurring payments with the payment provider.
            </span>
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm text-negative">
              {error}
            </p>
          )}
          <Button
            className="mt-4"
            block
            size="lg"
            disabled={!agreed || BILLING_MODE !== 'test'}
            onClick={async () => {
              try {
                await startTestTrial(interval, today);
                navigate(next, { replace: true });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not start trial');
              }
            }}
          >
            Start TEST MODE trial
          </Button>
        </>
      )}
      <Button variant="ghost" block className="mt-2" onClick={() => navigate(-1)}>
        Back
      </Button>
    </Layout>
  );
}
