import type {TasteProfile} from '@/lib/taste-profile';

export const PROFILE_EMAIL_INDEX_PREFIX = 'quiet-table:profile-by-email:';

export function normalizeProfileEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value != null && value.length > 0 ? value : null;
}

export function profilePrimaryEmail(profile: TasteProfile): string | null {
  return normalizeProfileEmail(profile.clerk?.primaryEmail);
}

export function profileEmailIndexKey(email: string): string {
  return `${PROFILE_EMAIL_INDEX_PREFIX}${normalizeProfileEmail(email) ?? email}`;
}
