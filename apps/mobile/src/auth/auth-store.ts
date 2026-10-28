import { create } from 'zustand';
import { DATA_MODE } from '@/config/env';
import { getSupabase } from '@/cloud/supabase-client';
import { useSession } from '@/state/session';
import { SupabaseAuthService, type AuthService, type AuthUser } from './auth-service';

let service: AuthService | null = null;

/** The app's AuthService (cloud mode). Tests replace it with a fake. */
export function getAuthService(): AuthService {
  service ??= new SupabaseAuthService(getSupabase());
  return service;
}
export function setAuthServiceForTests(fake: AuthService | null): void {
  service = fake;
}

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** A password-reset link was opened: the user must choose a new password. */
  recovery: boolean;
  /** One-off message for the sign-in screen (e.g. session expired, e-mail verified). */
  notice: string | null;
  set(partial: Partial<Omit<AuthState, 'set'>>): void;
}

export const useAuth = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  recovery: false,
  notice: null,
  set: (partial) => set(partial),
}));

/** The signed-in person, whichever mode the app runs in. */
export function useCurrentUser(): { id: string; email: string; name: string } | null {
  const cloudUser = useAuth((s) => s.user);
  const localUser = useSession((s) => s.user);
  return DATA_MODE === 'cloud' ? cloudUser : localUser;
}

/** Whether we already know if someone is signed in. */
export function useAuthReady(): boolean {
  const status = useAuth((s) => s.status);
  return DATA_MODE !== 'cloud' || status !== 'loading';
}
