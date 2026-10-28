import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { App } from '@capacitor/app';
import { DATA_MODE } from '@/config/env';
import { getAuthService, useAuth } from './auth-store';
import { AuthError } from './auth-service';
import { signOutRequested } from './sign-out';
import { isAuthCallbackUrl } from './deep-link';

let nativeInstalled = false;
let urlHandler: ((url: string) => void) | null = null;
let resumeHandler: ((active: boolean) => void) | null = null;

/** One listener each for deep links and app resume, for the page lifetime. */
function installNativeListeners(): void {
  if (nativeInstalled) return;
  nativeInstalled = true;
  void App.addListener('appUrlOpen', ({ url }) => urlHandler?.(url));
  void App.addListener('appStateChange', ({ isActive }) => resumeHandler?.(isActive));
  void App.getLaunchUrl()
    .then((launch) => launch?.url && urlHandler?.(launch.url))
    .catch(() => undefined);
}

/**
 * Cloud mode only. Restores the session at start-up, follows auth changes
 * (expired session → sign-in with a message), completes e-mail links for
 * verification and password reset, and pauses token refresh in the background.
 */
export function AuthController() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuth = useAuth((s) => s.set);
  const latest = useRef({ navigate, queryClient });
  useEffect(() => {
    latest.current = { navigate, queryClient };
  });

  useEffect(() => {
    if (DATA_MODE !== 'cloud') return;
    const auth = getAuthService();
    let cancelled = false;

    void auth.restore().then((user) => {
      if (cancelled) return;
      setAuth({ status: user ? 'signed-in' : 'signed-out', user });
    });

    const unsubscribe = auth.onChange((type, user) => {
      const { navigate: nav, queryClient: qc } = latest.current;
      if (type === 'signed-out') {
        const expected = signOutRequested.consume();
        qc.clear();
        setAuth({
          status: 'signed-out',
          user: null,
          recovery: false,
          notice: expected ? null : 'Your session has expired. Please sign in again.',
        });
        void nav('/sign-in', { replace: true });
      } else if (type === 'password-recovery') {
        setAuth({ status: 'signed-in', user, recovery: true });
        void nav('/reset-password', { replace: true });
      } else {
        setAuth({ status: user ? 'signed-in' : 'signed-out', user });
      }
    });

    urlHandler = async (url: string) => {
      if (!isAuthCallbackUrl(url)) return;
      const { navigate: nav } = latest.current;
      void nav('/auth/callback', { replace: true });
      try {
        const type = await auth.completeRedirect(url);
        const user = await auth.restore();
        if (type === 'recovery') {
          setAuth({ status: 'signed-in', user, recovery: true });
          void nav('/reset-password', { replace: true });
        } else {
          setAuth({ status: user ? 'signed-in' : 'signed-out', user, notice: 'Your e-mail address is verified.' });
          void nav('/', { replace: true });
        }
      } catch (e) {
        const err = e instanceof AuthError ? e : new AuthError('This link could not be used.');
        setAuth({
          notice:
            err.code === 'link-other-device'
              ? 'Your e-mail may already be verified. Please sign in. (The link was opened on another device.)'
              : err.message,
        });
        void nav('/sign-in', { replace: true });
      }
    };
    resumeHandler = (active: boolean) => {
      auth.setForeground(active);
      // Back in the app: refresh cloud data (another device may have changed it).
      if (active) void latest.current.queryClient.invalidateQueries();
    };
    installNativeListeners();

    // Browser builds: the e-mail link opens this page with ?code=…
    if (isAuthCallbackUrl(window.location.href)) {
      const url = window.location.href;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
      void urlHandler(url);
    }

    return () => {
      cancelled = true;
      unsubscribe();
      urlHandler = null;
      resumeHandler = null;
    };
  }, [setAuth]);

  return null;
}
