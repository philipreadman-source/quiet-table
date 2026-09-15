import {
  createEmptyTasteProfile,
  hasOnboardingUsername,
  saveTasteProfileToLocalStorage,
  type TasteProfile,
} from '@/lib/taste-profile';
import {localTasteProfileForUser} from '@/lib/taste-profile-session';

export function shouldSyncProfileToServer(profile: TasteProfile): boolean {
  return profile.userId.trim().length > 0 && hasOnboardingUsername(profile);
}

export async function pushTasteProfileToServer(profile: TasteProfile): Promise<boolean> {
  if (!shouldSyncProfileToServer(profile)) return false;
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(profile),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchTasteProfileFromServer(): Promise<TasteProfile | null> {
  try {
    const res = await fetch('/api/profile');
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as {profile?: TasteProfile};
    return body.profile ?? null;
  } catch {
    return null;
  }
}

/** Merge server copy when newer; never apply another user's localStorage to this Clerk id. */
export async function hydrateTasteProfileWithServer(clerkUserId: string): Promise<TasteProfile> {
  const userId = clerkUserId.trim();
  const local = localTasteProfileForUser(userId);
  const remote = await fetchTasteProfileFromServer();

  if (remote == null) {
    if (hasOnboardingUsername(local)) {
      void pushTasteProfileToServer(local);
    }
    return local;
  }

  if (remote.userId !== userId) {
    const fresh = createEmptyTasteProfile(userId);
    saveTasteProfileToLocalStorage(fresh);
    return fresh;
  }

  const remoteTime = Date.parse(remote.updatedAt);
  const localTime = Date.parse(local.updatedAt);
  if (Number.isFinite(remoteTime) && Number.isFinite(localTime) && remoteTime > localTime) {
    saveTasteProfileToLocalStorage(remote);
    return remote;
  }
  if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) {
    void pushTasteProfileToServer(local);
  }
  return local;
}
