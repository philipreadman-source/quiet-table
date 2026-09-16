import type {TasteProfile} from '@/lib/taste-profile';
import {validateUsername} from '@/lib/taste-profile';

/** Shared client/server validation for PUT /api/profile. */
export function parseTasteProfilePayload(
  body: unknown,
): {ok: true; profile: TasteProfile} | {ok: false; error: string} {
  if (body == null || typeof body !== 'object') {
    return {ok: false, error: 'Profile body must be a JSON object.'};
  }
  const record = body as Record<string, unknown>;
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  if (userId.length < 8) {
    return {ok: false, error: 'Profile userId is required.'};
  }
  const usernameRaw = typeof record.username === 'string' ? record.username : '';
  let username = '';
  if (usernameRaw.trim().length > 0) {
    const usernameCheck = validateUsername(usernameRaw);
    if (!usernameCheck.ok) {
      return {ok: false, error: usernameCheck.error};
    }
    username = usernameCheck.value;
  }
  const normalized = normalizeTasteProfileRecord(body as TasteProfile);
  if (normalized.userId !== userId) {
    return {ok: false, error: 'Profile userId mismatch.'};
  }
  return {
    ok: true,
    profile: {...normalized, username},
  };
}

/** Server PUT — profile userId always comes from the Clerk session. */
export function parseTasteProfilePayloadForSession(
  body: unknown,
  sessionUserId: string,
): {ok: true; profile: TasteProfile} | {ok: false; error: string} {
  const userId = sessionUserId.trim();
  if (userId.length < 8) {
    return {ok: false, error: 'Invalid session user id.'};
  }
  if (body == null || typeof body !== 'object') {
    return {ok: false, error: 'Profile body must be a JSON object.'};
  }
  const record = body as Record<string, unknown>;
  const usernameRaw = typeof record.username === 'string' ? record.username : '';
  let username = '';
  if (usernameRaw.trim().length > 0) {
    const usernameCheck = validateUsername(usernameRaw);
    if (!usernameCheck.ok) {
      return {ok: false, error: usernameCheck.error};
    }
    username = usernameCheck.value;
  }
  const normalized = normalizeTasteProfileRecord(body as TasteProfile);
  return {
    ok: true,
    profile: {...normalized, userId, username},
  };
}

export function normalizeTasteProfileRecord(profile: TasteProfile): TasteProfile {
  const avatarSrc =
    profile.avatarSrc != null && profile.avatarSrc.length > 0 ? profile.avatarSrc : undefined;
  const positivePlaceOrder = Array.isArray(profile.positivePlaceOrder)
    ? profile.positivePlaceOrder.filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  return {...profile, avatarSrc, positivePlaceOrder};
}
