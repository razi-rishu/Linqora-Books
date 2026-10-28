import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ban, Check, FileCheck2, FileText, Pencil, Plus, Printer, Send, ThumbsDown, ThumbsUp, Trash2, Undo2, Wallet } from 'lucide-react';
import {
  amountSettled,
  canEditDocument,
  convertQuotationToInvoice,
  documentBalance,
  documentTotals,
  isISODate,
  issueDocument,
  nextDocumentNumber,
  parseAmount,
  parseQuantity,
  paymentStatus,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  toDecimalString,
  transitionQuotation,
  validatePayment,
  voidDocument,
  WorkflowError,
  addDays,
  type BusinessDocument,
  type DocumentType,
  type QuotationAction,
  type Transaction,
} from '@linqora-books/accounting-core';
import { newId } from '@linqora-books/shared';
import { EmptyState, Money, PageHeader, ReadOnlyNotice, SampleBadge, StatusBadge } from '@/components/common';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAccess, useActor, useBooks, useBooksMutation, useToday } from '@/data/books';
import { cn, formatDate } from '@/lib/utils';

const TYPE_LABEL: Record<DocumentType, { one: string; many: string }> = {
  quotation: { one: 'Quotation', many: 'Quotations' },
  invoice: { one: 'Invoice', many: 'Invoices' },
  bill: { one: 'Supplier bill', many: 'Bills' },
};

const TAX_RATES = [0, 500, 1200, 1800, 2800];

function parseType(value: string | null): DocumentType {
  return value === 'quotation' || value === 'bill' ? value : 'invoice';
}

export function DocumentsScreen() {
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const type = parseType(params.get('type'));
  const docs = data.documents
    .filter((d) => d.type === type)
    .sort((a, b) => (a.issueDate === b.issueDate ? b.createdAt.localeCompare(a.createdAt) : a.issueDate < b.issueDate ? 1 : -1));

  return (
    <>
      <PageHeader
        title="Quotations & invoices"
        actions={
          access.canWrite && (
            <ButtonLink to={`/app/documents/new?type=${type}`} size="sm">
              <Plus /> New
            </ButtonLink>
          )
        }
      />
      <ReadOnlyNotice />
      <div role="tablist" className="mb-4 grid grid-cols-3 rounded-xl bg-muted p-1">
        {(['quotation', 'invoice', 'bill'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={type === t}
            onClick={() => setParams({ type: t }, { replace: true })}
            className={cn('h-9 rounded-lg text-sm font-medium', type === t ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            {TYPE_LABEL[t].many}
          </button>
        ))}
      </div>
      {type === 'quotation' && (
        <p className="mb-3 text-xs text-muted-foreground">Quotations are estimates. They never count as sales until converted to an invoice and issued.</p>
      )}
      {docs.length ? (
        <Card>
          <ul className="divide-y">
            {docs.map((d) => {
              const contact = data.contacts.find((c) => c.id === d.contactId);
              const status = d.type === 'quotation' ? d.status : paymentStatus(d, data.transactions, today);
              const balance = documentBalance(d, data.transactions);
              return (
                <li key={d.id}>
                  <Link to={`/app/documents/${d.id}`} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/60', d.status === 'void' && 'opacity-60')}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
                      <FileText className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{contact?.name ?? 'Unknown contact'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.number ?? 'Draft — no number yet'} · {formatDate(d.issueDate)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money amount={documentTotals(d).total} currency={d.currency} className="text-sm font-semibold" />
                      {balance > 0 && balance < documentTotals(d).total && (
                        <span className="text-xs text-muted-foreground">
                          Due <Money amount={balance} currency={d.currency} />
                        </span>
                      )}
                      <span className="flex gap-1">
                        <StatusBadge status={status} />
                        <SampleBadge origin={d.origin} />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<FileText />}
          title={`No ${TYPE_LABEL[type].many.toLowerCase()} yet`}
          action={access.canWrite ? <ButtonLink to={`/app/documents/new?type=${type}`}>Create {TYPE_LABEL[type].one.toLowerCase()}</ButtonLink> : undefined}
        >
          {type === 'bill' ? 'Record bills from suppliers to track what you owe.' : 'Create professional documents and track their status and payments.'}
        </EmptyState>
      )}
    </>
  );
}

const lineSchema = z.object({
  id: z.string(),
  description: z.string().trim().min(1, 'Describe the item'),
  quantity: z.string().refine((q) => {
    try {
      return parseQuantity(q) > 0n;
    } catch {
      return false;
    }
  }, 'Quantity (up to 3 decimals)'),
  unitPrice: z.string().min(1, 'Price'),
  taxRateBps: z.string(),
});

const documentSchema = z
  .object({
    contactId: z.string().min(1, 'Choose a contact'),
    projectId: z.string(),
    categoryId: z.string(),
    issueDate: z.string().refine(isISODate, 'Enter a valid date'),
    secondDate: z.string(),
    notes: z.string().max(1000),
    lines: z.array(lineSchema).min(1, 'Add at least one line'),
  })
  .superRefine((v, ctx) => {
    if (v.secondDate && !isISODate(v.secondDate)) ctx.addIssue({ code: 'custom', path: ['secondDate'], message: 'Enter a valid date' });
    else if (v.secondDate && v.secondDate < v.issueDate) ctx.addIssue({ code: 'custom', path: ['secondDate'], message: 'Must be on or after the issue date' });
  });

type DocumentValues = z.infer<typeof documentSchema>;

export function DocumentEditorScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const actor = useActor();
  const navigate = useNavigate();
  const mutation = useBooksMutation();
  const existing = data.documents.find((d) => d.id === id);
  const type = existing?.type ?? parseType(params.get('type'));
  const currency = data.business.currency;
  const contactKinds = type === 'bill' ? ['supplier', 'both'] : ['customer', 'both'];
  const contacts = data.contacts.filter((c) => !c.archived && contactKinds.includes(c.kind));
  const categoryKind = type === 'bill' ? 'expense' : 'income';

  const { register, control, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      contactId: existing?.contactId ?? params.get('contactId') ?? '',
      projectId: existing?.projectId ?? params.get('projectId') ?? '',
      categoryId: existing?.categoryId ?? '',
      issueDate: existing?.issueDate ?? today,
      secondDate: (type === 'quotation' ? existing?.validUntil : existing?.dueDate) ?? addDays(today, type === 'quotation' ? 30 : 15),
      notes: existing?.notes ?? '',
      lines: existing?.lines.map((l) => ({ ...l, unitPrice: toDecimalString(l.unitPrice, currency), taxRateBps: String(l.taxRateBps) })) ?? [
        { id: newId('line'), description: '', quantity: '1', unitPrice: '', taxRateBps: '0' },
      ],
    } satisfies DocumentValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = useWatch({ control, name: 'lines' });
  const e = formState.errors;

  const previewTotals = (() => {
    try {
      return documentTotals({
        lines: watchedLines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity || '0',
          unitPrice: l.unitPrice ? parseAmount(l.unitPrice, currency) : 0,
          taxRateBps: Number(l.taxRateBps),
        })),
      });
    } catch {
      return null;
    }
  })();

  if (!access.canWrite) {
    return (
      <>
        <PageHeader title={`New ${TYPE_LABEL[type].one.toLowerCase()}`} back />
        <ReadOnlyNotice />
      </>
    );
  }
  if (existing && !canEditDocument(existing)) {
    return (
      <>
        <PageHeader title="Cannot edit" back />
        <p className="text-sm text-muted-foreground">Only drafts can be edited. Finalised documents keep their original details; void and re-create to correct them.</p>
      </>
    );
  }
  if (!contacts.length) {
    return (
      <>
        <PageHeader title={`New ${TYPE_LABEL[type].one.toLowerCase()}`} back />
        <EmptyState
          icon={<Plus />}
          title={`Add a ${type === 'bill' ? 'supplier' : 'customer'} first`}
          action={<ButtonLink to={`/app/contacts/new?kind=${type === 'bill' ? 'supplier' : 'customer'}`}>Add contact</ButtonLink>}
        />
      </>
    );
  }

  const onSubmit = handleSubmit(async (v) => {
    const lines = [];
    for (const [i, l] of v.lines.entries()) {
      try {
        const unitPrice = parseAmount(l.unitPrice, currency);
        lines.push({ id: l.id, description: l.description, quantity: l.quantity.trim(), unitPrice, taxRateBps: Number(l.taxRateBps) });
      } catch (err) {
        setError(`lines.${i}.unitPrice`, { message: err instanceof Error ? err.message : 'Invalid price' });
        return;
      }
    }
    const { userId, now } = actor();
    const doc: BusinessDocument = {
      id: existing?.id ?? newId('doc'),
      organizationId: data.business.id,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? userId,
      updatedAt: now,
      updatedBy: userId,
      origin: existing?.origin ?? 'user',
      type,
      status: existing?.status ?? 'draft',
      contactId: v.contactId,
      issueDate: v.issueDate,
      currency,
      lines,
      ...(v.projectId ? { projectId: v.projectId } : {}),
      ...(v.categoryId ? { categoryId: v.categoryId } : {}),
      ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
      ...(v.secondDate ? (type === 'quotation' ? { validUntil: v.secondDate } : { dueDate: v.secondDate }) : {}),
      ...(existing?.convertedFromId ? { convertedFromId: existing.convertedFromId } : {}),
      // Quotations get their reference number on first save; invoices and bills when issued.
      ...(existing?.number
        ? { number: existing.number }
        : type === 'quotation'
          ? { number: nextDocumentNumber('quotation', data.documents, v.issueDate, data.business.financialYearStartMonth) }
          : {}),
    };
    await mutation.mutateAsync({ type: 'documents', documents: [doc] });
    navigate(`/app/documents/${doc.id}`, { replace: true });
  });

  return (
    <>
      <PageHeader title={`${existing ? 'Edit' : 'New'} ${TYPE_LABEL[type].one.toLowerCase()}`} subtitle={existing?.number ?? 'Draft'} back />
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={type === 'bill' ? 'Supplier' : 'Customer'} error={e.contactId?.message}>
            {(p) => (
              <Select {...p} {...register('contactId')}>
                <option value="">Choose…</option>
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
          <Field label="Date" error={e.issueDate?.message}>
            {(p) => <Input {...p} type="date" {...register('issueDate')} />}
          </Field>
          <Field label={type === 'quotation' ? 'Valid until' : 'Due date'} error={e.secondDate?.message}>
            {(p) => <Input {...p} type="date" {...register('secondDate')} />}
          </Field>
          {type !== 'quotation' && (
            <Field label="Category (optional)">
              {(p) => (
                <Select {...p} {...register('categoryId')}>
                  <option value="">None</option>
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
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, i) => {
              const le = e.lines?.[i];
              return (
                <div key={field.id} className="space-y-2 rounded-xl border p-3">
                  <Field label={`Item ${i + 1}`} error={le?.description?.message}>
                    {(p) => <Input {...p} placeholder="Description" {...register(`lines.${i}.description`)} />}
                  </Field>
                  <div className="grid grid-cols-[1fr_1.4fr_1fr_auto] items-end gap-2">
                    <Field label="Qty" error={le?.quantity?.message}>
                      {(p) => <Input {...p} inputMode="decimal" {...register(`lines.${i}.quantity`)} />}
                    </Field>
                    <Field label="Price" error={le?.unitPrice?.message}>
                      {(p) => <Input {...p} inputMode="decimal" placeholder="0.00" {...register(`lines.${i}.unitPrice`)} />}
                    </Field>
                    <Field label="Tax">
                      {(p) => (
                        <Select {...p} {...register(`lines.${i}.taxRateBps`)}>
                          {TAX_RATES.map((r) => (
                            <option key={r} value={String(r)}>
                              {r / 100}%
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Button variant="ghost" size="icon" aria-label={`Remove item ${i + 1}`} disabled={fields.length === 1} onClick={() => remove(i)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" onClick={() => append({ id: newId('line'), description: '', quantity: '1', unitPrice: '', taxRateBps: '0' })}>
              <Plus /> Add item
            </Button>
            {previewTotals && (
              <dl className="space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>
                    <Money amount={previewTotals.subtotal} currency={currency} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd>
                    <Money amount={previewTotals.tax} currency={currency} />
                  </dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money amount={previewTotals.total} currency={currency} />
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
        <Field label="Notes / terms (optional)">{(p) => <Textarea {...p} rows={3} {...register('notes')} />}</Field>
        <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
          Save draft
        </Button>
      </form>
    </>
  );
}

function PaymentForm({ doc, onDone }: { doc: BusinessDocument; onDone: () => void }) {
  const data = useBooks();
  const today = useToday();
  const actor = useActor();
  const mutation = useBooksMutation();
  const balance = documentBalance(doc, data.transactions);
  const accounts = data.accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState(toDecimalString(balance, doc.currency));
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('upi');
  const [error, setError] = useState<string | null>(null);

  if (!accounts.length) {
    return (
      <p className="text-sm">
        Add a cash or bank account first. <Link className="text-primary" to="/app/accounts/new">Add account</Link>
      </p>
    );
  }

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        let minor: number;
        try {
          minor = parseAmount(amount, doc.currency);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Invalid amount');
          return;
        }
        const check = validatePayment(doc, minor, data.transactions);
        if (!check.ok) return setError(check.error);
        if (!isISODate(date)) return setError('Enter a valid date');
        const { userId, now } = actor();
        const contact = data.contacts.find((c) => c.id === doc.contactId);
        const txn: Transaction = {
          id: newId('txn'),
          organizationId: data.business.id,
          createdAt: now,
          createdBy: userId,
          updatedAt: now,
          updatedBy: userId,
          origin: 'user',
          kind: doc.type === 'bill' ? 'payment_made' : 'payment_received',
          date,
          amount: minor,
          currency: doc.currency,
          accountId,
          contactId: doc.contactId,
          documentId: doc.id,
          paymentMethod: method,
          status: 'posted',
          description: `${doc.type === 'bill' ? 'Payment to' : 'Payment from'} ${contact?.name ?? 'contact'} — ${doc.number}`,
          ...(doc.projectId ? { projectId: doc.projectId } : {}),
        };
        await mutation.mutateAsync({ type: 'transaction', transaction: txn });
        onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (balance ${toDecimalString(balance, doc.currency)})`} error={error ?? undefined}>
          {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value)} />}
        </Field>
        <Field label="Date">{(p) => <Input {...p} type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />}</Field>
        <Field label={doc.type === 'bill' ? 'Paid from' : 'Received into'}>
          {(p) => (
            <Select {...p} value={accountId} onChange={(ev) => setAccountId(ev.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Method">
          {(p) => (
            <Select {...p} value={method} onChange={(ev) => setMethod(ev.target.value as typeof method)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          <Check /> Save payment
        </Button>
      </div>
    </form>
  );
}

export function DocumentDetailScreen() {
  const { id } = useParams();
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const actor = useActor();
  const navigate = useNavigate();
  const mutation = useBooksMutation();
  const [panel, setPanel] = useState<'none' | 'payment' | 'void'>('none');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const doc = data.documents.find((d) => d.id === id);
  if (!doc) return <PageHeader title="Not found" back="/app/documents" />;

  const contact = data.contacts.find((c) => c.id === doc.contactId);
  const project = data.projects.find((p) => p.id === doc.projectId);
  const totals = documentTotals(doc);
  const settled = amountSettled(doc, data.transactions);
  const balance = documentBalance(doc, data.transactions);
  const status = doc.type === 'quotation' ? doc.status : paymentStatus(doc, data.transactions, today);
  const payments = data.transactions.filter((t) => t.documentId === doc.id);
  const linked = data.documents.find((d) => d.id === (doc.convertedToId ?? doc.convertedFromId));
  const b = data.business;

  const run = async (fn: () => BusinessDocument[] | Promise<BusinessDocument[]>, after?: (docs: BusinessDocument[]) => void) => {
    setError(null);
    try {
      const docs = await fn();
      await mutation.mutateAsync({ type: 'documents', documents: docs });
      after?.(docs);
    } catch (err) {
      setError(err instanceof WorkflowError || err instanceof Error ? err.message : 'Action failed');
    }
  };
  const quotationAction = (action: QuotationAction) => run(() => [transitionQuotation(doc, action, actor())]);

  return (
    <>
      <PageHeader
        title={`${TYPE_LABEL[doc.type].one} ${doc.number ?? '(draft)'}`}
        back={`/app/documents?type=${doc.type}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => window.print()} aria-label="Print or save as PDF">
            <Printer /> <span className="hidden sm:inline">Print / PDF</span>
          </Button>
        }
      />
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        <SampleBadge origin={doc.origin} />
        {linked && (
          <Link to={`/app/documents/${linked.id}`} className="text-sm text-primary">
            {doc.convertedToId ? 'Converted to' : 'Created from'} {TYPE_LABEL[linked.type].one.toLowerCase()} {linked.number ?? '(draft)'}
          </Link>
        )}
      </div>
      {doc.status === 'void' && doc.void && (
        <div className="no-print mb-4 rounded-xl border bg-muted p-3 text-sm">
          Voided {new Date(doc.void.at).toLocaleString()} — {doc.void.reason}. Excluded from all totals.
        </div>
      )}
      {doc.type === 'quotation' && <p className="no-print mb-4 text-xs text-muted-foreground">Quotations are not counted as sales.</p>}

      {/* Actions */}
      {access.canWrite && doc.status !== 'void' && (
        <div className="no-print mb-4 flex flex-wrap gap-2">
          {canEditDocument(doc) && (
            <ButtonLink to={`/app/documents/${doc.id}/edit`} variant="outline" size="sm">
              <Pencil /> Edit
            </ButtonLink>
          )}
          {doc.type === 'quotation' && doc.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => quotationAction('send')}>
              <Send /> Mark as sent
            </Button>
          )}
          {doc.type === 'quotation' && (doc.status === 'draft' || doc.status === 'sent') && (
            <>
              <Button size="sm" onClick={() => quotationAction('accept')}>
                <ThumbsUp /> Accepted
              </Button>
              <Button size="sm" variant="outline" onClick={() => quotationAction('reject')}>
                <ThumbsDown /> Rejected
              </Button>
            </>
          )}
          {doc.type === 'quotation' && (doc.status === 'rejected' || doc.status === 'sent') && (
            <Button size="sm" variant="ghost" onClick={() => quotationAction('reopen')}>
              <Undo2 /> Back to draft
            </Button>
          )}
          {doc.type === 'quotation' && doc.status === 'accepted' && (
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() =>
                run(
                  () => {
                    const { quotation, invoice } = convertQuotationToInvoice(doc, newId('doc'), actor(), today);
                    return [quotation, invoice];
                  },
                  (docs) => navigate(`/app/documents/${docs[1]!.id}`),
                )
              }
            >
              <FileCheck2 /> Convert to invoice
            </Button>
          )}
          {doc.type !== 'quotation' && doc.status === 'draft' && (
            <Button
              size="sm"
              onClick={() => run(() => [issueDocument(doc, nextDocumentNumber(doc.type, data.documents, doc.issueDate, b.financialYearStartMonth), actor())])}
            >
              <Check /> Issue {TYPE_LABEL[doc.type].one.toLowerCase()}
            </Button>
          )}
          {doc.type !== 'quotation' && doc.status === 'issued' && balance > 0 && (
            <Button size="sm" onClick={() => setPanel('payment')}>
              <Wallet /> Record payment
            </Button>
          )}
          {doc.type !== 'quotation' && doc.status === 'issued' && (
            <Button size="sm" variant="ghost" onClick={() => setPanel('void')}>
              <Ban /> Void
            </Button>
          )}
          {doc.status === 'draft' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await mutation.mutateAsync({ type: 'deleteDraft', id: doc.id, actor: actor() });
                navigate(`/app/documents?type=${doc.type}`, { replace: true });
              }}
            >
              <Trash2 /> Delete draft
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="no-print mb-4 rounded-xl bg-negative-soft p-3 text-sm text-negative">
          {error}
        </p>
      )}
      {panel === 'payment' && (
        <Card className="no-print mb-4">
          <CardHeader>
            <CardTitle>Record payment</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentForm doc={doc} onDone={() => setPanel('none')} />
          </CardContent>
        </Card>
      )}
      {panel === 'void' && (
        <Card className="no-print mb-4">
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm">Voiding keeps the {TYPE_LABEL[doc.type].one.toLowerCase()} and its number on record but removes it from all totals.</p>
            <Field label="Reason">{(p) => <Input {...p} value={reason} onChange={(ev) => setReason(ev.target.value)} />}</Field>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPanel('none')}>
                Cancel
              </Button>
              <Button variant="danger" disabled={!reason.trim()} onClick={() => run(() => [voidDocument(doc, data.transactions, reason, actor())], () => setPanel('none'))}>
                Void
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Printable document */}
      <Card className="print-sheet">
        <CardContent className="space-y-6 p-5 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {b.logoDataUrl && <img src={b.logoDataUrl} alt="" className="size-14 rounded-lg object-contain" />}
              <div>
                <p className="text-lg font-semibold">{b.name}</p>
                {b.address && <p className="text-sm whitespace-pre-line text-muted-foreground">{b.address}</p>}
                {b.taxRegistration && (
                  <p className="text-sm text-muted-foreground">
                    {b.taxRegistration.label}: {b.taxRegistration.number}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold tracking-tight uppercase">{TYPE_LABEL[doc.type].one}</p>
              <p className="text-sm">{doc.number ?? 'DRAFT'}</p>
              <p className="text-sm text-muted-foreground">Date: {formatDate(doc.issueDate)}</p>
              {doc.dueDate && <p className="text-sm text-muted-foreground">Due: {formatDate(doc.dueDate)}</p>}
              {doc.validUntil && <p className="text-sm text-muted-foreground">Valid until: {formatDate(doc.validUntil)}</p>}
            </div>
          </div>
          <div className="text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{doc.type === 'bill' ? 'Supplier' : 'Bill to'}</p>
            <p className="font-medium">{contact?.name}</p>
            {contact?.address && <p className="whitespace-pre-line text-muted-foreground">{contact.address}</p>}
            {contact?.taxId && <p className="text-muted-foreground">Tax ID: {contact.taxId}</p>}
            {project && <p className="mt-1 text-muted-foreground">Project: {project.name}</p>}
          </div>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">Price</th>
                  <th className="px-2 py-2 text-right font-medium">Tax</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((l) => {
                  const lineTotal = documentTotals({ lines: [l] });
                  return (
                    <tr key={l.id} className="border-b">
                      <td className="px-2 py-2">{l.description}</td>
                      <td className="tabular px-2 py-2 text-right">{l.quantity}</td>
                      <td className="px-2 py-2 text-right">
                        <Money amount={l.unitPrice} currency={doc.currency} />
                      </td>
                      <td className="tabular px-2 py-2 text-right">{l.taxRateBps / 100}%</td>
                      <td className="px-2 py-2 text-right">
                        <Money amount={lineTotal.subtotal} currency={doc.currency} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>
                <Money amount={totals.subtotal} currency={doc.currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd>
                <Money amount={totals.tax} currency={doc.currency} />
              </dd>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd>
                <Money amount={totals.total} currency={doc.currency} />
              </dd>
            </div>
            {doc.type !== 'quotation' && doc.status === 'issued' && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd>
                    <Money amount={settled} currency={doc.currency} />
                  </dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Balance due</dt>
                  <dd>
                    <Money amount={balance} currency={doc.currency} />
                  </dd>
                </div>
              </>
            )}
          </dl>
          {doc.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{doc.notes}</p>}
          <p className="text-[10px] text-muted-foreground">
            Generated by Linqora Books (prototype){doc.origin === 'sample' ? ' — SAMPLE DOCUMENT, not a real invoice' : ''}.
          </p>
        </CardContent>
      </Card>

      {payments.length > 0 && (
        <Card className="no-print mt-4">
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id}>
                  <Link to={`/app/transactions/${p.id}`} className={cn('flex justify-between px-4 py-3 text-sm hover:bg-muted/60', p.status === 'void' && 'line-through opacity-60')}>
                    <span>
                      {formatDate(p.date)} · {p.paymentMethod ? PAYMENT_METHOD_LABELS[p.paymentMethod] : ''}
                    </span>
                    <Money amount={p.amount} currency={p.currency} className="font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
