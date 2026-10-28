import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type Blocker } from 'react-router';

export interface UnsavedChangesGuard {
  blocker: Blocker;
  /** Call right before navigating away after a successful save. */
  allowNavigation: () => void;
  /** Call if the save failed, to re-arm the guard. */
  rearm: () => void;
}

/**
 * Blocks leaving the screen while `dirty` — hardware Back, browser Back, links and
 * the bottom navigation alike — so <UnsavedChangesDialog> can ask first. Closing or
 * reloading the browser tab gets the browser's own prompt.
 */
export function useUnsavedChangesGuard(dirty: boolean): UnsavedChangesGuard {
  const dirtyRef = useRef(dirty);
  const bypass = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  });

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      !bypass.current &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const allowNavigation = useCallback(() => {
    bypass.current = true;
  }, []);
  const rearm = useCallback(() => {
    bypass.current = false;
  }, []);
  return { blocker, allowNavigation, rearm };
}
