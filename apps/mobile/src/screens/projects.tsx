import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Briefcase, Pencil, Plus } from 'lucide-react';
import {
  documentTotals,
  isISODate,
  parseAmount,
  projectProfitability,
  toDecimalString,
  type Project,
  type ProjectStatus,
} from '@linqora-books/accounting-core';
import { newId } from '@linqora-books/shared';
import { EmptyState, Money, PageHeader, ProfitLoss, ReadOnlyNotice, SampleBadge, StatusBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAccess, useActor, useBooks, useBooksMutation } from '@/data/books';
import { formatDate } from '@/lib/utils';
import { useUnsavedChangesGuard } from '@/navigation/use-unsaved-changes';
import { UnsavedChangesDialog } from '@/navigation/unsaved-changes';

const STATUS_LABEL: Record<ProjectStatus, string> = { planned: 'Planned', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };

function ModuleOff() {
  return (
    <EmptyState icon={<Briefcase />} title="Projects are turned off" action={<ButtonLink to="/app/settings">Open settings</ButtonLink>}>
      Turn on projects / jobs in Settings if you want to track profit per event, job or site.
    </EmptyState>
  );
}

export function ProjectsScreen() {
  const data = useBooks();
  const access = useAccess();
  if (!data.business.modules.projects) {
    return (
      <>
        <PageHeader title="Projects / jobs" />
        <ModuleOff />
      </>
    );
  }
  const c = data.business.currency;
  return (
    <>
      <PageHeader
        title="Projects / jobs"
        subtitle="Estimated vs realised profit"
        actions={
          access.canWrite && (
            <ButtonLink to="/app/projects/new" size="sm">
              <Plus /> New
            </ButtonLink>
          )
        }
      />
      <ReadOnlyNotice />
      {data.projects.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.projects.map((p) => {
            const r = projectProfitability(p, data);
            const customer = data.contacts.find((x) => x.id === p.customerId);
            return (
              <Link key={p.id} to={`/app/projects/${p.id}`}>
                <Card className="h-full p-4 hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{customer?.name ?? 'No customer'}</p>
                    </div>
                    <span className="flex gap-1">
                      <Badge tone={p.status === 'active' ? 'primary' : 'neutral'}>{STATUS_LABEL[p.status]}</Badge>
                      <SampleBadge origin={p.origin} />
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Revenue</dt>
                      <dd className="font-semibold">
                        <Money amount={r.revenue} currency={c} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Costs</dt>
                      <dd className="font-semibold">
                        <Money amount={r.costs} currency={c} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{r.realizedProfit < 0 ? 'Loss' : 'Profit'}</dt>
                      <dd className={r.realizedProfit < 0 ? 'font-semibold text-negative' : 'font-semibold text-positive'}>
                        <Money amount={r.realizedProfit} currency={c} />
                      </dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Briefcase />} title="No projects yet" action={access.canWrite ? <ButtonLink to="/app/projects/new">Create project</ButtonLink> : undefined}>
          A project groups the income and expenses of one event, repair job, site or client assignment.
        </EmptyState>
      )}
    </>
  );
}

export function ProjectDetailScreen() {
  const { id } = useParams();
  const data = useBooks();
  const access = useAccess();
  const project = data.projects.find((p) => p.id === id);
  if (!project) return <PageHeader title="Not found" back="/app/projects" />;
  const r = projectProfitability(project, data);
  const c = project.currency;
  const customer = data.contacts.find((x) => x.id === project.customerId);
  const docs = data.documents.filter((d) => d.projectId === project.id);
  const txns = data.transactions.filter((t) => t.projectId === project.id);

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={`${STATUS_LABEL[project.status]}${customer ? ` · ${customer.name}` : ''}`}
        back="/app/projects"
        actions={
          <>
            <SampleBadge origin={project.origin} />
            {access.canWrite && (
              <ButtonLink to={`/app/projects/${project.id}/edit`} size="icon" variant="ghost" aria-label="Edit project">
                <Pencil />
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Realised so far</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProfitLoss amount={r.realizedProfit} currency={c} size="lg" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Revenue (invoiced + direct)</dt>
                <dd className="font-semibold">
                  <Money amount={r.revenue} currency={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Costs</dt>
                <dd className="font-semibold">
                  <Money amount={r.costs} currency={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Customer still owes</dt>
                <dd className="font-semibold">
                  <Money amount={r.outstandingReceivable} currency={c} />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Estimated charges</dt>
                <dd className="font-semibold">
                  <Money amount={project.estimatedRevenue} currency={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estimated costs</dt>
                <dd className="font-semibold">
                  <Money amount={project.estimatedCost} currency={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estimated profit</dt>
                <dd className="font-semibold">
                  <Money amount={r.estimatedProfit} currency={c} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dates</dt>
                <dd>
                  {formatDate(project.startDate)} – {formatDate(project.endDate)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
      {access.canWrite && (
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink size="sm" variant="outline" to={`/app/transactions/new?kind=expense&projectId=${project.id}`}>
            <Plus /> Expense
          </ButtonLink>
          <ButtonLink size="sm" variant="outline" to={`/app/documents/new?type=quotation&projectId=${project.id}${project.customerId ? `&contactId=${project.customerId}` : ''}`}>
            <Plus /> Quotation
          </ButtonLink>
          <ButtonLink size="sm" variant="outline" to={`/app/documents/new?type=invoice&projectId=${project.id}${project.customerId ? `&contactId=${project.customerId}` : ''}`}>
            <Plus /> Invoice
          </ButtonLink>
        </div>
      )}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Linked records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docs.length + txns.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing linked yet. Choose this project when adding income, expenses or documents.</p>
          ) : (
            <ul className="divide-y text-sm">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link to={`/app/documents/${d.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/60">
                    <span>
                      {d.type === 'quotation' ? 'Quotation' : d.type === 'bill' ? 'Bill' : 'Invoice'} {d.number ?? '(draft)'} <StatusBadge status={d.status} />
                    </span>
                    <Money amount={documentTotals(d).total} currency={d.currency} />
                  </Link>
                </li>
              ))}
              {txns.map((t) => (
                <li key={t.id}>
                  <Link to={`/app/transactions/${t.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/60">
                    <span className={t.status === 'void' ? 'line-through opacity-60' : ''}>{t.description}</span>
                    <Money amount={t.amount} currency={t.currency} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

const projectSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a project name').max(120),
    customerId: z.string(),
    status: z.enum(['planned', 'active', 'completed', 'cancelled']),
    estimatedRevenue: z.string(),
    estimatedCost: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    notes: z.string().max(1000),
  })
  .superRefine((v, ctx) => {
    for (const key of ['startDate', 'endDate'] as const) {
      if (v[key] && !isISODate(v[key])) ctx.addIssue({ code: 'custom', path: [key], message: 'Enter a valid date' });
    }
    if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Ends before it starts' });
  });

export function ProjectFormScreen() {
  const { id } = useParams();
  const data = useBooks();
  const access = useAccess();
  const actor = useActor();
  const navigate = useNavigate();
  const mutation = useBooksMutation();
  // One id per form: a retry after a lost response re-sends the same record instead of creating a second one.
  const [draftId] = useState(() => newId('prj'));
  const existing = data.projects.find((p) => p.id === id);
  const c = data.business.currency;
  const { register, handleSubmit, formState, setError } = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: existing?.name ?? '',
      customerId: existing?.customerId ?? '',
      status: existing?.status ?? 'planned',
      estimatedRevenue: existing ? toDecimalString(existing.estimatedRevenue, c) : '',
      estimatedCost: existing ? toDecimalString(existing.estimatedCost, c) : '',
      startDate: existing?.startDate ?? '',
      endDate: existing?.endDate ?? '',
      notes: existing?.notes ?? '',
    },
  });
  const e = formState.errors;
  const guard = useUnsavedChangesGuard(formState.isDirty);
  if (!data.business.modules.projects) return <ModuleOff />;
  if (!access.canWrite) {
    return (
      <>
        <PageHeader title="Project" back />
        <ReadOnlyNotice />
      </>
    );
  }
  return (
    <>
      <PageHeader title={existing ? 'Edit project' : 'New project'} back />
      <UnsavedChangesDialog guard={guard} />
      <form
        noValidate
        className="space-y-4 md:max-w-xl"
        onSubmit={handleSubmit(async (v) => {
          const amounts: Record<'estimatedRevenue' | 'estimatedCost', number> = { estimatedRevenue: 0, estimatedCost: 0 };
          for (const key of ['estimatedRevenue', 'estimatedCost'] as const) {
            try {
              amounts[key] = v[key] ? parseAmount(v[key], c) : 0;
            } catch (err) {
              setError(key, { message: err instanceof Error ? err.message : 'Invalid amount' });
              return;
            }
          }
          const { userId, now } = actor();
          const project: Project = {
            id: existing?.id ?? draftId,
            organizationId: data.business.id,
            createdAt: existing?.createdAt ?? now,
            createdBy: existing?.createdBy ?? userId,
            updatedAt: now,
            updatedBy: userId,
            origin: existing?.origin ?? 'user',
            name: v.name,
            status: v.status,
            currency: c,
            ...amounts,
            ...(v.customerId ? { customerId: v.customerId } : {}),
            ...(v.startDate ? { startDate: v.startDate } : {}),
            ...(v.endDate ? { endDate: v.endDate } : {}),
            ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
          };
          try {
            await mutation.mutateAsync({ type: 'project', project });
          } catch {
            return; // shown by the "Not saved" message; the form keeps what was typed
          }
          guard.allowNavigation();
          navigate(`/app/projects/${project.id}`, { replace: true });
        })}
      >
        <Field label="Project / job name" error={e.name?.message}>
          {(p) => <Input {...p} placeholder="e.g. Wedding — Nair family, Car service KL-07" {...register('name')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer (optional)">
            {(p) => (
              <Select {...p} {...register('customerId')}>
                <option value="">None</option>
                {data.contacts
                  .filter((x) => x.kind !== 'supplier')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(p) => (
              <Select {...p} {...register('status')}>
                {Object.entries(STATUS_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Estimated charges (${c})`} error={e.estimatedRevenue?.message}>
            {(p) => <Input {...p} inputMode="decimal" placeholder="0.00" {...register('estimatedRevenue')} />}
          </Field>
          <Field label={`Estimated costs (${c})`} error={e.estimatedCost?.message}>
            {(p) => <Input {...p} inputMode="decimal" placeholder="0.00" {...register('estimatedCost')} />}
          </Field>
          <Field label="Start date" error={e.startDate?.message}>
            {(p) => <Input {...p} type="date" {...register('startDate')} />}
          </Field>
          <Field label="End date" error={e.endDate?.message}>
            {(p) => <Input {...p} type="date" {...register('endDate')} />}
          </Field>
        </div>
        <Field label="Notes">{(p) => <Textarea {...p} rows={3} {...register('notes')} />}</Field>
        <Button type="submit" block size="lg">
          Save project
        </Button>
      </form>
    </>
  );
}
