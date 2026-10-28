import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Ban, Paperclip, Plus, RotateCcw, Search, Receipt } from 'lucide-react';
import {
  isISODate,
  parseAmount,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  validateTransaction,
  voidTransaction,
  type BooksData,
  type Transaction,
  type TransactionKind,
} from '@linqora-books/accounting-core';
import { newId } from '@linqora-books/shared';
import { EmptyState, Money, PageHeader, ReadOnlyNotice, SampleBadge, StatusBadge } from '@/components/common';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { useAccess, useActor, useBooks, useBooksMutation, useToday } from '@/data/books';
import { cn, formatDate } from '@/lib/utils';

const KIND_META: Record<TransactionKind, { label: string; direction: 'in' | 'out' | 'move' }> = {
  income: { label: 'Income', direction: 'in' },
  expense: { label: 'Expense', direction: 'out' },
  payment_received: { label: 'Payment received', direction: 'in' },
  payment_made: { label: 'Payment made', direction: 'out' },
  refund_given: { label: 'Refund given', direction: 'out' },
  transfer: { label: 'Transfer', direction: 'move' },
};

function KindIcon({ kind }: { kind: TransactionKind }) {
  const dir = KIND_META[kind].direction;
  const Icon = dir === 'in' ? ArrowDownLeft : dir === 'out' ? (kind === 'refund_given' ? RotateCcw : ArrowUpRight) : ArrowLeftRight;
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full',
        dir === 'in' && 'bg-positive-soft text-positive',
        dir === 'out' && 'bg-negative-soft text-negative',
        dir === 'move' && 'bg-brand-soft text-brand',
      )}
      aria-hidden="true"
    >
      <Icon className="size-4.5" />
    </span>
  );
}

export function TransactionRow({ txn, data }: { txn: Transaction; data: BooksData }) {
  const meta = KIND_META[txn.kind];
  const account = data.accounts.find((a) => a.id === txn.accountId);
  const contact = data.contacts.find((c) => c.id === txn.contactId);
  const sign = meta.direction === 'in' ? '+' : meta.direction === 'out' ? '−' : '';
  return (
    <li>
      <Link to={`/app/transactions/${txn.id}`} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/60', txn.status === 'void' && 'opacity-60')}>
        <KindIcon kind={txn.kind} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', txn.status === 'void' && 'line-through')}>{txn.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {meta.label} · {formatDate(txn.date)}
            {contact ? ` · ${contact.name}` : ''}
            {account ? ` · ${account.name}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('tabular text-sm font-semibold', meta.direction === 'in' && 'text-positive', meta.direction === 'out' && 'text-negative')}>
            {sign}
            <Money amount={txn.amount} currency={txn.currency} />
          </span>
          <span className="flex gap-1">
            {txn.status === 'void' && <StatusBadge status="void" />}
            <SampleBadge origin={txn.origin} />
          </span>
        </div>
      </Link>
    </li>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Income' },
  { key: 'out', label: 'Expenses' },
  { key: 'move', label: 'Transfers' },
] as const;

export function TransactionsScreen() {
  const data = useBooks();
  const access = useAccess();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions
      .filter((t) => filter === 'all' || KIND_META[t.kind].direction === filter)
      .filter((t) => !q || t.description.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1));
  }, [data.transactions, filter, query]);

  return (
    <>
      <PageHeader
        title="Income & expenses"
        subtitle="Every rupee in and out"
        actions={
          access.canWrite && (
            <ButtonLink to="/app/transactions/new" size="sm">
              <Plus /> Add
            </ButtonLink>
          )
        }
      />
      <ReadOnlyNotice />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search transactions" placeholder="Search description or reference" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn('h-11 shrink-0 rounded-xl px-4 text-sm font-medium', filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <Card>
          <ul className="divide-y">
            {list.map((t) => (
              <TransactionRow key={t.id} txn={t} data={data} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<Receipt />}
          title={query || filter !== 'all' ? 'No matching transactions' : 'No transactions yet'}
          action={
            access.canWrite && !query ? (
              <ButtonLink to="/app/transactions/new">
                <Plus /> Add your first entry
              </ButtonLink>
            ) : undefined
          }
        >
          Record sales, expenses, refunds and transfers between your cash and bank accounts.
        </EmptyState>
      )}
    </>
  );
}

const ENTRY_KINDS = ['income', 'expense', 'refund_given', 'transfer'] as const;

const transactionSchema = z
  .object({
    kind: z.enum(ENTRY_KINDS),
    date: z.string().refine(isISODate, 'Enter a valid date'),
    amount: z.string().min(1, 'Enter an amount'),
    accountId: z.string().min(1, 'Choose an account'),
    toAccountId: z.string(),
    contactId: z.string(),
    categoryId: z.string(),
    projectId: z.string(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().max(60),
    description: z.string().trim().min(2, 'Add a short description').max(140),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'transfer') {
      if (!v.toAccountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose where the money goes' });
      else if (v.toAccountId === v.accountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose a different account' });
    } else if (!v.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category' });
    }
  });

type TransactionValues = z.infer<typeof transactionSchema>;

export function AddTransactionScreen() {
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const actor = useActor();
  const navigate = useNavigate();
  const mutation = useBooksMutation();
  const [params] = useSearchParams();
  const initialKind = (ENTRY_KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as TransactionValues['kind']) : 'income';
  const currency = data.business.currency;
  const accounts = data.accounts.filter((a) => !a.archived);

  const { register, handleSubmit, control, setError, formState } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      kind: initialKind,
      date: today,
      amount: '',
      accountId: accounts[0]?.id ?? '',
      toAccountId: '',
      contactId: '',
      categoryId: '',
      projectId: params.get('projectId') ?? '',
      paymentMethod: 'cash',
      reference: '',
      description: '',
    } satisfies TransactionValues,
  });
  const kind = useWatch({ control, name: 'kind' });
  const e = formState.errors;
  const categoryKind = kind === 'expense' ? 'expense' : 'income';
  const contacts = data.contacts.filter((c) => !c.archived && (kind === 'expense' ? c.kind !== 'customer' : c.kind !== 'supplier'));

  if (!access.canWrite) {
    return (
      <>
        <PageHeader title="Add entry" back />
        <ReadOnlyNotice />
      </>
    );
  }
  if (!accounts.length) {
    return (
      <>
        <PageHeader title="Add entry" back />
        <EmptyState icon={<Plus />} title="Add a cash or bank account first" action={<ButtonLink to="/app/accounts/new">Add account</ButtonLink>}>
          Every entry is recorded against the account the money moved through.
        </EmptyState>
      </>
    );
  }

  const onSubmit = handleSubmit(async (v) => {
    let amount: number;
    try {
      amount = parseAmount(v.amount, currency);
    } catch (err) {
      setError('amount', { message: err instanceof Error ? err.message : 'Invalid amount' });
      return;
    }
    if (amount <= 0) {
      setError('amount', { message: 'Amount must be greater than zero' });
      return;
    }
    const { userId, now } = actor();
    const txn: Transaction = {
      id: newId('txn'),
      organizationId: data.business.id,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      origin: 'user',
      kind: v.kind,
      date: v.date,
      amount,
      currency,
      accountId: v.accountId,
      description: v.description,
      status: 'posted',
      paymentMethod: v.paymentMethod,
      ...(v.kind === 'transfer' ? { toAccountId: v.toAccountId } : { ...(v.categoryId ? { categoryId: v.categoryId } : {}) }),
      ...(v.contactId && v.kind !== 'transfer' ? { contactId: v.contactId } : {}),
      ...(v.projectId && v.kind !== 'transfer' ? { projectId: v.projectId } : {}),
      ...(v.reference ? { reference: v.reference } : {}),
    };
    const problems = validateTransaction(txn);
    if (problems.length) {
      setError('root', { message: problems.join('. ') });
      return;
    }
    await mutation.mutateAsync({ type: 'transaction', transaction: txn });
    navigate('/app/transactions', { replace: true });
  });

  return (
    <>
      <PageHeader title="Add entry" back />
      <form noValidate onSubmit={onSubmit} className="space-y-4 md:max-w-xl">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ENTRY_KINDS.map((k) => (
              <label
                key={k}
                className={cn(
                  'flex h-11 cursor-pointer items-center justify-center rounded-xl border bg-card text-sm font-medium',
                  kind === k && 'border-primary bg-primary-soft text-primary',
                )}
              >
                <input type="radio" value={k} className="sr-only" {...register('kind')} />
                {KIND_META[k].label}
              </label>
            ))}
          </div>
          {kind === 'transfer' && <p className="mt-2 text-xs text-muted-foreground">Transfers move money between your own accounts. They are not income or expenses.</p>}
          {kind === 'refund_given' && <p className="mt-2 text-xs text-muted-foreground">Refunds reduce your sales and are paid out of the chosen account.</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${currency})`} error={e.amount?.message}>
            {(p) => <Input {...p} inputMode="decimal" placeholder="0.00" autoComplete="off" {...register('amount')} />}
          </Field>
          <Field label="Date" error={e.date?.message}>
            {(p) => <Input {...p} type="date" {...register('date')} />}
          </Field>
        </div>

        <Field label="Description" error={e.description?.message}>
          {(p) => <Input {...p} placeholder={kind === 'expense' ? 'e.g. Shop rent for May' : 'e.g. Walk-in sale'} {...register('description')} />}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'transfer' ? 'From account' : kind === 'income' ? 'Received into' : 'Paid from'} error={e.accountId?.message}>
            {(p) => (
              <Select {...p} {...register('accountId')}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind === 'transfer' ? (
            <Field label="To account" error={e.toAccountId?.message}>
              {(p) => (
                <Select {...p} {...register('toAccountId')}>
                  <option value="">Choose…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Payment method">
              {(p) => (
                <Select {...p} {...register('paymentMethod')}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {kind !== 'transfer' && (
          <>
            <Field label="Category" error={e.categoryId?.message}>
              {(p) => (
                <Select {...p} {...register('categoryId')}>
                  <option value="">Choose…</option>
                  {data.categories
                    .filter((c) => c.kind === categoryKind)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={kind === 'expense' ? 'Supplier (optional)' : 'Customer (optional)'}>
                {(p) => (
                  <Select {...p} {...register('contactId')}>
                    <option value="">None</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {data.business.modules.projects && (
                <Field label="Project / job (optional)">
                  {(p) => (
                    <Select {...p} {...register('projectId')}>
                      <option value="">None</option>
                      {data.projects.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          </>
        )}

        <Field label="Reference (optional)" hint="Bill no., UPI ref., cheque no.">
          {(p) => <Input {...p} {...register('reference')} />}
        </Field>

        {kind === 'expense' && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            <Paperclip className="size-4" aria-hidden="true" /> Receipt photos can be attached once cloud storage is enabled.
          </div>
        )}

        {e.root && (
          <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">
            {e.root.message}
          </p>
        )}
        <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
          Save entry
        </Button>
      </form>
    </>
  );
}

export function TransactionDetailScreen() {
  const { id } = useParams();
  const data = useBooks();
  const access = useAccess();
  const actor = useActor();
  const mutation = useBooksMutation();
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const txn = data.transactions.find((t) => t.id === id);
  if (!txn) {
    return (
      <>
        <PageHeader title="Not found" back="/app/transactions" />
        <p className="text-sm text-muted-foreground">This transaction does not exist.</p>
      </>
    );
  }
  const name = (list: { id: string; name: string }[], key?: string) => list.find((x) => x.id === key)?.name;
  const doc = data.documents.find((d) => d.id === txn.documentId);
  const rows: [string, React.ReactNode][] = [
    ['Type', KIND_META[txn.kind].label],
    ['Date', formatDate(txn.date)],
    ['Amount', <Money key="a" amount={txn.amount} currency={txn.currency} />],
    [txn.kind === 'transfer' ? 'From' : 'Account', name(data.accounts, txn.accountId) ?? '—'],
    ...(txn.toAccountId ? [['To', name(data.accounts, txn.toAccountId) ?? '—'] as [string, string]] : []),
    ...(txn.contactId ? [['Contact', name(data.contacts, txn.contactId)] as [string, React.ReactNode]] : []),
    ...(txn.categoryId ? [['Category', name(data.categories, txn.categoryId)] as [string, React.ReactNode]] : []),
    ...(txn.projectId ? [['Project', name(data.projects, txn.projectId)] as [string, React.ReactNode]] : []),
    ...(doc ? [['Document', <Link key="d" className="text-primary" to={`/app/documents/${doc.id}`}>{doc.number ?? 'Draft'}</Link>] as [string, React.ReactNode]] : []),
    ...(txn.paymentMethod ? [['Method', PAYMENT_METHOD_LABELS[txn.paymentMethod]] as [string, string]] : []),
    ...(txn.reference ? [['Reference', txn.reference] as [string, string]] : []),
    ['Recorded', `${new Date(txn.createdAt).toLocaleString()}`],
    ['Last changed', `${new Date(txn.updatedAt).toLocaleString()}`],
  ];

  return (
    <>
      <PageHeader title={txn.description} back="/app/transactions" actions={<SampleBadge origin={txn.origin} />} />
      {txn.status === 'void' && txn.void && (
        <div className="mb-4 rounded-xl border bg-muted p-3 text-sm">
          <p className="font-medium">Voided on {new Date(txn.void.at).toLocaleString()}</p>
          <p className="text-muted-foreground">Reason: {txn.void.reason}. Voided entries stay on record but are excluded from all totals.</p>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <dl className="divide-y">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {txn.status === 'posted' && access.canWrite && (
        <div className="mt-4">
          {voiding ? (
            <Card>
              <CardContent className="space-y-3 pt-4">
                <p className="text-sm">Voiding keeps this entry for your records but removes it from totals. This cannot be undone.</p>
                <Field label="Reason">{(p) => <Input {...p} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Entered twice" />}</Field>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setVoiding(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!reason.trim()}
                    onClick={() => mutation.mutate({ type: 'transaction', transaction: voidTransaction(txn, reason, actor()) })}
                  >
                    <Ban /> Void entry
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" onClick={() => setVoiding(true)}>
              <Ban /> Void this entry
            </Button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">To correct an amount, void this entry and add a new one.</p>
        </div>
      )}
    </>
  );
}
