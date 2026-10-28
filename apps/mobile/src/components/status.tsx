import { useEffect, useState } from 'react';
import { useOnline } from './use-online';
import { Link } from 'react-router';
import { CloudOff, RefreshCw, TriangleAlert, Upload, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { countUserRecords } from '@linqora-books/cloud';
import { useSaveError } from '@/data/books';
import { readLocalSnapshot, readImportMarker } from '@/import/local-snapshot';
import { DATA_MODE } from '@/config/env';
import { Button } from './ui/button';

/**
 * Cloud mode: says plainly when the device is offline, and refreshes cloud data on
 * reconnection. Nothing is queued offline in Phase 2 — saving needs a connection.
 */
export function NetworkBanner() {
  const online = useOnline();
  const client = useQueryClient();
  useEffect(() => {
    if (online && DATA_MODE === 'cloud') void client.invalidateQueries();
  }, [online, client]);
  if (online || DATA_MODE !== 'cloud') return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-negative-soft px-3 py-1.5 text-center text-xs font-medium text-negative">
      <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
      <span>You are offline. You can view your books, but nothing can be saved until you reconnect.</span>
    </div>
  );
}

/** Shows the last failed save. Forms keep what was typed, so the user can simply try again. */
export function SaveErrorToast() {
  const message = useSaveError((s) => s.message);
  const set = useSaveError((s) => s.set);
  if (!message) return null;
  return (
    <div className="no-print fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div role="alert" className="flex max-w-md items-start gap-3 rounded-xl bg-negative px-4 py-3 text-sm text-white shadow-lg">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="flex-1">
          <strong>Not saved.</strong> {message}
        </p>
        <button type="button" aria-label="Dismiss" onClick={() => set(null)}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Cloud mode: there are records from the local preview on this device that are not imported yet. */
export function LocalImportBanner() {
  const [count] = useState(() => (DATA_MODE === 'cloud' && !readImportMarker() ? countUserRecords(readLocalSnapshot()) : 0));
  if (!count) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft p-3 text-sm text-primary">
      <Upload className="size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        This phone has <strong>{count}</strong> record{count === 1 ? '' : 's'} from the earlier offline version. They are not in your cloud
        books yet.
      </p>
      <Link to="/app/import" className="font-medium underline">
        Review &amp; import
      </Link>
    </div>
  );
}

/** Shown when cloud data could not be loaded (offline, server down, session problem). */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border bg-card p-5 text-center">
      <CloudOff className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 font-medium">Your books could not be loaded</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        <RefreshCw /> Try again
      </Button>
    </div>
  );
}
