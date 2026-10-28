import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { NATIVE_AUTH_CALLBACK } from '@/config/env';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AuthEventType = 'signed-in' | 'signed-out' | 'token-refreshed' | 'password-recovery' | 'user-updated';
export type RedirectType = 'signup' | 'recovery' | 'unknown';

/** Everything the app needs from authentication. Implemented with Supabase Auth; faked in tests. */
export interface AuthService {
  /** Restores a saved session (app start / restart). */
  restore(): Promise<AuthUser | null>;
  onChange(cb: (type: AuthEventType, user: AuthUser | null) => void): () => void;
  signUp(name: string, email: string, password: string): Promise<{ needsVerification: boolean }>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  resendVerification(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Completes an e-mail link (verification or password reset) that opened the app. */
  completeRedirect(url: string): Promise<RedirectType>;
  /** Token refresh only runs while the app is in the foreground. */
  setForeground(active: boolean): void;
}

export class AuthError extends Error {
  override name = 'AuthError';
  constructor(
    message: string,
    readonly code?: 'not-verified' | 'invalid-credentials' | 'network' | 'link-other-device' | 'link-invalid' | 'other',
  ) {
    super(message);
  }
}

function toUser(u: User): AuthUser {
  return { id: u.id, email: u.email ?? '', name: String(u.user_metadata?.display_name ?? '') };
}

function friendly(error: { message: string; code?: string; status?: number }): AuthError {
  const m = error.message ?? '';
  if (/failed to fetch|network|load failed/i.test(m)) {
    return new AuthError('Could not reach the server. Check your connection and try again.', 'network');
  }
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(m)) {
    return new AuthError('Please verify your e-mail first — open the link we sent you.', 'not-verified');
  }
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(m)) {
    return new AuthError('Wrong e-mail or password.', 'invalid-credentials');
  }
  if (/code verifier|both auth code and code verifier/i.test(m)) {
    return new AuthError('This link was opened on a different device or browser than the one that requested it.', 'link-other-device');
  }
  if (/expired|invalid/i.test(m) && /link|token|code|otp/i.test(m)) {
    return new AuthError('This link has expired or was already used. Request a new one.', 'link-invalid');
  }
  return new AuthError(m || 'Something went wrong. Please try again.', 'other');
}

/** Where e-mail links send the user back: the app's deep link on a phone, this page in a browser. */
export function redirectUrl(type: 'signup' | 'recovery'): string {
  const base = Capacitor.isNativePlatform() ? NATIVE_AUTH_CALLBACK : `${window.location.origin}${window.location.pathname}`;
  return `${base}?type=${type}`;
}

export class SupabaseAuthService implements AuthService {
  constructor(private readonly sb: SupabaseClient) {}

  async restore(): Promise<AuthUser | null> {
    const { data, error } = await this.sb.auth.getSession();
    if (error) return null;
    return data.session ? toUser(data.session.user) : null;
  }

  onChange(cb: (type: AuthEventType, user: AuthUser | null) => void): () => void {
    const map: Partial<Record<AuthChangeEvent, AuthEventType>> = {
      SIGNED_IN: 'signed-in',
      SIGNED_OUT: 'signed-out',
      TOKEN_REFRESHED: 'token-refreshed',
      PASSWORD_RECOVERY: 'password-recovery',
      USER_UPDATED: 'user-updated',
    };
    const { data } = this.sb.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const type = map[event];
      // Defer: never call Supabase from inside its own callback (avoids an auth-lock deadlock).
      if (type) setTimeout(() => cb(type, session ? toUser(session.user) : null), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp(name: string, email: string, password: string) {
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: name }, emailRedirectTo: redirectUrl('signup') },
    });
    if (error) throw friendly(error);
    return { needsVerification: !data.session };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw friendly(error);
    return toUser(data.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    // Even offline the local session is removed; the server token simply expires.
    if (error && !/network|fetch/i.test(error.message)) throw friendly(error);
  }

  async resendVerification(email: string): Promise<void> {
    const { error } = await this.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl('signup') } });
    if (error) throw friendly(error);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('recovery') });
    if (error) throw friendly(error);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw friendly(error);
  }

  async completeRedirect(url: string): Promise<RedirectType> {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    // Supabase may put errors in the fragment.
    new URLSearchParams(parsed.hash.replace(/^#\/?[^?]*\??/, '')).forEach((v, k) => params.set(k, v));
    const type: RedirectType = params.get('type') === 'recovery' ? 'recovery' : params.get('type') === 'signup' ? 'signup' : 'unknown';
    const err = params.get('error_description') ?? params.get('error');
    if (err) throw new AuthError(/expired|invalid/i.test(err) ? 'This link has expired or was already used. Request a new one.' : err, 'link-invalid');
    const code = params.get('code');
    if (!code) throw new AuthError('This link is incomplete. Request a new one.', 'link-invalid');
    const { error } = await this.sb.auth.exchangeCodeForSession(code);
    if (error) throw friendly(error);
    return type;
  }

  setForeground(active: boolean): void {
    if (active) void this.sb.auth.startAutoRefresh();
    else void this.sb.auth.stopAutoRefresh();
  }
}
