import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { newId } from '@linqora-books/shared';

/**
 * LOCAL PROTOTYPE sign-in. No account is created on any server and no password is
 * stored: Phase 1 only remembers the e-mail and name on this device so screens can
 * be exercised. Real authentication (Supabase Auth) arrives in Phase 2.
 */
export interface LocalUser {
  id: string;
  email: string;
  name: string;
}

interface SessionState {
  knownUsers: LocalUser[];
  user: LocalUser | null;
  signUp(name: string, email: string): LocalUser;
  signIn(email: string): LocalUser;
  signOut(): void;
}

export class AuthError extends Error {
  override name = 'AuthError';
}

const normalise = (email: string) => email.trim().toLowerCase();

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      knownUsers: [],
      user: null,
      signUp(name, email) {
        const e = normalise(email);
        if (get().knownUsers.some((u) => u.email === e)) {
          throw new AuthError('A local test account with this e-mail already exists on this device. Sign in instead.');
        }
        const user: LocalUser = { id: newId('user'), email: e, name: name.trim() };
        set((s) => ({ knownUsers: [...s.knownUsers, user], user }));
        return user;
      },
      signIn(email) {
        const user = get().knownUsers.find((u) => u.email === normalise(email));
        if (!user) throw new AuthError('No local test account with this e-mail on this device. Create one first.');
        set({ user });
        return user;
      },
      signOut() {
        set({ user: null });
      },
    }),
    { name: 'linqora-books:session:v1', storage: createJSONStorage(() => localStorage) },
  ),
);
