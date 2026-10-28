import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Database, FilePlus2 } from 'lucide-react';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_LABELS,
  CURRENCIES,
  CURRENCY_CODES,
  defaultCategories,
  todayInTimeZone,
  type BusinessProfile,
} from '@linqora-books/accounting-core';
import { newId } from '@linqora-books/shared';
import { BrandMark, TestModeBanner } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useBooksMutation } from '@/data/books';
import { buildSampleData } from '@/data/sample-data';
import { useSession } from '@/state/session';
import { cn, nowISO } from '@/lib/utils';
import { useUnsavedChangesGuard } from '@/navigation/use-unsaved-changes';
import { UnsavedChangesDialog } from '@/navigation/unsaved-changes';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TIME_ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [detectedZone, 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'];
  }
})();

const businessSchema = z.object({
  name: z.string().trim().min(2, 'Enter your business name').max(120),
  category: z.enum(BUSINESS_CATEGORIES),
  address: z.string().trim().max(500),
  currency: z.enum(CURRENCY_CODES),
  financialYearStartMonth: z.string().regex(/^(1[0-2]|[1-9])$/),
  timeZone: z.string().min(1),
  taxLabel: z.string().trim().max(30),
  taxNumber: z.string().trim().max(30),
  projects: z.boolean(),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

function toValues(b?: BusinessProfile): BusinessFormValues {
  return {
    name: b?.name ?? '',
    category: b?.category ?? 'other',
    address: b?.address ?? '',
    currency: b?.currency ?? 'INR',
    financialYearStartMonth: String(b?.financialYearStartMonth ?? 4),
    timeZone: b?.timeZone ?? (TIME_ZONES.includes(detectedZone) ? detectedZone : 'Asia/Kolkata'),
    taxLabel: b?.taxRegistration?.label ?? 'GSTIN',
    taxNumber: b?.taxRegistration?.number ?? '',
    projects: b?.modules.projects ?? true,
  };
}

function toProfile(values: BusinessFormValues, existing: BusinessProfile | undefined, logoDataUrl: string | undefined): BusinessProfile {
  return {
    id: existing?.id ?? newId('org'),
    createdAt: existing?.createdAt ?? nowISO(),
    name: values.name,
    category: values.category,
    address: values.address,
    currency: values.currency,
    financialYearStartMonth: Number(values.financialYearStartMonth),
    timeZone: values.timeZone,
    modules: { projects: values.projects },
    ...(values.taxNumber ? { taxRegistration: { label: values.taxLabel || 'Tax ID', number: values.taxNumber } } : {}),
    ...(logoDataUrl ? { logoDataUrl } : {}),
  };
}

const MAX_LOGO_BYTES = 200 * 1024;

export function BusinessForm({
  existing,
  submitLabel,
  currencyLocked,
  onSubmit,
  extra,
}: {
  existing?: BusinessProfile;
  submitLabel: string;
  /** Currency cannot change once records exist (amounts are not converted). */
  currencyLocked?: boolean;
  /** Return false when saving failed, so the form keeps its unsaved state. */
  onSubmit: (profile: BusinessProfile) => void | boolean | Promise<void | boolean>;
  extra?: React.ReactNode;
}) {
  const [logo, setLogo] = useState<string | undefined>(existing?.logoDataUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset } = useForm({ resolver: zodResolver(businessSchema), defaultValues: toValues(existing) });
  const e = formState.errors;
  const guard = useUnsavedChangesGuard(formState.isDirty || logo !== existing?.logoDataUrl);

  return (
    <>
      <UnsavedChangesDialog guard={guard} />
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          guard.allowNavigation();
          try {
            const ok = await onSubmit(toProfile(v, existing, logo));
            if (ok !== false) reset(v);
          } finally {
            guard.rearm();
          }
        })}
      >
        <Field label="Business name" error={e.name?.message}>
          {(p) => <Input {...p} autoComplete="organization" {...register('name')} />}
        </Field>
        <Field label="Type of business" hint="Used for starter categories. You can track any kind of business.">
          {(p) => (
            <Select {...p} {...register('category')}>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {BUSINESS_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Address" error={e.address?.message}>
          {(p) => <Textarea {...p} rows={2} autoComplete="street-address" {...register('address')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency" hint={currencyLocked ? 'Locked once records exist' : 'INR fully supported'}>
            {(p) => (
              <Select {...p} disabled={currencyLocked} {...register('currency')}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCIES[c].name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Financial year starts">
            {(p) => (
              <Select {...p} {...register('financialYearStartMonth')}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Time zone">
          {(p) => (
            <Select {...p} {...register('timeZone')}>
              {TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Tax label">{(p) => <Input {...p} placeholder="GSTIN" {...register('taxLabel')} />}</Field>
          <Field label="Tax registration (optional)" error={e.taxNumber?.message}>
            {(p) => <Input {...p} autoCapitalize="characters" {...register('taxNumber')} />}
          </Field>
        </div>
        <Field label="Logo (optional)" error={logoError ?? undefined} hint="PNG or JPG, up to 200 KB. Shown on quotations and invoices.">
          {(p) => (
            <div className="flex items-center gap-3">
              {logo && <img src={logo} alt="Business logo" className="size-12 rounded-lg border object-contain" />}
              <input
                {...p}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm"
                onChange={(ev) => {
                  const file = ev.target.files?.[0];
                  setLogoError(null);
                  if (!file) return;
                  if (file.size > MAX_LOGO_BYTES) {
                    setLogoError('Logo is larger than 200 KB');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setLogo(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
              {logo && (
                <Button size="sm" variant="ghost" onClick={() => setLogo(undefined)}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </Field>
        <label className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" {...register('projects')} />
          <span>
            <span className="font-medium">Use projects / jobs</span>
            <span className="block text-muted-foreground">Track profit per event, repair job, site or client assignment. You can turn this off later.</span>
          </span>
        </label>
        {extra}
        <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
      </form>
    </>
  );
}

export function BusinessSetupScreen() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const mutation = useBooksMutation();
  const [start, setStart] = useState<'empty' | 'sample'>('empty');

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="pt-safe bg-warning-soft">
        <TestModeBanner />
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <BrandMark className="mb-6" />
        <h1 className="text-2xl font-semibold tracking-tight">Set up your business</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">These details appear on your invoices and reports. You can change them later.</p>
        <BusinessForm
          submitLabel="Finish setup"
          extra={
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">How would you like to start?</legend>
              {(
                [
                  { value: 'empty', icon: FilePlus2, title: 'Start with empty books', text: 'Enter your own customers, accounts and records.' },
                  {
                    value: 'sample',
                    icon: Database,
                    title: 'Explore with sample data',
                    text: 'Adds clearly labelled example records. Not real financial data — remove them before real use.',
                  },
                ] as const
              ).map(({ value, icon: Icon, title, text }) => (
                <label
                  key={value}
                  className={cn('flex cursor-pointer gap-3 rounded-xl border bg-card p-3 text-sm', start === value && 'border-primary ring-2 ring-primary/30')}
                >
                  <input type="radio" name="start" checked={start === value} onChange={() => setStart(value)} className="mt-0.5 size-5 accent-[var(--primary)]" />
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{title}</span>
                    <span className="block text-muted-foreground">{text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          }
          onSubmit={async (business) => {
            const userId = user?.id ?? 'unknown';
            const seed =
              start === 'sample'
                ? buildSampleData(business, userId, todayInTimeZone(business.timeZone), nowISO())
                : { categories: defaultCategories(business.category) };
            await mutation.mutateAsync({ type: 'business', business, seed });
            navigate('/app', { replace: true });
          }}
        />
      </div>
    </div>
  );
}
