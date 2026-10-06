import {lookupClerkPrimaryEmails} from '@/lib/clerk-directory-server';
import {getStoredProfile, isProfileStoreConfigured} from '@/lib/profile-store-server';
import {normalizeProfileEmail, profilePrimaryEmail} from '@/lib/profile-email';
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

export async function unregisterMemberUserId(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (redis == null) return;
  const id = userId.trim();
  if (id.length === 0) return;
  await redis.srem(MEMBER_IDS_KEY, id);
}

export async function listRegisteredMemberUserIds(): Promise<string[]> {
  const redis = getRedisClient();
  if (redis == null) return [];
  const raw: unknown = await redis.smembers(MEMBER_IDS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function listMemberProfilesForSession(
  sessionUserId: string,
  sessionEmail?: string | null,
): Promise<{ok: true; profiles: TasteProfile[]} | {ok: false; error: string}> {
  if (!isProfileStoreConfigured()) {
    return {ok: false, error: 'Profile storage is not configured.'};
  }
  const selfId = sessionUserId.trim();
  const selfEmail = normalizeProfileEmail(sessionEmail);
  const others = (await listRegisteredMemberUserIds()).filter((id) => id !== selfId);
  // Redis may be shared across environments, so deleted accounts are hidden, never pruned.
  const liveAccounts = await lookupClerkPrimaryEmails(others);
  const visible = liveAccounts == null ? others : others.filter((id) => liveAccounts.has(id));
  const profiles = await Promise.all(visible.map((id) => getStoredProfile(id)));
  const seenEmails = new Set<string>();
  if (selfEmail != null) seenEmails.add(selfEmail);

  return {
    ok: true,
    profiles: profiles.filter((profile): profile is TasteProfile => {
      if (profile == null || !hasOnboardingUsername(profile)) return false;
      const email = liveAccounts?.get(profile.userId) ?? profilePrimaryEmail(profile);
      if (email != null) {
        if (seenEmails.has(email)) return false;
        seenEmails.add(email);
      }
      return true;
    }),
  };
}
