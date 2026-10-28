import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, MapPin, Pencil, Phone, Plus, Search, Users } from 'lucide-react';
import { contactHistory, customerAdvances, payables, receivables, type Contact, type ContactKind } from '@linqora-books/accounting-core';
import { newId } from '@linqora-books/shared';
import { EmptyState, Money, PageHeader, ReadOnlyNotice, SampleBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAccess, useActor, useBooks, useBooksMutation, useToday } from '@/data/books';
import { cn, formatDate } from '@/lib/utils';
import { useUnsavedChangesGuard } from '@/navigation/use-unsaved-changes';
import { UnsavedChangesDialog } from '@/navigation/unsaved-changes';

const KIND_LABEL: Record<ContactKind, string> = { customer: 'Customer', supplier: 'Supplier', both: 'Customer & supplier' };

export function ContactsScreen() {
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer');
  const [query, setQuery] = useState('');
  const balances = useMemo(() => {
    const rows = tab === 'customer' ? receivables(data, today) : payables(data, today);
    return new Map(rows.map((r) => [r.contactId, r.outstanding]));
  }, [data, today, tab]);
  const q = query.trim().toLowerCase();
  const list = data.contacts
    .filter((c) => !c.archived && (c.kind === tab || c.kind === 'both'))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Customers & suppliers"
        actions={
          access.canWrite && (
            <ButtonLink to={`/app/contacts/new?kind=${tab}`} size="sm">
              <Plus /> Add
            </ButtonLink>
          )
        }
      />
      <ReadOnlyNotice />
      <div role="tablist" className="mb-3 grid grid-cols-2 rounded-xl bg-muted p-1">
        {(['customer', 'supplier'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('h-9 rounded-lg text-sm font-medium', tab === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            {k === 'customer' ? 'Customers' : 'Suppliers'}
          </button>
        ))}
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Search contacts" placeholder="Search name, phone or e-mail" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {list.length ? (
        <Card>
          <ul className="divide-y">
            {list.map((c) => {
              const due = balances.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <Link to={`/app/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary" aria-hidden="true">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.phone ?? c.email ?? KIND_LABEL[c.kind]}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      {due > 0 ? (
                        <span className="text-xs">
                          <span className="text-muted-foreground">{tab === 'customer' ? 'Owes you ' : 'You owe '}</span>
                          <Money amount={due} currency={data.business.currency} className="font-semibold" />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Settled</span>
                      )}
                      <SampleBadge origin={c.origin} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<Users />}
          title={q ? 'No matches' : tab === 'customer' ? 'No customers yet' : 'No suppliers yet'}
          action={access.canWrite && !q ? <ButtonLink to={`/app/contacts/new?kind=${tab}`}>Add {tab}</ButtonLink> : undefined}
        >
          Keep contact details, see what they owe and their full history.
        </EmptyState>
      )}
    </>
  );
}

export function ContactDetailScreen() {
  const { id } = useParams();
  const data = useBooks();
  const today = useToday();
  const access = useAccess();
  const contact = data.contacts.find((c) => c.id === id);
  if (!contact) return <PageHeader title="Not found" back="/app/contacts" />;
  const owed = receivables(data, today).find((r) => r.contactId === contact.id);
  const owing = payables(data, today).find((r) => r.contactId === contact.id);
  const advance = customerAdvances(data.transactions, today).find((a) => a.contactId === contact.id);
  const history = contactHistory(contact, data);
  const c = data.business.currency;

  return (
    <>
      <PageHeader
        title={contact.name}
        subtitle={KIND_LABEL[contact.kind]}
        back="/app/contacts"
        actions={
          <>
            <SampleBadge origin={contact.origin} />
            {access.canWrite && (
              <ButtonLink to={`/app/contacts/${contact.id}/edit`} size="icon" variant="ghost" aria-label="Edit contact">
                <Pencil />
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-primary">
                <Phone className="size-4" aria-hidden="true" /> {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-primary">
                <Mail className="size-4" aria-hidden="true" /> {contact.email}
              </a>
            )}
            {contact.address && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" /> {contact.address}
              </p>
            )}
            {contact.taxId && <p className="text-muted-foreground">Tax ID: {contact.taxId}</p>}
            {!contact.phone && !contact.email && !contact.address && <p className="text-muted-foreground">No contact details yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 pt-4 text-sm">
            <div>
              <p className="text-muted-foreground">Owes you</p>
              <p className="text-lg font-semibold">
                <Money amount={owed?.outstanding ?? 0} currency={c} />
              </p>
              {owed && owed.overdue > 0 && (
                <p className="text-xs text-negative">
                  Overdue <Money amount={owed.overdue} currency={c} />
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">You owe</p>
              <p className="text-lg font-semibold">
                <Money amount={owing?.outstanding ?? 0} currency={c} />
              </p>
            </div>
            {advance && (
              <div className="col-span-2 rounded-lg bg-muted p-3">
                <p className="text-muted-foreground">Advance held for this customer</p>
                <p className="text-lg font-semibold">
                  <Money amount={advance.held} currency={c} />
                </p>
                <p className="text-xs text-muted-foreground">Not sales yet — apply it from one of their invoices.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length ? (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.ref.id}>
                  <Link
                    to={h.ref.kind === 'document' ? `/app/documents/${h.ref.id}` : `/app/transactions/${h.ref.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{h.label}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(h.date)}</span>
                    </span>
                    <Money amount={h.amount} currency={c} className="font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No quotations, invoices or payments yet.</p>
          )}
        </CardContent>
      </Card>
      {contact.notes && (
        <Card className="mt-4">
          <CardContent className="pt-4 text-sm">{contact.notes}</CardContent>
        </Card>
      )}
    </>
  );
}

const contactSchema = z.object({
  kind: z.enum(['customer', 'supplier', 'both']),
  name: z.string().trim().min(2, 'Enter a name').max(120),
  phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/, 'Digits, spaces, + and - only'),
  email: z.union([z.literal(''), z.email('Enter a valid e-mail')]),
  address: z.string().trim().max(500),
  taxId: z.string().trim().max(30),
  notes: z.string().trim().max(1000),
});

export function ContactFormScreen() {
  const { id } = useParams();
  const data = useBooks();
  const access = useAccess();
  const actor = useActor();
  const navigate = useNavigate();
  const mutation = useBooksMutation();
  const existing = data.contacts.find((c) => c.id === id);
  const [params] = useSearchParams();
  const kindParam = params.get('kind');
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      kind: existing?.kind ?? (kindParam === 'supplier' ? 'supplier' : 'customer'),
      name: existing?.name ?? '',
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      address: existing?.address ?? '',
      taxId: existing?.taxId ?? '',
      notes: existing?.notes ?? '',
    },
  });
  const e = formState.errors;
  const guard = useUnsavedChangesGuard(formState.isDirty);
  if (!access.canWrite) {
    return (
      <>
        <PageHeader title={existing ? 'Edit contact' : 'New contact'} back />
        <ReadOnlyNotice />
      </>
    );
  }

  return (
    <>
      <PageHeader title={existing ? 'Edit contact' : 'New contact'} back />
      <UnsavedChangesDialog guard={guard} />
      <form
        noValidate
        className="space-y-4 md:max-w-xl"
        onSubmit={handleSubmit(async (v) => {
          const { userId, now } = actor();
          const optional = (k: 'phone' | 'email' | 'address' | 'taxId' | 'notes') => (v[k] ? { [k]: v[k] } : {});
          const contact: Contact = {
            id: existing?.id ?? newId('con'),
            organizationId: data.business.id,
            createdAt: existing?.createdAt ?? now,
            createdBy: existing?.createdBy ?? userId,
            updatedAt: now,
            updatedBy: userId,
            origin: existing?.origin ?? 'user',
            archived: existing?.archived ?? false,
            kind: v.kind,
            name: v.name,
            ...optional('phone'),
            ...optional('email'),
            ...optional('address'),
            ...optional('taxId'),
            ...optional('notes'),
          };
          await mutation.mutateAsync({ type: 'contact', contact });
          guard.allowNavigation();
          navigate(`/app/contacts/${contact.id}`, { replace: true });
        })}
      >
        <Field label="Type">
          {(p) => (
            <Select {...p} {...register('kind')}>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="both">Both</option>
            </Select>
          )}
        </Field>
        <Field label="Name" error={e.name?.message}>
          {(p) => <Input {...p} {...register('name')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" error={e.phone?.message}>
            {(p) => <Input {...p} type="tel" inputMode="tel" {...register('phone')} />}
          </Field>
          <Field label="E-mail" error={e.email?.message}>
            {(p) => <Input {...p} type="email" inputMode="email" {...register('email')} />}
          </Field>
        </div>
        <Field label="Address">{(p) => <Textarea {...p} rows={2} {...register('address')} />}</Field>
        <Field label="Tax ID (optional)" hint="e.g. GSTIN">
          {(p) => <Input {...p} {...register('taxId')} />}
        </Field>
        <Field label="Notes">{(p) => <Textarea {...p} rows={2} {...register('notes')} />}</Field>
        {existing?.origin === 'sample' && <Badge tone="warning">Editing a sample record</Badge>}
        <Button type="submit" block size="lg">
          Save contact
        </Button>
      </form>
    </>
  );
}
