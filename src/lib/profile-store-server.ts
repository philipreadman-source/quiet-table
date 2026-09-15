import {Redis} from '@upstash/redis';
import type {TasteProfile} from '@/lib/taste-profile';
import {normalizeTasteProfileRecord} from '@/lib/taste-profile-payload';

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

export async function getStoredProfile(userId: string): Promise<TasteProfile | null> {
  const redis = getRedisClient();
  if (redis == null) return null;
  const raw = await redis.get<TasteProfile>(profileKey(userId));
  if (raw == null) return null;
  return normalizeTasteProfileRecord(raw);
}

export async function putStoredProfile(
  profile: TasteProfile,
): Promise<{ok: true} | {ok: false; error: string}> {
  const redis = getRedisClient();
  if (redis == null) {
    return {ok: false, error: 'Profile storage is not configured (Upstash Redis env vars missing).'};
  }
  await redis.set(profileKey(profile.userId), profile);
  return {ok: true};
}
