import { useCallback } from 'react';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UnsavedChangesGuard } from './use-unsaved-changes';

/** "Discard changes?" prompt shown while a navigation is blocked. Back keeps editing. */
export function UnsavedChangesDialog({ guard }: { guard: UnsavedChangesGuard }) {
  const { blocker } = guard;
  const keepEditing = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Discard unsaved changes?"
      onCancel={keepEditing}
      actions={
        <>
          <Button variant="outline" onClick={keepEditing}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
            Discard changes
          </Button>
        </>
      }
    >
      You have changes on this screen that are not saved yet. If you leave now they will be lost.
    </ConfirmDialog>
  );
}
