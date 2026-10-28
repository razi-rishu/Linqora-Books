/**
 * Android hardware/system Back handling.
 *
 * One native `backButton` listener is installed for the lifetime of the page
 * (`installNativeBackButton` is idempotent). It forwards to whichever dispatcher the
 * mounted <BackButtonHandler> registered, so React re-renders, StrictMode double
 * effects and HMR never create duplicate listeners.
 *
 * What a press does is decided by the pure `resolveBack`, in this order:
 *   1. a text field is focused   → blur it (hides the keyboard), nothing else
 *   2. a panel/dialog is open    → close the top-most one
 *   3. on a root screen          → first press arms "press back again to exit",
 *                                  a second press within EXIT_WINDOW_MS exits
 *   4. there is in-app history   → go back one step (unsaved-change guards still apply)
 *   5. otherwise                 → go to the screen's logical parent
 * Leaving a form with unsaved changes is intercepted by React Router's blocker
 * (see unsaved-changes.tsx), for hardware Back and browser Back alike.
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const EXIT_WINDOW_MS = 2000;

/** Screens where Back offers to exit instead of navigating. */
const ROOT_PATHS = new Set(['/', '/app', '/welcome', '/subscribe', '/setup']);

const PARENTS: Record<string, string> = {
  '/sign-in': '/welcome',
  '/sign-up': '/welcome',
  '/forgot-password': '/sign-in',
  '/subscribe/trial': '/subscribe',
};

export function isRootPath(pathname: string): boolean {
  return ROOT_PATHS.has(pathname);
}

/** Logical parent: /app/documents/x/edit → /app/documents/x → /app/documents → /app. */
export function parentPath(pathname: string): string | null {
  if (PARENTS[pathname]) return PARENTS[pathname]!;
  if (isRootPath(pathname)) return null;
  if (pathname.startsWith('/app/')) {
    const parts = pathname.split('/').filter(Boolean);
    return parts.length <= 2 ? '/app' : `/${parts.slice(0, -1).join('/')}`;
  }
  return '/welcome';
}

export interface BackContext {
  pathname: string;
  editableFocused: boolean;
  overlayOpen: boolean;
  /** React Router's history index (0 = first entry this session). */
  historyIndex: number;
  exitArmedAt: number | null;
  now: number;
}

export type BackAction =
  | { type: 'blur' }
  | { type: 'close-overlay' }
  | { type: 'arm-exit' }
  | { type: 'exit' }
  | { type: 'history-back' }
  | { type: 'navigate'; to: string };

export function resolveBack(ctx: BackContext): BackAction {
  if (ctx.editableFocused) return { type: 'blur' };
  if (ctx.overlayOpen) return { type: 'close-overlay' };
  if (isRootPath(ctx.pathname)) {
    return ctx.exitArmedAt !== null && ctx.now - ctx.exitArmedAt <= EXIT_WINDOW_MS ? { type: 'exit' } : { type: 'arm-exit' };
  }
  if (ctx.historyIndex > 0) return { type: 'history-back' };
  const parent = parentPath(ctx.pathname);
  return parent ? { type: 'navigate', to: parent } : { type: 'arm-exit' };
}

/** Text inputs that raise the on-screen keyboard. Selects, checkboxes and buttons do not. */
export function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'hidden', 'image'];
    return !nonText.includes(el.type) && !el.readOnly && !el.disabled;
  }
  return false;
}

// ── Overlay stack ─────────────────────────────────────────────────────────────

interface OverlayEntry {
  id: number;
  close: () => void;
}

const overlays: OverlayEntry[] = [];
let nextOverlayId = 1;

/** Registers an open panel/dialog. Returns the unregister function. */
export function pushOverlay(close: () => void): () => void {
  const entry = { id: nextOverlayId++, close };
  overlays.push(entry);
  return () => {
    const index = overlays.findIndex((o) => o.id === entry.id);
    if (index !== -1) overlays.splice(index, 1);
  };
}

export function hasOverlay(): boolean {
  return overlays.length > 0;
}

/** Closes the most recently opened overlay. */
export function closeTopOverlay(): boolean {
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

// ── Native listener ───────────────────────────────────────────────────────────

let dispatcher: (() => void) | null = null;
let installed = false;

export function setBackDispatcher(fn: () => void): () => void {
  dispatcher = fn;
  return () => {
    if (dispatcher === fn) dispatcher = null;
  };
}

/** Installs the single Capacitor `backButton` listener (no-op if already installed). */
export function installNativeBackButton(): void {
  if (installed) return;
  installed = true;
  // Registering any backButton listener disables Capacitor's default "close the app" behaviour.
  void App.addListener('backButton', () => dispatcher?.());
}

export function exitApp(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.exitApp();
}
