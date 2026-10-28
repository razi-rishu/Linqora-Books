import { describe, expect, it } from 'vitest';
import { closeTopOverlay, EXIT_WINDOW_MS, hasOverlay, isEditableElement, parentPath, pushOverlay, resolveBack, type BackContext } from './back';

const base: BackContext = {
  pathname: '/app/reports',
  editableFocused: false,
  overlayOpen: false,
  historyIndex: 3,
  exitArmedAt: null,
  now: 10_000,
};

describe('resolveBack', () => {
  it('hides the keyboard first, and does nothing else', () => {
    expect(resolveBack({ ...base, editableFocused: true, overlayOpen: true, pathname: '/app' })).toEqual({ type: 'blur' });
  });

  it('closes an open panel or dialog before navigating', () => {
    expect(resolveBack({ ...base, overlayOpen: true })).toEqual({ type: 'close-overlay' });
    expect(resolveBack({ ...base, overlayOpen: true, pathname: '/app' })).toEqual({ type: 'close-overlay' });
  });

  it('goes back through in-app history on secondary screens', () => {
    expect(resolveBack(base)).toEqual({ type: 'history-back' });
  });

  it('falls back to the logical parent when there is no history', () => {
    expect(resolveBack({ ...base, historyIndex: 0, pathname: '/app/documents/doc_1' })).toEqual({ type: 'navigate', to: '/app/documents' });
    expect(resolveBack({ ...base, historyIndex: 0, pathname: '/sign-in' })).toEqual({ type: 'navigate', to: '/welcome' });
  });

  it('asks before exiting on the dashboard: first press arms, second press exits', () => {
    const first = resolveBack({ ...base, pathname: '/app' });
    expect(first).toEqual({ type: 'arm-exit' });
    expect(resolveBack({ ...base, pathname: '/app', exitArmedAt: 10_000, now: 10_000 + EXIT_WINDOW_MS })).toEqual({ type: 'exit' });
  });

  it('re-arms instead of exiting when the second press comes too late', () => {
    expect(resolveBack({ ...base, pathname: '/app', exitArmedAt: 10_000, now: 10_001 + EXIT_WINDOW_MS })).toEqual({ type: 'arm-exit' });
  });

  it('never exits from a secondary screen, even with history exhausted', () => {
    for (const pathname of ['/app/transactions', '/app/settings', '/app/documents/x/edit', '/forgot-password']) {
      expect(resolveBack({ ...base, pathname, historyIndex: 0 }).type).toBe('navigate');
    }
  });

  it('treats onboarding entry screens as roots', () => {
    for (const pathname of ['/', '/welcome', '/subscribe', '/setup']) {
      expect(resolveBack({ ...base, pathname }).type).toBe('arm-exit');
    }
  });
});

describe('parentPath', () => {
  it('walks up the app hierarchy', () => {
    expect(parentPath('/app/documents/doc_1/edit')).toBe('/app/documents/doc_1');
    expect(parentPath('/app/documents/doc_1')).toBe('/app/documents');
    expect(parentPath('/app/documents')).toBe('/app');
    expect(parentPath('/app')).toBeNull();
    expect(parentPath('/subscribe/trial')).toBe('/subscribe');
  });
});

describe('isEditableElement', () => {
  it('detects fields that raise the keyboard', () => {
    const text = document.createElement('input');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const readOnly = Object.assign(document.createElement('input'), { readOnly: true });
    expect(isEditableElement(text)).toBe(true);
    expect(isEditableElement(document.createElement('textarea'))).toBe(true);
    expect(isEditableElement(checkbox)).toBe(false);
    expect(isEditableElement(readOnly)).toBe(false);
    expect(isEditableElement(document.createElement('select'))).toBe(false);
    expect(isEditableElement(document.createElement('button'))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

describe('overlay stack', () => {
  it('closes the most recently opened overlay first', () => {
    const closed: string[] = [];
    const removeA = pushOverlay(() => closed.push('a'));
    const removeB = pushOverlay(() => closed.push('b'));
    expect(closeTopOverlay()).toBe(true);
    expect(closed).toEqual(['b']);
    removeB();
    closeTopOverlay();
    expect(closed).toEqual(['b', 'a']);
    removeA();
    expect(hasOverlay()).toBe(false);
    expect(closeTopOverlay()).toBe(false);
  });
});
