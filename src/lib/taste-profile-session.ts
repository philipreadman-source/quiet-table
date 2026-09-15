import {
  createEmptyTasteProfile,
  loadTasteProfile,
  saveTasteProfileToLocalStorage,
  type TasteProfile,
} from '@/lib/taste-profile';

/** Binds local taste data to the signed-in Clerk user id (migrates anonymous UUID profiles once). */
export function bindTasteProfileToUserId(
  existing: TasteProfile | null | undefined,
  clerkUserId: string,
): TasteProfile {
  const userId = clerkUserId.trim();
  if (userId.length === 0) {
    throw new Error('Clerk user id is required.');
  }
  const local = existing ?? loadTasteProfile();
  if (local == null || local.userId === userId) {
    const next = local ?? createEmptyTasteProfile(userId);
    if (next.userId !== userId) {
      const rebound = {...next, userId, updatedAt: new Date().toISOString()};
      saveTasteProfileToLocalStorage(rebound);
      return rebound;
    }
    if (local == null) saveTasteProfileToLocalStorage(next);
    return next;
  }
  const migrated: TasteProfile = {
    ...local,
    userId,
    updatedAt: new Date().toISOString(),
  };
  saveTasteProfileToLocalStorage(migrated);
  return migrated;
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
