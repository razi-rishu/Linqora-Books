import { useState, type ReactNode } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  accountBalances,
  addCalendarMonths,
  addDays,
  cashFlow,
  customerAdvances,
  financialYearOf,
  monthlyReport,
  monthOf,
  payables,
  profitAndLoss,
  projectProfitability,
  receivables,
  toDecimalString,
  type Period,
} from '@linqora-books/accounting-core';
import { Money, PageHeader, ProfitLoss } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { hasSampleData, useBooks, useToday } from '@/data/books';
import { downloadText, toCsv } from '@/lib/utils';

type PeriodKey = 'this_month' | 'last_month' | 'this_fy' | 'last_fy';

function Section({ id, title, action, children }: { id?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20 break-inside-avoid">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action && <div className="no-print">{action}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? 'border-t font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function ReportsScreen() {
  const data = useBooks();
  const today = useToday();
  const [key, setKey] = useState<PeriodKey>('this_fy');
  const fyStart = data.business.financialYearStartMonth;
  const c = data.business.currency;
  const periods: Record<PeriodKey, Period> = {
    this_month: monthOf(today),
    last_month: monthOf(addCalendarMonths(monthOf(today).start, -1)),
    this_fy: financialYearOf(today, fyStart),
    last_fy: financialYearOf(addDays(financialYearOf(today, fyStart).start, -1), fyStart),
  };
  const period = periods[key];
  const pl = profitAndLoss(data, period, c);
  const cf = cashFlow(data.transactions, period, c);
  const months = monthlyReport(data, period, c);
  const rec = receivables(data, today);
  const pay = payables(data, today);
  const adv = customerAdvances(data.transactions, today);
  const balances = accountBalances(data.accounts, data.transactions, period.end < today ? period.end : today);
  const contactName = (id: string) => data.contacts.find((x) => x.id === id)?.name ?? 'Unknown';
  const categoryName = (id: string) => data.categories.find((x) => x.id === id)?.name ?? 'Uncategorised';
  const sample = hasSampleData(data);
  const money = (v: number) => toDecimalString(v, c);
  const exportCsv = (name: string, rows: (string | number)[][]) => {
    const header: (string | number)[][] = [
      [`${data.business.name} — ${name}`],
      [`Period: ${period.label} (${period.start} to ${period.end})`, `Currency: ${c}`],
      ...(sample ? [['SAMPLE DATA INCLUDED — not real accounting records']] : []),
      [],
    ];
    downloadText(`linqora-books-${name.toLowerCase().replace(/\W+/g, '-')}-${period.start}.csv`, toCsv([...header, ...rows]));
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${period.label} · ${period.start} to ${period.end}`}
        actions={
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer /> <span className="hidden sm:inline">Print / PDF</span>
          </Button>
        }
      />
      <div className="no-print mb-4">
        <label className="sr-only" htmlFor="period">
          Period
        </label>
        <Select id="period" value={key} onChange={(e) => setKey(e.target.value as PeriodKey)} className="max-w-xs">
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="this_fy">This financial year</option>
          <option value="last_fy">Last financial year</option>
        </Select>
      </div>
      {sample && <p className="mb-4 rounded-xl bg-warning-soft p-3 text-sm text-warning">These reports include sample records and are not real financial statements.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Profit & loss"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                exportCsv('Profit and loss', [
                  ['Line', 'Amount'],
                  ['Invoiced sales (before tax)', money(pl.revenue.invoiced)],
                  ['Direct income', money(pl.revenue.directIncome)],
                  ['Refunds', money(-pl.revenue.refunds)],
                  ['Total revenue', money(pl.revenue.total)],
                  ['Supplier bills (before tax)', money(pl.expenses.bills)],
                  ['Direct expenses', money(pl.expenses.directExpenses)],
                  ['Total expenses', money(pl.expenses.total)],
                  [pl.profit >= 0 ? 'Profit' : 'Loss', money(pl.profit)],
                  [],
                  ['Income by category', ''],
                  ...Object.entries(pl.incomeByCategory).map(([k, v]) => [categoryName(k), money(v)]),
                  ['Expenses by category', ''],
                  ...Object.entries(pl.expensesByCategory).map(([k, v]) => [categoryName(k), money(v)]),
                ])
              }
            >
              <Download /> CSV
            </Button>
          }
        >
          <ProfitLoss amount={pl.profit} currency={c} size="lg" />
          <div className="mt-3">
            <Row label="Invoiced sales (before tax)">
              <Money amount={pl.revenue.invoiced} currency={c} />
            </Row>
            <Row label="Direct income">
              <Money amount={pl.revenue.directIncome} currency={c} />
            </Row>
            <Row label="Refunds">
              <Money amount={-pl.revenue.refunds} currency={c} />
            </Row>
            <Row label="Total revenue" strong>
              <Money amount={pl.revenue.total} currency={c} />
            </Row>
            <Row label="Supplier bills (before tax)">
              <Money amount={pl.expenses.bills} currency={c} />
            </Row>
            <Row label="Direct expenses">
              <Money amount={pl.expenses.directExpenses} currency={c} />
            </Row>
            <Row label="Total expenses" strong>
              <Money amount={pl.expenses.total} currency={c} />
            </Row>
          </div>
        </Section>

        <Section title="Income & expense by category">
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Income</p>
          {Object.entries(pl.incomeByCategory).map(([k, v]) => (
            <Row key={k} label={categoryName(k)}>
              <Money amount={v} currency={c} />
            </Row>
          ))}
          {!Object.keys(pl.incomeByCategory).length && <p className="text-sm text-muted-foreground">No income in this period.</p>}
          <p className="mt-3 mb-1 text-xs font-semibold text-muted-foreground uppercase">Expenses</p>
          {Object.entries(pl.expensesByCategory).map(([k, v]) => (
            <Row key={k} label={categoryName(k)}>
              <Money amount={v} currency={c} />
            </Row>
          ))}
          {!Object.keys(pl.expensesByCategory).length && <p className="text-sm text-muted-foreground">No expenses in this period.</p>}
        </Section>

        <Section
          title="Monthly summary"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                exportCsv('Monthly summary', [
                  ['Month', 'Revenue', 'Expenses', 'Profit/loss', 'Money in', 'Money out'],
                  ...months.map((m) => [m.period.label, money(m.revenue), money(m.expenses), money(m.profit), money(m.moneyIn), money(m.moneyOut)]),
                ])
              }
            >
              <Download /> CSV
            </Button>
          }
        >
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1 font-medium">Month</th>
                  <th className="px-2 py-1 text-right font-medium">Revenue</th>
                  <th className="px-2 py-1 text-right font-medium">Expenses</th>
                  <th className="px-2 py-1 text-right font-medium">Profit / loss</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.period.start} className="border-t">
                    <td className="px-2 py-1.5">{m.period.label}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Money amount={m.revenue} currency={c} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Money amount={m.expenses} currency={c} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">
                      <Money amount={m.profit} currency={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Cash & bank summary">
          <Row label="Money received">
            <Money amount={cf.moneyIn} currency={c} />
          </Row>
          <Row label="Money spent">
            <Money amount={cf.moneyOut} currency={c} />
          </Row>
          <Row label="Net cash movement" strong>
            <Money amount={cf.net} currency={c} signed />
          </Row>
          <p className="mt-3 mb-1 text-xs font-semibold text-muted-foreground uppercase">Balances at {period.end < today ? period.end : 'today'}</p>
          {balances.map((b) => (
            <Row key={b.account.id} label={b.account.name}>
              <Money amount={b.balance} currency={c} />
            </Row>
          ))}
        </Section>

        <Section
          id="receivables"
          title="Customer receivables (today)"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => exportCsv('Receivables', [['Customer', 'Outstanding', 'Overdue', 'Invoices'], ...rec.map((r) => [contactName(r.contactId), money(r.outstanding), money(r.overdue), r.documentCount])])}
            >
              <Download /> CSV
            </Button>
          }
        >
          {rec.length ? (
            rec.map((r) => (
              <Row key={r.contactId} label={`${contactName(r.contactId)} (${r.documentCount})`}>
                <Money amount={r.outstanding} currency={c} />
                {r.overdue > 0 && (
                  <span className="ml-2 text-xs text-negative">
                    overdue <Money amount={r.overdue} currency={c} />
                  </span>
                )}
              </Row>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No customer owes you anything.</p>
          )}
        </Section>

        <Section
          id="payables"
          title="Supplier payables (today)"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => exportCsv('Payables', [['Supplier', 'Outstanding', 'Overdue', 'Bills'], ...pay.map((r) => [contactName(r.contactId), money(r.outstanding), money(r.overdue), r.documentCount])])}
            >
              <Download /> CSV
            </Button>
          }
        >
          {pay.length ? (
            pay.map((r) => (
              <Row key={r.contactId} label={`${contactName(r.contactId)} (${r.documentCount})`}>
                <Money amount={r.outstanding} currency={c} />
              </Row>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">You don't owe any supplier.</p>
          )}
        </Section>

        <Section
          id="advances"
          title="Customer advances held (today)"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                exportCsv('Customer advances', [
                  ['Customer', 'Advance date', 'Description', 'Unused amount'],
                  ...adv.flatMap((a) => a.advances.map((x) => [contactName(a.contactId), x.advance.date, x.advance.description, money(x.remaining)])),
                ])
              }
            >
              <Download /> CSV
            </Button>
          }
        >
          {adv.length ? (
            <>
              {adv.map((a) => (
                <Row key={a.contactId} label={`${contactName(a.contactId)} (${a.advances.length})`}>
                  <Money amount={a.held} currency={c} />
                </Row>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">Money received before invoicing. Owed to the customer until applied to an invoice or refunded; not sales.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No unused customer advances.</p>
          )}
        </Section>

        {data.business.modules.projects && (
          <Section title="Project profitability (all time)">
            {data.projects.length ? (
              data.projects.map((p) => {
                const r = projectProfitability(p, data);
                return (
                  <Row key={p.id} label={p.name}>
                    <Money amount={r.realizedProfit} currency={c} />
                    <span className="ml-2 text-xs text-muted-foreground">
                      est. <Money amount={r.estimatedProfit} currency={c} />
                    </span>
                  </Row>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No projects.</p>
            )}
          </Section>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Revenue and expenses exclude tax shown on invoices and bills. Linqora Books is a small-business finance tracker, not certified tax or statutory accounting
        software — consult your accountant for filings.
      </p>
    </>
  );
}
