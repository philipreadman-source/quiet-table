import type {TasteProfile} from '@/lib/taste-profile';

type ClerkUserIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  hasImage?: boolean;
  imageUrl?: string;
};

/** Public Clerk fields stored on the taste profile for avatars and display names. */
export function mergeClerkUserIntoProfile(
  profile: TasteProfile,
  user: ClerkUserIdentity | null | undefined,
): TasteProfile {
  if (user == null) return profile;

  const imageUrl = user.hasImage && user.imageUrl != null ? user.imageUrl : undefined;
  const firstName = user.firstName?.trim() || undefined;
  const lastName = user.lastName?.trim() || undefined;

  const prev = profile.clerk;
  const sameClerk =
    prev?.firstName === firstName &&
    prev?.lastName === lastName &&
    prev?.imageUrl === imageUrl;
  const sameAvatar = profile.avatarSrc === imageUrl || (imageUrl == null && profile.avatarSrc == null);
  if (sameClerk && sameAvatar) return profile;

  return {
    ...profile,
    clerk: {firstName, lastName, imageUrl},
    avatarSrc: imageUrl ?? profile.avatarSrc,
    updatedAt: new Date().toISOString(),
  };
}

export function clerkDisplayName(profile: TasteProfile): string {
  const parts = [profile.clerk?.firstName, profile.clerk?.lastName].filter(
    (part): part is string => part != null && part.length > 0,
  );
  if (parts.length > 0) return parts.join(' ');
  return profile.username.trim();
}

export function clerkShortName(profile: TasteProfile): string {
  const first = profile.clerk?.firstName?.trim();
  if (first != null && first.length > 0) return first;
  return profile.username.trim();
}
