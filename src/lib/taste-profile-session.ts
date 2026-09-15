import {
  createEmptyTasteProfile,
  loadTasteProfile,
  saveTasteProfileToLocalStorage,
  type TasteProfile,
} from '@/lib/taste-profile';

/** Taste profile owned by this Clerk user — never merge another account's localStorage row. */
export function localTasteProfileForUser(clerkUserId: string): TasteProfile {
  const userId = clerkUserId.trim();
  if (userId.length === 0) {
    throw new Error('Clerk user id is required.');
  }
  const local = loadTasteProfile();
  if (local != null && local.userId === userId) {
    return local;
  }
  const fresh = createEmptyTasteProfile(userId);
  saveTasteProfileToLocalStorage(fresh);
  return fresh;
}

/** @deprecated Use localTasteProfileForUser — kept for call-site migration. */
export function bindTasteProfileToUserId(
  existing: TasteProfile | null | undefined,
  clerkUserId: string,
): TasteProfile {
  void existing;
  return localTasteProfileForUser(clerkUserId);
}

export const PENDING_INVITE_REF_STORAGE_KEY = 'quiet-table.pending-invite-ref';

export function stashPendingInviteRef(ref: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const trimmed = ref.trim();
  if (trimmed.length === 0) return;
  sessionStorage.setItem(PENDING_INVITE_REF_STORAGE_KEY, trimmed);
}

export function consumePendingInviteRef(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const ref = sessionStorage.getItem(PENDING_INVITE_REF_STORAGE_KEY);
  if (ref != null) sessionStorage.removeItem(PENDING_INVITE_REF_STORAGE_KEY);
  return ref;
}
