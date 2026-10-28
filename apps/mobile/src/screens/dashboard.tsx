import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, FilePlus2, HandCoins, Landmark, Plus, Users, Truck } from 'lucide-react';
import { dashboardSummary, financialYearOf, monthOf, type Period } from '@linqora-books/accounting-core';
import { Money, PageHeader, ProfitLoss, ReadOnlyNotice, StatTile } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { useAccess, useBooks, useToday } from '@/data/books';
import { TransactionRow } from './transactions';
import { cn } from '@/lib/utils';

type PeriodKey = 'month' | 'year';

export function DashboardScreen() {
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const period: Period = periodKey === 'month' ? monthOf(today) : financialYearOf(today, data.business.financialYearStartMonth);
  const s = dashboardSummary(data, period, today);
  const c = data.business.currency;
  const recent = [...data.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);

  return (
    <>
      <PageHeader
        title={data.business.name}
        subtitle={period.label}
        actions={
          access.canWrite ? (
            <ButtonLink to="/app/transactions/new" size="sm">
              <Plus /> Add
            </ButtonLink>
          ) : null
        }
      />
      <ReadOnlyNotice />

      <div role="tablist" aria-label="Period" className="mb-4 inline-flex rounded-xl bg-muted p-1">
        {(
          [
            ['month', 'This month'],
            ['year', 'Financial year'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={periodKey === key}
            onClick={() => setPeriodKey(key)}
            className={cn('h-9 rounded-lg px-4 text-sm font-medium', periodKey === key ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profit & loss</CardTitle>
              <p className="text-xs text-muted-foreground">Based on sales and bills recorded — not only cash received</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProfitLoss amount={s.profitAndLoss.profit} currency={c} size="lg" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Sales / revenue</dt>
                <dd className="font-semibold">
                  <Money amount={s.profitAndLoss.revenue.total} currency={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expenses</dt>
                <dd className="font-semibold">
                  <Money amount={s.profitAndLoss.expenses.total} currency={c} />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cash movement</CardTitle>
              <p className="text-xs text-muted-foreground">Money actually received and spent</p>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-positive-soft p-3">
                <dt className="flex items-center gap-1 text-positive">
                  <ArrowDownLeft className="size-4" aria-hidden="true" /> Money received
                </dt>
                <dd className="mt-1 text-lg font-semibold">
                  <Money amount={s.cash.moneyIn} currency={c} />
                </dd>
              </div>
              <div className="rounded-lg bg-negative-soft p-3">
                <dt className="flex items-center gap-1 text-negative">
                  <ArrowUpRight className="size-4" aria-hidden="true" /> Money spent
                </dt>
                <dd className="mt-1 text-lg font-semibold">
                  <Money amount={s.cash.moneyOut} currency={c} />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">
              Net cash: <Money amount={s.cash.net} currency={c} signed className="font-medium text-foreground" />
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/app/accounts" className="col-span-2 lg:col-span-2">
          <StatTile
            icon={<Landmark />}
            label="Cash & bank balance (today)"
            value={<Money amount={s.totalCashAndBank} currency={c} />}
            hint={s.accounts.map((a) => a.account.name).join(' · ') || 'No accounts yet'}
          />
        </Link>
        <Link to="/app/reports#receivables">
          <StatTile
            icon={<Users />}
            label="Customers owe you"
            value={<Money amount={s.receivable} currency={c} />}
            hint={s.overdueReceivable > 0 ? <span className="text-negative">Overdue: {<Money amount={s.overdueReceivable} currency={c} />}</span> : 'Nothing overdue'}
          />
        </Link>
        <Link to="/app/reports#payables">
          <StatTile icon={<Truck />} label="You owe suppliers" value={<Money amount={s.payable} currency={c} />} />
        </Link>
        {s.advancesHeld > 0 && (
          <Link to="/app/reports#advances" className="col-span-2 lg:col-span-4">
            <StatTile
              icon={<HandCoins />}
              label="Customer advances held"
              value={<Money amount={s.advancesHeld} currency={c} />}
              hint="Paid before invoicing — not counted as sales until applied to an invoice"
            />
          </Link>
        )}
      </div>

      {access.canWrite && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <ButtonLink to="/app/transactions/new?kind=income" variant="outline" className="h-auto flex-col py-3 text-xs">
            <ArrowDownLeft className="text-positive" /> Income
          </ButtonLink>
          <ButtonLink to="/app/transactions/new?kind=expense" variant="outline" className="h-auto flex-col py-3 text-xs">
            <ArrowUpRight className="text-negative" /> Expense
          </ButtonLink>
          <ButtonLink to="/app/documents/new?type=invoice" variant="outline" className="h-auto flex-col py-3 text-xs">
            <FilePlus2 className="text-primary" /> Invoice
          </ButtonLink>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <Link to="/app/transactions" className="flex items-center text-sm text-primary">
            All <ChevronRight className="size-4" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length ? (
            <ul className="divide-y">
              {recent.map((t) => (
                <TransactionRow key={t.id} txn={t} data={data} />
              ))}
            </ul>
          ) : (
            <p className="p-4 pt-0 text-sm text-muted-foreground">No transactions yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
