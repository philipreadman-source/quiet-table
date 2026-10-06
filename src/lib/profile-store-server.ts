import {Redis} from '@upstash/redis';
import type {TasteProfile} from '@/lib/taste-profile';
import {hasOnboardingUsername} from '@/lib/taste-profile';
import {normalizeTasteProfileRecord} from '@/lib/taste-profile-payload';
import {normalizeProfileEmail, profilePrimaryEmail} from '@/lib/profile-email';
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
  if (hasOnboardingUsername(stored)) {
    await registerMemberUserId(stored.userId);
  }
  return {ok: true};
}

/** When Clerk creates a second user id for the same email, attach the existing beta profile. */
export async function findStoredProfileByEmail(email: string): Promise<TasteProfile | null> {
  const normalized = normalizeProfileEmail(email);
  if (normalized == null) return null;
  const ids = await listRegisteredMemberUserIds();
  let best: TasteProfile | null = null;
  let bestTime = -1;
  for (const id of ids) {
    const profile = await getStoredProfile(id);
    if (profile == null) continue;
    if (profilePrimaryEmail(profile) !== normalized) continue;
    const t = Date.parse(profile.updatedAt);
    if (!Number.isFinite(t) || t >= bestTime) {
      best = profile;
      bestTime = Number.isFinite(t) ? t : bestTime;
    }
  }
  return best;
}

export async function migrateStoredProfileToUserId(
  source: TasteProfile,
  sessionUserId: string,
): Promise<TasteProfile> {
  const targetId = sessionUserId.trim();
  const fromId = source.userId.trim();
  const migrated: TasteProfile = {
    ...source,
    userId: targetId,
    updatedAt: new Date().toISOString(),
  };
  const saved = await putStoredProfile(migrated);
  if (!saved.ok) return withStorageUserId(targetId, migrated);
  if (fromId !== targetId) {
    const redis = getRedisClient();
    if (redis != null) {
      await redis.del(profileKey(fromId));
    }
    await unregisterMemberUserId(fromId);
  }
  return withStorageUserId(targetId, migrated);
}
