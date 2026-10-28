import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useBackHandler } from '@/navigation/use-back-handler';

/**
 * Modal confirmation dialog. Hardware Back, Escape and the backdrop all cancel it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  actions,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  onCancel: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useBackHandler(open, onCancel);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCancel}>
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </div>
  );
}
