import {Redis} from '@upstash/redis';
import type {TasteProfile} from '@/lib/taste-profile';
import {hasOnboardingUsername, isOnboardingComplete} from '@/lib/taste-profile';
import {normalizeTasteProfileRecord} from '@/lib/taste-profile-payload';
import {
  normalizeProfileEmail,
  profileEmailIndexKey,
  profilePrimaryEmail,
} from '@/lib/profile-email';
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
  const normalized = normalizeProfileEmail(email);
  if (normalized == null) return null;
  const raw = await redis.get<string>(profileEmailIndexKey(normalized));
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

async function setProfileEmailIndex(email: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  if (redis == null) return;
  const normalized = normalizeProfileEmail(email);
  if (normalized == null) return;
  await redis.set(profileEmailIndexKey(normalized), userId.trim());
}

async function retireStoredProfile(userId: string): Promise<void> {
  const redis = getRedisClient();
  const id = userId.trim();
  if (redis != null) {
    await redis.del(profileKey(id));
  }
  await unregisterMemberUserId(id);
}

function withPrimaryEmail(profile: TasteProfile, email: string): TasteProfile {
  const normalized = normalizeProfileEmail(email);
  if (normalized == null || profilePrimaryEmail(profile) === normalized) return profile;
  return {...profile, clerk: {...profile.clerk, primaryEmail: normalized}};
}

function clerkNamesMatch(
  profile: TasteProfile,
  firstName?: string | null,
  lastName?: string | null,
): boolean {
  const pf = profile.clerk?.firstName?.trim().toLowerCase();
  const pl = profile.clerk?.lastName?.trim().toLowerCase();
  const cf = firstName?.trim().toLowerCase();
  const cl = lastName?.trim().toLowerCase();
  if (cf == null || cf.length === 0 || pf == null || pf.length === 0) return false;
  if (pf !== cf) return false;
  if (cl != null && cl.length > 0 && pl != null && pl.length > 0 && pl !== cl) return false;
  return true;
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
  const email = profilePrimaryEmail(stored);
  if (email != null) {
    const previousOwner = await getUserIdForProfileEmail(email);
    if (previousOwner != null && previousOwner !== stored.userId) {
      await retireStoredProfile(previousOwner);
    }
    await setProfileEmailIndex(email, stored.userId);
  }
  await redis.set(profileKey(stored.userId), stored);
  if (hasOnboardingUsername(stored)) {
    await registerMemberUserId(stored.userId);
  }
  return {ok: true};
}

export async function findStoredProfileByEmail(email: string): Promise<TasteProfile | null> {
  const normalized = normalizeProfileEmail(email);
  if (normalized == null) return null;

  const indexedUserId = await getUserIdForProfileEmail(normalized);
  if (indexedUserId != null) {
    const indexed = await getStoredProfile(indexedUserId);
    if (indexed != null) return indexed;
  }

  const ids = await listRegisteredMemberUserIds();
  let best: TasteProfile | null = null;
  let bestScore = -1;
  for (const id of ids) {
    const profile = await getStoredProfile(id);
    if (profile == null) continue;
    if (profilePrimaryEmail(profile) !== normalized) continue;
    const score = profileRecoveryScore(profile);
    if (score >= bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}

/** Profiles saved before primaryEmail — recover when Clerk assigns a new user id. */
async function findStoredProfileByClerkIdentity(
  sessionUserId: string,
  firstName?: string | null,
  lastName?: string | null,
): Promise<TasteProfile | null> {
  let best: TasteProfile | null = null;
  let bestScore = -1;
  for (const id of await listRegisteredMemberUserIds()) {
    if (id === sessionUserId) continue;
    const profile = await getStoredProfile(id);
    if (profile == null || !hasOnboardingUsername(profile)) continue;
    if (!clerkNamesMatch(profile, firstName, lastName)) continue;
    const score = profileRecoveryScore(profile);
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}

export async function migrateStoredProfileToUserId(
  source: TasteProfile,
  sessionUserId: string,
  primaryEmail?: string | null,
): Promise<TasteProfile> {
  const targetId = sessionUserId.trim();
  const fromId = source.userId.trim();
  const email =
    normalizeProfileEmail(primaryEmail) ?? profilePrimaryEmail(source);
  const body = email != null ? withPrimaryEmail(source, email) : source;
  const migrated: TasteProfile = {
    ...body,
    userId: targetId,
    updatedAt: new Date().toISOString(),
  };
  const saved = await putStoredProfile(migrated);
  if (!saved.ok) return withStorageUserId(targetId, migrated);
  if (fromId !== targetId) {
    await retireStoredProfile(fromId);
  }
  return withStorageUserId(targetId, migrated);
}

/**
 * Sign-in path: one taste profile per email. Clerk user id may change; email is canonical.
 */
export async function resolveProfileForSession(
  sessionUserId: string,
  options: {
    primaryEmail?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<TasteProfile | null> {
  const userId = sessionUserId.trim();
  const email = normalizeProfileEmail(options.primaryEmail);

  let profile = await getStoredProfile(userId);
  if (profile != null) {
    if (email != null) {
      profile = withPrimaryEmail(profile, email);
      if (profilePrimaryEmail(profile) === email) {
        await putStoredProfile(profile);
      }
    }
    return profile;
  }

  if (email != null) {
    const existing = await findStoredProfileByEmail(email);
    if (existing != null) {
      return migrateStoredProfileToUserId(existing, userId, email);
    }
  }

  const legacy = await findStoredProfileByClerkIdentity(
    userId,
    options.firstName,
    options.lastName,
  );
  if (legacy != null) {
    return migrateStoredProfileToUserId(legacy, userId, email);
  }

  return null;
}
