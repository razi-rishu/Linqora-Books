import { DATA_MODE } from '@/config/env';
import { useSession } from '@/state/session';
import { getAuthService } from './auth-store';

/** Distinguishes "the user signed out" from "the session expired". */
export const signOutRequested = {
  pending: false,
  consume(): boolean {
    const was = this.pending;
    this.pending = false;
    return was;
  },
};

export async function signOut(): Promise<void> {
  if (DATA_MODE === 'cloud') {
    signOutRequested.pending = true;
    await getAuthService().signOut();
  } else {
    useSession.getState().signOut();
  }
}
