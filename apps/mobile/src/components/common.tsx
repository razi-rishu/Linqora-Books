import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, FlaskConical, Lock, TrendingDown, TrendingUp, Minus, Database } from 'lucide-react';
import { formatMoney, type CurrencyCode, type MinorUnits } from '@linqora-books/accounting-core';
import type { PaymentStatus } from '@linqora-books/accounting-core';
import { Badge } from './ui/badge';
import { ButtonLink } from './ui/button';
import { cn } from '@/lib/utils';
import { useAccess } from '@/data/books';

export function BrandMark({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" className="fill-primary" />
        <path d="M18 16h8v26h20v8H18z" className="fill-primary-foreground" />
        <circle cx="44" cy="22" r="6" fill="#a5b4fc" />
      </svg>
      {withName && (
        <span className="text-lg font-semibold tracking-tight">
          Linqora <span className="text-primary">Books</span>
        </span>
      )}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-4 flex items-start gap-2">
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted no-print"
          aria-label="Go back"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-0.5 no-print">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-6">{icon}</div>
      <h2 className="font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Money({ amount, currency, className, signed }: { amount: MinorUnits; currency: CurrencyCode; className?: string; signed?: boolean }) {
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>{formatMoney(amount, currency, signed ? { signDisplay: 'always' } : {})}</span>
  );
}

/** Profit or loss shown with words and an icon, never colour alone. */
export function ProfitLoss({ amount, currency, size = 'md' }: { amount: MinorUnits; currency: CurrencyCode; size?: 'md' | 'lg' }) {
  const kind = amount > 0 ? 'Profit' : amount < 0 ? 'Loss' : 'Break-even';
  const Icon = amount > 0 ? TrendingUp : amount < 0 ? TrendingDown : Minus;
  const tone = amount > 0 ? 'text-positive' : amount < 0 ? 'text-negative' : 'text-muted-foreground';
  return (
    <div className={cn('flex flex-col', tone)}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
        <Icon className="size-3.5" aria-hidden="true" /> {kind}
      </span>
      <span className={cn('tabular font-semibold', size === 'lg' ? 'text-3xl' : 'text-lg')}>{formatMoney(amount, currency)}</span>
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'primary' | 'positive' | 'negative' | 'warning' | 'brand' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'brand' },
  accepted: { label: 'Accepted', tone: 'primary' },
  rejected: { label: 'Rejected', tone: 'negative' },
  converted: { label: 'Converted to invoice', tone: 'positive' },
  issued: { label: 'Issued', tone: 'brand' },
  void: { label: 'Void', tone: 'neutral' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
  partially_paid: { label: 'Partly paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'positive' },
  overdue: { label: 'Overdue', tone: 'negative' },
  posted: { label: 'Posted', tone: 'neutral' },
};

export function StatusBadge({ status }: { status: PaymentStatus | string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SampleBadge({ origin }: { origin: string }) {
  if (origin !== 'sample') return null;
  return (
    <Badge tone="warning" title="Sample record for exploring the app — not real financial data">
      Sample
    </Badge>
  );
}

/** Persistent strip: this build is a local prototype with no real billing or cloud sync. */
export function TestModeBanner() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warning-soft px-3 py-1.5 text-center text-xs font-medium text-warning">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <strong>TEST MODE</strong> · Local prototype · No real payments · Data stays on this device
      </span>
    </div>
  );
}

export function SampleDataBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
      <Database className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>Sample data is loaded.</strong> Records marked “Sample” are examples for exploring the app, not real
        accounting data. Remove them in{' '}
        <Link to="/app/settings" className="underline">
          Settings
        </Link>{' '}
        before entering your own books.
      </p>
    </div>
  );
}

/** Shown in place of "add" actions when the subscription does not allow changes. */
export function ReadOnlyNotice() {
  const access = useAccess();
  if (access.canWrite) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border bg-muted p-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">View-only</p>
        <p className="text-muted-foreground">{access.reason} You can still view and export everything.</p>
      </div>
      <ButtonLink to="/app/subscription" size="sm" variant="outline">
        Subscription
      </ButtonLink>
    </div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
