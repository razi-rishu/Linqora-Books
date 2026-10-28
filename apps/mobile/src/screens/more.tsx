import { Link } from 'react-router';
import { ChevronRight, Globe, LogOut, Plug, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { secondaryNav } from '@/components/nav';
import { useBooks } from '@/data/books';
import { useSession } from '@/state/session';
import { APP_VERSION } from '@/config/env';

export function MoreScreen() {
  const data = useBooks();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  return (
    <>
      <PageHeader title="More" subtitle={user ? `${user.name} · ${user.email}` : undefined} />
      <Card>
        <ul className="divide-y">
          {secondaryNav(data.business.modules.projects).map(({ to, label, icon: Icon, description }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  {description && <span className="block text-xs text-muted-foreground">{description}</span>}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Button variant="ghost" className="mt-4 text-negative" onClick={signOut}>
        <LogOut /> Sign out
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">Linqora Books {APP_VERSION} · Phase 1 prototype</p>
    </>
  );
}

export function IntegrationsScreen() {
  const steps = [
    'In Settings → Integrations, you create a connection and receive a secret connection key.',
    'You paste that key into your website admin panel. We never ask for your website password.',
    'Each time a quotation is saved on the website, the same quotation updates here — no duplicates.',
    'Quotations stay quotations. Invoices and payments are imported as invoices and payments.',
    'Sync runs between servers, so it works even when your phone is switched off.',
    'You can see the last sync, any errors, and disconnect at any time.',
  ];
  return (
    <>
      <PageHeader title="Integrations" subtitle="Bring quotations and invoices in from your website" />
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <Globe className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Website connector</CardTitle>
              <p className="text-xs text-muted-foreground">For business websites with a quotation or invoice maker</p>
            </div>
          </div>
          <Badge tone="neutral">Coming later</Badge>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <Button className="mt-4" disabled>
            <Plug /> Connect a website
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Not available in this prototype. No connection is made and no data leaves this device.</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex gap-3 pt-4 text-sm">
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">
            Connections will use revocable keys limited to importing quotations, invoices and payments into your business only. Imported records show where they came
            from.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

export function HelpScreen() {
  const faqs: [string, string][] = [
    ['What is the difference between profit and cash?', 'Profit counts sales when you invoice and expenses when you are billed. Cash shows money that actually came in or went out. A big unpaid invoice raises profit but not cash.'],
    ['Why are quotations not in my sales?', 'A quotation is only an offer. When the customer accepts, convert it to an invoice and issue it — then it counts as a sale.'],
    ['How do I record a customer payment?', 'Open the invoice and tap “Record payment”. Partial payments are fine; the balance updates automatically. Do not also add it as income, or it would be counted twice.'],
    ['A customer paid before I made the invoice. How do I record it?', 'Add a “Customer advance”. The money shows in your bank or cash balance and as an advance held for that customer, but not as sales. When you issue their invoice, open it and tap “Apply advance”. Unused advances can be refunded from the advance itself.'],
    ['Why can’t I date an entry before an account was opened?', 'An account’s opening balance already covers everything before its opening date. Change the opening balance or date instead. Money movements also cannot be dated in the future, and a payment cannot be dated before its invoice or bill.'],
    ['I made a mistake. Can I delete an entry?', 'Drafts can be deleted. Finalised entries are voided with a reason instead, so your history stays traceable. Then add the correct entry.'],
    ['Is moving cash to the bank an expense?', 'No. Use a Transfer. Transfers change account balances but are never income or expenses.'],
    ['What is “Sample” data?', 'Example records to explore the app. They are not your real books. Remove them in Settings before entering real data.'],
    ['What is TEST MODE?', 'This build is a prototype. Subscriptions and trials are simulated, no payment is taken, and your data is stored only on this device without cloud backup.'],
    ['Can I file GST returns from Linqora Books?', 'Not yet. Linqora Books is a finance tracker, not certified tax software. Share its reports with your accountant.'],
  ];
  return (
    <>
      <PageHeader title="Help" subtitle="How Linqora Books works" />
      <div className="space-y-2">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-xl border bg-card p-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="flex items-center justify-between gap-2">
                {q}
                <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Need help? Support contact details will be added before release.</p>
    </>
  );
}
