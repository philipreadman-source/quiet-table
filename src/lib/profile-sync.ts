import {
  createEmptyTasteProfile,
  hasOnboardingUsername,
  isOnboardingComplete,
  saveTasteProfileToLocalStorage,
  type TasteProfile,
} from '@/lib/taste-profile';
import {loadLocalTasteProfileForUser} from '@/lib/taste-profile-session';

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

function persistLocal(profile: TasteProfile): TasteProfile {
  saveTasteProfileToLocalStorage(profile);
  return profile;
}

function maybePushCompleteLocalToServer(local: TasteProfile): void {
  if (isOnboardingComplete(local)) {
    void pushTasteProfileToServer(local);
  }
}

/**
 * Merge server copy with local — fetch remote before creating an empty local row.
 * Returning users with a server profile skip onboarding even if localStorage was cleared or held another account.
 */
export async function hydrateTasteProfileWithServer(clerkUserId: string): Promise<TasteProfile> {
  const userId = clerkUserId.trim();
  const remote = await fetchTasteProfileFromServer();
  const local = loadLocalTasteProfileForUser(userId);

  if (remote != null && remote.userId === userId) {
    if (local == null) {
      return persistLocal(remote);
    }

    const localComplete = isOnboardingComplete(local);
    const remoteComplete = isOnboardingComplete(remote);

    if (!localComplete && remoteComplete) {
      return persistLocal(remote);
    }
    if (localComplete && !remoteComplete) {
      maybePushCompleteLocalToServer(local);
      return local;
    }
    if (!localComplete && !remoteComplete) {
      if (hasOnboardingUsername(remote) && !hasOnboardingUsername(local)) {
        return persistLocal(remote);
      }
      if (hasOnboardingUsername(local) && !hasOnboardingUsername(remote)) {
        return local;
      }
      if (!hasOnboardingUsername(local) && !hasOnboardingUsername(remote)) {
        return persistLocal(remote);
      }
    }

    const remoteTime = Date.parse(remote.updatedAt);
    const localTime = Date.parse(local.updatedAt);
    if (Number.isFinite(remoteTime) && Number.isFinite(localTime) && remoteTime > localTime) {
      return persistLocal(remote);
    }
    if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) {
      maybePushCompleteLocalToServer(local);
    }
    return local;
  }

  if (remote != null && remote.userId !== userId) {
    return persistLocal(createEmptyTasteProfile(userId));
  }

  if (local != null) {
    if (hasOnboardingUsername(local)) {
      void pushTasteProfileToServer(local);
    }
    return local;
  }

  return persistLocal(createEmptyTasteProfile(userId));
}
