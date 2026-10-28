import { useEffect, useRef } from 'react';
import { pushOverlay } from './back';

/**
 * While `active`, hardware Back calls `onBack` (e.g. close this panel or dialog)
 * instead of navigating. The most recently activated handler runs first.
 */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const callback = useRef(onBack);
  useEffect(() => {
    callback.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    return pushOverlay(() => callback.current());
  }, [active]);
}
