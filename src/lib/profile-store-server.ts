import {Redis} from '@upstash/redis';
import type {TasteProfile} from '@/lib/taste-profile';
import {hasOnboardingUsername, isOnboardingComplete} from '@/lib/taste-profile';
import {normalizeTasteProfileRecord} from '@/lib/taste-profile-payload';
import {
  normalizeProfileEmail,
  profileEmailIndexKey,
  profilePrimaryEmail,
} from '@/lib/profile-email';
import {lookupClerkPrimaryEmails} from '@/lib/clerk-directory-server';
import {
  listRegisteredMemberUserIds,
  registerMemberUserId,
  unregisterMemberUserId,
} from '@/lib/member-registry-server';

const PROFILE_KEY_PREFIX = 'quiet-table:profile:';

function profileKey(userId: string): string {
  return `${PROFILE_KEY_PREFIX}${userId}`;
}

export function isProfileStoreConfigured(): boolean {
  return getRedisClient() != null;
}

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url == null || url.length === 0 || token == null || token.length === 0) {
    return null;
  }
  return new Redis({url, token});
}

function withStorageUserId(userId: string, profile: TasteProfile): TasteProfile {
  const id = userId.trim();
  return normalizeTasteProfileRecord({...profile, userId: id});
}

async function getUserIdForProfileEmail(email: string): Promise<string | null> {
  const redis = getRedisClient();
  if (redis == null) return null;
  const raw = await redis.get<string>(profileEmailIndexKey(email));
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function withPrimaryEmail(profile: TasteProfile, email: string): TasteProfile {
  if (profilePrimaryEmail(profile) === email) return profile;
  return {...profile, clerk: {...profile.clerk, primaryEmail: email}};
}

function profileRecoveryScore(profile: TasteProfile): number {
  return (
    (isOnboardingComplete(profile) ? 10_000 : 0) +
    Object.keys(profile.venueReactions).length * 10 +
    profile.recentVisits.length +
    (hasOnboardingUsername(profile) ? 100 : 0)
  );
}

export async function getStoredProfile(userId: string): Promise<TasteProfile | null> {
  const redis = getRedisClient();
  if (redis == null) return null;
  const id = userId.trim();
  const raw = await redis.get<TasteProfile>(profileKey(id));
  if (raw == null) return null;
  return withStorageUserId(id, raw);
}

export async function putStoredProfile(
  profile: TasteProfile,
): Promise<{ok: true} | {ok: false; error: string}> {
  const redis = getRedisClient();
  if (redis == null) {
    return {ok: false, error: 'Profile storage is not configured (Upstash Redis env vars missing).'};
  }
  const stored = withStorageUserId(profile.userId, profile);
  await redis.set(profileKey(stored.userId), stored);
  const email = profilePrimaryEmail(stored);
  if (email != null) {
    await redis.set(profileEmailIndexKey(email), stored.userId);
  }
  if (hasOnboardingUsername(stored)) {
    await registerMemberUserId(stored.userId);
  }
  return {ok: true};
}

async function findStoredProfileByEmail(email: string): Promise<TasteProfile | null> {
  const indexedUserId = await getUserIdForProfileEmail(email);
  if (indexedUserId != null) {
    const indexed = await getStoredProfile(indexedUserId);
    if (indexed != null && profilePrimaryEmail(indexed) === email) return indexed;
  }

  let best: TasteProfile | null = null;
  let bestScore = -1;
  for (const id of await listRegisteredMemberUserIds()) {
    const profile = await getStoredProfile(id);
    if (profile == null || profilePrimaryEmail(profile) !== email) continue;
    const score = profileRecoveryScore(profile);
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}

async function migrateStoredProfileToUserId(
  source: TasteProfile,
  sessionUserId: string,
  email: string,
): Promise<TasteProfile> {
  const fromId = source.userId.trim();
  const migrated = withStorageUserId(sessionUserId, {
    ...withPrimaryEmail(source, email),
    updatedAt: new Date().toISOString(),
  });
  const saved = await putStoredProfile(migrated);
  if (saved.ok && fromId !== migrated.userId) {
    await getRedisClient()?.del(profileKey(fromId));
    await unregisterMemberUserId(fromId);
  }
  return migrated;
}

/**
 * Sign-in: the profile under this Clerk id, or — when Clerk issued a new id for the same email
 * (account deleted and recreated) — the profile left behind by the old, now-deleted account.
 * Returns null for a genuinely new email, which sends the user through onboarding.
 */
export async function resolveProfileForSession(
  sessionUserId: string,
  primaryEmail: string | null | undefined,
): Promise<TasteProfile | null> {
  const userId = sessionUserId.trim();
  const email = normalizeProfileEmail(primaryEmail);

  const own = await getStoredProfile(userId);
  if (own != null) {
    if (email != null) {
      const tagged = withPrimaryEmail(own, email);
      const indexedUserId = await getUserIdForProfileEmail(email);
      if (tagged !== own || indexedUserId !== userId) {
        await putStoredProfile(tagged);
      }
      return tagged;
    }
    return own;
  }

  if (email == null) return null;
  const previous = await findStoredProfileByEmail(email);
  if (previous == null || previous.userId === userId) return null;

  // Only adopt a profile whose Clerk account is gone; a live account still owns its own data.
  const liveAccounts = await lookupClerkPrimaryEmails([previous.userId]);
  if (liveAccounts == null || liveAccounts.has(previous.userId)) return null;

  return migrateStoredProfileToUserId(previous, userId, email);
}
