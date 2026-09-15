import type {FriendFoodProfile} from '@/lib/friend-graph-mock';
import {getFriendFoodProfile} from '@/lib/friend-graph-mock';
import {clerkDisplayName, clerkShortName} from '@/lib/clerk-profile';
import {CUISINE_OPTIONS, type TasteProfile} from '@/lib/taste-profile';

function dietaryNotesFromProfile(profile: TasteProfile): string | undefined {
  const lean = profile.preferences.dietaryLean;
  if (lean == null || lean === 'none' || lean === 'mixed') return undefined;
  if (lean === 'vegetarian') return 'vegetarian';
  if (lean === 'vegan') return 'vegan';
  return undefined;
}

function tasteSummaryFromProfile(profile: TasteProfile): string {
  const affinities = profile.preferences.cuisineAffinities ?? [];
  const labels = affinities
    .map((id) => CUISINE_OPTIONS.find((option) => option.id === id)?.label)
    .filter((label): label is string => label != null && label.length > 0);
  if (labels.length > 0) return labels.join(', ');
  return 'Quiet Table member';
}

/** Map a stored member profile to the friend card shape used in Friends + wizard. */
export function tasteProfileToFriendFoodProfile(profile: TasteProfile): FriendFoodProfile {
  const fullName = clerkDisplayName(profile);
  const name = clerkShortName(profile);
  const display =
    fullName.length > 0 ? fullName : profile.username.trim().length > 0 ? profile.username : 'Member';
  const short = name.length > 0 ? name : display;

  return {
    id: profile.userId,
    name: short,
    fullName: display,
    relationship: 'close_friend',
    homeArea: profile.homeArea.trim().length > 0 ? profile.homeArea.trim() : '—',
    tasteSummary: tasteSummaryFromProfile(profile),
    cuisineAffinities: profile.preferences.cuisineAffinities ?? [],
    dietaryNotes: dietaryNotesFromProfile(profile),
    avatarSrc: profile.clerk?.imageUrl ?? profile.avatarSrc,
    topPicks: [],
  };
}

export function resolveFriendFoodProfile(
  id: string,
  members: readonly FriendFoodProfile[],
): FriendFoodProfile | undefined {
  const member = members.find((friend) => friend.id === id);
  if (member != null) return member;
  return getFriendFoodProfile(id);
}
