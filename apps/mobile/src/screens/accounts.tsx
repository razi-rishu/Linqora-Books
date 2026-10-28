import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeftRight, Banknote, Landmark, Plus, Scale, Wallet } from 'lucide-react';
import { accountBalances, isISODate, parseAmount, sumMinor, toDecimalString, type MoneyAccount } from '@linqora-books/accounting-core';
import { newId } from '@linqora-books/shared';
import { EmptyState, Money, PageHeader, ReadOnlyNotice, SampleBadge } from '@/components/common';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { useAccess, useActor, useBooks, useBooksMutation, useToday } from '@/data/books';
import { formatDate } from '@/lib/utils';

const KIND_ICON = { cash: Banknote, bank: Landmark, wallet: Wallet } as const;
const KIND_LABEL = { cash: 'Cash', bank: 'Bank account', wallet: 'Wallet / UPI' } as const;

function Reconcile({ account, balance }: { account: MoneyAccount; balance: number }) {
  const today = useToday();
  const actor = useActor();
  const mutation = useBooksMutation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Scale /> Reconcile
      </Button>
    );
  }
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const statement = parseAmount(value, account.currency, { allowNegative: true });
          const { userId, now } = actor();
          await mutation.mutateAsync({
            type: 'account',
            account: { ...account, reconciledBalance: statement, reconciledAt: today, updatedAt: now, updatedBy: userId },
          });
          setOpen(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Invalid amount');
        }
      }}
    >
      <Field label={`Statement balance today (app shows ${toDecimalString(balance, account.currency)})`} error={error ?? undefined} className="flex-1">
        {(p) => <Input {...p} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      <Button type="submit" size="md">
        Save
      </Button>
    </form>
  );
}

export function AccountsScreen() {
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const balances = accountBalances(data.accounts, data.transactions, today);
  const total = sumMinor(balances.map((b) => b.balance));
  const c = data.business.currency;

  return (
    <>
      <PageHeader
        title="Cash & bank"
        subtitle="Balances as of today"
        actions={
          access.canWrite && (
            <>
              <ButtonLink to="/app/transactions/new?kind=transfer" size="sm" variant="outline">
                <ArrowLeftRight /> Transfer
              </ButtonLink>
              <ButtonLink to="/app/accounts/new" size="sm">
                <Plus /> Add
              </ButtonLink>
            </>
          )
        }
      />
      <ReadOnlyNotice />
      {balances.length ? (
        <>
          <Card className="mb-4 bg-primary p-4 text-primary-foreground">
            <p className="text-sm opacity-90">Total cash & bank</p>
            <p className="text-3xl font-semibold">
              <Money amount={total} currency={c} />
            </p>
          </Card>
          <div className="space-y-3">
            {balances.map(({ account, balance, unreconciledDifference }) => {
              const Icon = KIND_ICON[account.kind];
              return (
                <Card key={account.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {KIND_LABEL[account.kind]} · opening <Money amount={account.openingBalance} currency={account.currency} /> on {formatDate(account.openingDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money amount={balance} currency={account.currency} className="font-semibold" />
                      <div>
                        <SampleBadge origin={account.origin} />
                      </div>
                    </div>
                  </div>
                  {account.reconciledAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reconciled {formatDate(account.reconciledAt)}:{' '}
                      {unreconciledDifference === 0 ? (
                        <span className="text-positive">matches statement ✓</span>
                      ) : (
                        <span className="text-warning">
                          statement differs by <Money amount={unreconciledDifference ?? 0} currency={account.currency} signed />
                        </span>
                      )}
                    </p>
                  )}
                  {access.canWrite && <Reconcile account={account} balance={balance} />}
                </Card>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Transfers between your accounts change individual balances but not the total, and are never counted as income or expenses.</p>
        </>
      ) : (
        <EmptyState icon={<Landmark />} title="No accounts yet" action={access.canWrite ? <ButtonLink to="/app/accounts/new">Add account</ButtonLink> : undefined}>
          Add your cash drawer, bank accounts and wallets with their opening balances.
        </EmptyState>
      )}
    </>
  );
}

const accountSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(60),
  kind: z.enum(['cash', 'bank', 'wallet']),
  openingBalance: z.string(),
  openingDate: z.string().refine(isISODate, 'Enter a valid date'),
});

export function AccountFormScreen() {
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const actor = useActor();
  const navigate = useNavigate();
  const mutation = useBooksMutation();
  const c = data.business.currency;
  const { register, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: '', kind: 'bank' as const, openingBalance: '0', openingDate: today },
  });
  const e = formState.errors;
  if (!access.canWrite) {
    return (
      <>
        <PageHeader title="New account" back />
        <ReadOnlyNotice />
      </>
    );
  }
  return (
    <>
      <PageHeader title="New account" back />
      <form
        noValidate
        className="space-y-4 md:max-w-xl"
        onSubmit={handleSubmit(async (v) => {
          let opening: number;
          try {
            opening = parseAmount(v.openingBalance || '0', c, { allowNegative: true });
          } catch (err) {
            setError('openingBalance', { message: err instanceof Error ? err.message : 'Invalid amount' });
            return;
          }
          const { userId, now } = actor();
          await mutation.mutateAsync({
            type: 'account',
            account: {
              id: newId('acc'),
              organizationId: data.business.id,
              createdAt: now,
              createdBy: userId,
              updatedAt: now,
              updatedBy: userId,
              origin: 'user',
              name: v.name,
              kind: v.kind,
              currency: c,
              openingBalance: opening,
              openingDate: v.openingDate,
              archived: false,
            },
          });
          navigate('/app/accounts', { replace: true });
        })}
      >
        <Field label="Account name" error={e.name?.message}>
          {(p) => <Input {...p} placeholder="e.g. HDFC current account" {...register('name')} />}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} {...register('kind')}>
              <option value="bank">Bank account</option>
              <option value="cash">Cash</option>
              <option value="wallet">Wallet / UPI</option>
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Opening balance (${c})`} error={e.openingBalance?.message} hint="Overdrafts can be negative">
            {(p) => <Input {...p} inputMode="decimal" {...register('openingBalance')} />}
          </Field>
          <Field label="As of" error={e.openingDate?.message}>
            {(p) => <Input {...p} type="date" {...register('openingDate')} />}
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Do not enter card numbers or banking passwords. Linqora Books never needs them.</p>
        <Button type="submit" block size="lg">
          Save account
        </Button>
      </form>
    </>
  );
}
