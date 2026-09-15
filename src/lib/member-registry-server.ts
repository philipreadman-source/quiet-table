import {getStoredProfile, isProfileStoreConfigured} from '@/lib/profile-store-server';
import {hasOnboardingUsername, type TasteProfile} from '@/lib/taste-profile';
import {Redis} from '@upstash/redis';

const MEMBER_IDS_KEY = 'quiet-table:member-ids';

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url == null || url.length === 0 || token == null || token.length === 0) {
    return null;
  }
  return new Redis({url, token});
}

/** Beta rule: anyone who completed basics (username) is in the shared member directory. */
export async function registerMemberUserId(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (redis == null) return;
  const id = userId.trim();
  if (id.length < 8) return;
  await redis.sadd(MEMBER_IDS_KEY, id);
}

export async function listRegisteredMemberUserIds(): Promise<string[]> {
  const redis = getRedisClient();
  if (redis == null) return [];
  const ids = await redis.smembers<string>(MEMBER_IDS_KEY);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id.length > 0) : [];
}

export async function listMemberProfilesForSession(
  sessionUserId: string,
): Promise<{ok: true; profiles: TasteProfile[]} | {ok: false; error: string}> {
  if (!isProfileStoreConfigured()) {
    return {ok: false, error: 'Profile storage is not configured.'};
  }
  const selfId = sessionUserId.trim();
  const ids = await listRegisteredMemberUserIds();
  const others = ids.filter((id) => id !== selfId);
  const profiles = await Promise.all(others.map((id) => getStoredProfile(id)));
  return {
    ok: true,
    profiles: profiles.filter(
      (profile): profile is NonNullable<typeof profile> =>
        profile != null && hasOnboardingUsername(profile),
    ),
  };
}
