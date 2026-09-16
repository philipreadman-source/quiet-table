import type {FriendPick} from '@/lib/friend-graph-mock';
import type {CuisineId, TasteProfile, VenueReaction} from '@/lib/taste-profile';
import {buildCatalogTasteQuizVenues, isAmsterdamMetroHomeArea} from '@/lib/taste-quiz';
import {findVenueOption} from '@/lib/venue-options';

export type FriendSuggestedPick = {
  venueId: string;
  title: string;
  vibe: string;
  note: string;
};

const POSITIVE_REACTIONS = new Set<VenueReaction>(['love', 'fine']);

function reactionNote(reaction: VenueReaction): string {
  if (reaction === 'love') return 'Loved in onboarding';
  if (reaction === 'fine') return 'Fine in onboarding';
  return 'On their list';
}

const RATING_RANK: Record<FriendPick['rating'], number> = {
  loved: 0,
  liked: 1,
  fine: 2,
};

function applyPositivePlaceOrder(picks: FriendPick[], order: string[]): FriendPick[] {
  if (order.length === 0) return picks;
  const byId = new Map(picks.map((pick) => [pick.venueId, pick]));
  const ordered: FriendPick[] = [];
  for (const venueId of order) {
    const pick = byId.get(venueId);
    if (pick == null) continue;
    ordered.push(pick);
    byId.delete(venueId);
  }
  for (const pick of picks) {
    if (byId.has(pick.venueId)) ordered.push(pick);
  }
  return ordered;
}

/** Loved/liked quiz answers plus positive visits — never surfaces not_for_me or dislikes. */
export function positivePicksFromTasteProfile(profile: TasteProfile): FriendPick[] {
  const byVenue = new Map<string, FriendPick>();
  const visitByVenue = new Map(profile.recentVisits.map((visit) => [visit.venueId, visit]));

  for (const [venueId, reaction] of Object.entries(profile.venueReactions)) {
    if (!POSITIVE_REACTIONS.has(reaction)) continue;
    const visit = visitByVenue.get(venueId);
    if (visit?.rating === 'disliked') continue;
    const venue = findVenueOption(venueId);
    byVenue.set(venueId, {
      venueId,
      title: venue?.title ?? visit?.title ?? venueId,
      vibe: venue?.subtitle ?? visit?.subtitle ?? '',
      note: reactionNote(reaction),
      visitedAt: visit?.visitedAt ?? profile.updatedAt.slice(0, 10),
      rating: reaction === 'love' ? 'loved' : 'fine',
    });
  }

  for (const visit of profile.recentVisits) {
    if (visit.rating === 'disliked') continue;
    if (byVenue.has(visit.venueId)) continue;
    const venue = findVenueOption(visit.venueId);
    const sourceNote =
      visit.source === 'manual'
        ? 'Added to their taste profile'
        : visit.source === 'booking'
          ? 'Booked on Quiet Table'
          : 'On their list';
    byVenue.set(visit.venueId, {
      venueId: visit.venueId,
      title: venue?.title ?? visit.title ?? visit.venueId,
      vibe: venue?.subtitle ?? visit.subtitle ?? '',
      note: sourceNote,
      visitedAt: visit.visitedAt,
      rating: 'liked',
    });
  }

  const defaultSorted = [...byVenue.values()].sort((a, b) => {
    if (a.rating !== b.rating) return RATING_RANK[a.rating] - RATING_RANK[b.rating];
    return b.visitedAt.localeCompare(a.visitedAt);
  });
  return applyPositivePlaceOrder(defaultSorted, profile.positivePlaceOrder ?? []);
}

/** Three catalog picks tailored to onboarding cuisine choices (Amsterdam catalog v1). */
export function suggestedPicksFromTasteProfile(
  profile: TasteProfile,
  limit = 3,
): FriendSuggestedPick[] {
  const cuisines = (profile.preferences.cuisineAffinities ?? []) as CuisineId[];
  const area = profile.homeArea.trim() || 'Amsterdam';
  if (!isAmsterdamMetroHomeArea(area) && cuisines.length === 0) return [];

  const exclude = [
    ...Object.keys(profile.venueReactions),
    ...profile.recentVisits.map((visit) => visit.venueId),
    ...profile.excludedVenueIds,
    ...profile.savedVenueIds,
  ];

  const venues = buildCatalogTasteQuizVenues(cuisines, limit, exclude);
  const cuisineNote =
    cuisines.length > 0 ? 'Based on their cuisine picks' : 'Popular picks near them';

  return venues.map((venue) => ({
    venueId: venue.id,
    title: venue.title,
    vibe: venue.subtitle ?? '',
    note: cuisineNote,
  }));
}
