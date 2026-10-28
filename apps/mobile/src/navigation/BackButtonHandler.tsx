import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  EXIT_WINDOW_MS,
  closeTopOverlay,
  exitApp,
  hasOverlay,
  installNativeBackButton,
  isEditableElement,
  resolveBack,
  setBackDispatcher,
} from './back';

function historyIndex(): number {
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
}

/** Connects the Android hardware Back button to React Router. Render once, inside the router. */
export function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  /** Screen on which "press back again to exit" is currently shown. */
  const [hintPath, setHintPath] = useState<string | null>(null);
  /** When and where the first exit press happened; only valid on that same screen. */
  const armed = useRef<{ at: number; path: string } | null>(null);
  const latest = useRef({ navigate, pathname: location.pathname });

  useEffect(() => {
    latest.current = { navigate, pathname: location.pathname };
  }, [navigate, location.pathname]);

  useEffect(() => {
    installNativeBackButton();
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const dispose = setBackDispatcher(() => {
      const { navigate: nav, pathname } = latest.current;
      const action = resolveBack({
        pathname,
        editableFocused: isEditableElement(document.activeElement),
        overlayOpen: hasOverlay(),
        historyIndex: historyIndex(),
        exitArmedAt: armed.current?.path === pathname ? armed.current.at : null,
        now: Date.now(),
      });
      switch (action.type) {
        case 'blur':
          (document.activeElement as HTMLElement | null)?.blur();
          break;
        case 'close-overlay':
          closeTopOverlay();
          break;
        case 'arm-exit':
          armed.current = { at: Date.now(), path: pathname };
          setHintPath(pathname);
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => setHintPath(null), EXIT_WINDOW_MS);
          break;
        case 'exit':
          armed.current = null;
          setHintPath(null);
          exitApp();
          break;
        case 'history-back':
          void nav(-1);
          break;
        case 'navigate':
          void nav(action.to, { replace: true });
          break;
      }
    });
    return () => {
      clearTimeout(hintTimer);
      dispose();
    };
  }, []);

  if (hintPath !== location.pathname) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8" role="status" aria-live="polite">
      <p className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">Press back again to exit</p>
    </div>
  );
}
