import type {DietaryNeeds} from '@/lib/venue-options';

export type FriendPick = {
  venueId: string;
  title: string;
  vibe: string;
  note: string;
  visitedAt: string;
  rating: 'loved' | 'liked' | 'fine';
  /** 2+ → card shows repeat-guest social line (still requires liked/loved). */
  visitCount?: number;
};

export type FriendFoodProfile = {
  id: string;
  name: string;
  fullName: string;
  relationship: 'close_friend';
  homeArea: string;
  tasteSummary: string;
  cuisineAffinities: string[];
  /** How they eat — surfaced to the agent and when filtering for a friend. */
  dietaryNotes?: string;
  /** Public URL under /personas — deployed with the app on Vercel. */
  avatarSrc?: string;
  topPicks: FriendPick[];
  /** Cuisine-tailored suggestions — not visits yet. */
  suggestedPicks?: FriendPick[];
};

export function recentFriendVisits(friend: FriendFoodProfile, limit = 2): FriendPick[] {
  return [...friend.topPicks]
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
    .slice(0, limit);
}

export function summarizeFriendForAgent(friend: FriendFoodProfile) {
  return {
    id: friend.id,
    name: friend.name,
    fullName: friend.fullName,
    relationship: friend.relationship,
    tasteSummary: friend.tasteSummary,
    cuisineAffinities: friend.cuisineAffinities,
    dietaryNotes: friend.dietaryNotes,
    topPicks: friend.topPicks.map((pick) => ({
      venueId: pick.venueId,
      title: pick.title,
      vibe: pick.vibe,
      note: pick.note,
      visitedAt: pick.visitedAt,
      rating: pick.rating,
    })),
  };
}

export type FriendDietaryLean = 'none' | 'pescatarian' | 'vegetarian' | 'vegan';

export function friendDietaryLean(friend: FriendFoodProfile): FriendDietaryLean {
  const notes = friend.dietaryNotes?.toLowerCase() ?? '';
  if (notes.includes('vegan')) return 'vegan';
  // 'pescatarian' only: free-text notes like "allergic to fish" must not loosen a diet.
  if (notes.includes('pescatarian')) return 'pescatarian';
  if (notes.includes('vegetarian')) return 'vegetarian';
  return 'none';
}

type FriendLookup = (id: string) => FriendFoodProfile | undefined;

/** Map wizard companion picks → table dietary needs + copy for the agent/UI. */
export function derivePartyDietaryFromCompanions(
  friendIds: string[],
  lookup: FriendLookup,
): {
  dietaryNeeds: DietaryNeeds;
  summary: string;
} | null {
  if (friendIds.length === 0) return null;

  const friends = friendIds
    .map((id) => lookup(id))
    .filter((friend): friend is FriendFoodProfile => friend != null);
  if (friends.length === 0) return null;

  const leans = friends.map(friendDietaryLean);
  const names = friends.map((f) => f.name);
  const hasRestriction = leans.some((lean) => lean !== 'none');
  if (!hasRestriction) return null;

  const hasVegan = leans.includes('vegan');
  const hasPesc = leans.includes('pescatarian');
  const hasVeg = leans.includes('vegetarian');
  const hasUnrestricted = leans.includes('none');

  if (hasVegan) {
    return {
      dietaryNeeds: 'vegan',
      summary: `${names.join(' and ')} — vegan at the table.`,
    };
  }

  if (hasPesc && hasUnrestricted) {
    return {
      dietaryNeeds: 'mixed',
      summary: `${names.filter((_, i) => leans[i] === 'pescatarian').join(' and ')} is pescatarian (fish OK, no meat) — mixed party.`,
    };
  }

  if (hasPesc && !hasUnrestricted) {
    return {
      dietaryNeeds: 'pescatarian',
      summary: `${names.join(' and ')} — pescatarian (fish and seafood OK, no meat).`,
    };
  }

  if (hasVeg && hasUnrestricted) {
    return {
      dietaryNeeds: 'mixed',
      summary: `${names.join(', ')} — vegetarian needs in the group.`,
    };
  }

  if (hasVeg) {
    return {
      dietaryNeeds: 'vegetarian',
      summary: `${names.join(' and ')} — vegetarian at the table.`,
    };
  }

  return null;
}

function scoreFriendVenuePick(
  friend: FriendFoodProfile,
  venueId: string,
  intent?: string,
  contextText?: string,
): number {
  const pick = friend.topPicks.find((p) => p.venueId === venueId);
  if (pick == null) return 0;
  let score = pick.rating === 'loved' ? 4 : 2;
  const intentLower = (intent ?? contextText ?? '').toLowerCase();
  if (intentLower.includes('date') && pick.vibe.includes('date-night')) score += 6;
  if (intentLower.includes('group') && pick.vibe.includes('group')) score += 5;
  if (intentLower.includes('casual') && pick.vibe.includes('casual')) score += 4;
  return score;
}

/** Boost ranking for each companion's picks (wizard "going with"). */
export function friendRankScoreForCompanions(
  venueId: string,
  companionIds: string[] | undefined,
  contextText: string,
  intent: string | undefined,
  lookup: FriendLookup,
): number {
  let total = 0;
  const seen = new Set<string>();

  for (const id of companionIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const friend = lookup(id);
    if (friend != null) total += scoreFriendVenuePick(friend, venueId, intent, contextText);
  }

  return total;
}
