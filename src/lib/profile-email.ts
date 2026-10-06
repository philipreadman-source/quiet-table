import type {TasteProfile} from '@/lib/taste-profile';

export function normalizeProfileEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value != null && value.length > 0 ? value : null;
}

export function profilePrimaryEmail(profile: TasteProfile): string | null {
  return normalizeProfileEmail(profile.clerk?.primaryEmail);
}
