import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, Loader2, Upload } from 'lucide-react';
import { CloudBooksRepository, countUserRecords, planLocalImport, type ImportResult, type LocalImportPlan } from '@linqora-books/cloud';
import { PageHeader, ReadOnlyNotice } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { describeSaveError, useAccess, useBooks, useRepository, useToday } from '@/data/books';
import { readImportMarker, readLocalSnapshot, writeImportMarker } from '@/import/local-snapshot';

const KIND_LABEL = { contact: 'Customers & suppliers', account: 'Cash & bank accounts', project: 'Projects', document: 'Quotations, invoices & bills', transaction: 'Transactions' };

/**
 * Controlled import of records saved on this device by the earlier local preview.
 * Nothing is uploaded until the user has reviewed the plan and confirmed. The local
 * copy is never deleted.
 */
export function ImportScreen() {
  const repo = useRepository();
  const cloud = useBooks();
  const today = useToday();
  const access = useAccess();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const local = readLocalSnapshot();
  const marker = readImportMarker();

  const plan = useQuery({
    queryKey: ['import-plan', cloud.business.id, cloud.transactions.length, cloud.documents.length],
    queryFn: () => (local ? planLocalImport(local, cloud, today) : Promise.resolve(null)),
    enabled: Boolean(local),
  });

  if (!(repo instanceof CloudBooksRepository)) {
    return (
      <>
        <PageHeader title="Import records" back />
        <p className="text-sm text-muted-foreground">Importing is available when you are signed in to a cloud account.</p>
      </>
    );
  }
  if (!local || countUserRecords(local) === 0) {
    return (
      <>
        <PageHeader title="Import records" back />
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            There are no records you created in the earlier offline version on this device{local ? ' (only sample data, which is never uploaded)' : ''}.
          </CardContent>
        </Card>
      </>
    );
  }

  const p: LocalImportPlan | null | undefined = plan.data;
  const grouped = p ? Object.entries(KIND_LABEL).map(([kind, labelText]) => ({ labelText, items: p.importable.filter((i) => i.kind === kind) })) : [];

  return (
    <>
      <PageHeader title="Import records from this device" subtitle={`From “${local.business.name}” (offline version)`} back />
      <ReadOnlyNotice />
      {marker && !result && (
        <p className="mb-4 rounded-xl bg-muted p-3 text-sm">
          This device's records were already reviewed on {new Date(marker.at).toLocaleString()}. Importing again will not create duplicates.
        </p>
      )}
      {plan.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> Checking your records…
        </p>
      )}
      {p && !result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Will be added to {cloud.business.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {p.importable.length === 0 && <p className="text-muted-foreground">Nothing can be imported.</p>}
              {grouped
                .filter((g) => g.items.length)
                .map((g) => (
                  <div key={g.labelText}>
                    <p className="font-medium">
                      {g.labelText} ({g.items.length})
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {g.items.slice(0, 8).map((i) => (
                        <li key={i.id}>{i.label}</li>
                      ))}
                      {g.items.length > 8 && <li>…and {g.items.length - 8} more</li>}
                    </ul>
                  </div>
                ))}
              {p.excludedSampleCount > 0 && <p className="text-muted-foreground">{p.excludedSampleCount} sample records are not uploaded.</p>}
            </CardContent>
          </Card>
          {p.rejected.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cannot be imported ({p.rejected.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {p.rejected.map((r) => (
                    <li key={`${r.kind}:${r.id}`} className="flex gap-2">
                      <CircleSlash className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
                      <span>
                        <strong>{r.label}</strong> — {r.reason}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">These stay on this device. You can re-enter them in your cloud books.</p>
              </CardContent>
            </Card>
          )}
          {p.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {p.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-negative-soft p-3 text-sm text-negative">
              Nothing was imported. {error}
            </p>
          )}
          <Button
            size="lg"
            block
            disabled={busy || p.importable.length === 0 || !access.canWrite}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await (repo as CloudBooksRepository).importLocal(p);
                writeImportMarker({ fingerprint: p.fingerprint, organizationId: cloud.business.id, at: new Date().toISOString(), status: res.status });
                setResult(res);
                await queryClient.invalidateQueries();
              } catch (e) {
                setError(describeSaveError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Import {p.importable.length} record{p.importable.length === 1 ? '' : 's'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">All or nothing: if any record is refused, nothing is imported. The local copy stays on this device.</p>
        </div>
      )}
      {result && (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-positive">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {result.status === 'already_imported' ? 'These records were already imported.' : 'Import complete.'}
            </p>
            {result.inserted && (
              <p className="text-muted-foreground">
                Added: {Object.entries(result.inserted)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${n} ${k.replace('_', ' ')}`)
                  .join(', ') || 'nothing new'}
                {result.skipped && Object.values(result.skipped).some((n) => n > 0) ? ' (records already in the cloud were skipped)' : ''}.
              </p>
            )}
            <p className="text-muted-foreground">The original records remain on this device and are not changed.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
