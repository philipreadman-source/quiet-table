import type {DietaryNeeds} from '@/lib/venue-options';

export type VisitRating = 'liked' | 'disliked' | 'neutral';

export type VenueVisit = {
  venueId: string;
  visitedAt: string;
  rating: VisitRating;
  notes?: string;
};

export type UserMemory = {
  firstName: string;
  homeArea: string;
  recentVisits: VenueVisit[];
  savedVenueIds: string[];
  preferences: {
    noise?: 'quiet' | 'lively' | 'any';
    dietaryLean?: DietaryNeeds;
    notes?: string;
  };
};

/** Demo persona — Aiden, returning Amsterdam diner with a little history. */
export const DEMO_USER_MEMORY: UserMemory = {
  firstName: 'Aiden',
  homeArea: 'Amsterdam',
  recentVisits: [
    {
      venueId: 'bar-fisk',
      visitedAt: '2026-06-20',
      rating: 'disliked',
      notes: 'Too loud and rushed for a relaxed dinner.',
    },
    {
      venueId: 'cafe-de-klos',
      visitedAt: '2026-05-08',
      rating: 'liked',
      notes: 'Cozy ribs night — would go back.',
    },
    {
      venueId: 'de-kas',
      visitedAt: '2026-03-14',
      rating: 'liked',
      notes: 'Great date-night meal in the greenhouse.',
    },
  ],
  savedVenueIds: ['graphite'],
  preferences: {
    noise: 'quiet',
    dietaryLean: 'vegetarian',
    notes: 'Prefers calmer rooms and places with solid veg options.',
  },
};

export function getUserMemory(): UserMemory {
  return DEMO_USER_MEMORY;
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function visitForVenue(memory: UserMemory, venueId: string): VenueVisit | undefined {
  return memory.recentVisits.find((visit) => visit.venueId === venueId);
}

/** Hide venues the user recently disliked — the concierge shouldn't re-suggest them. */
export function isVenueExcluded(venueId: string, memory: UserMemory, withinDays = 120): boolean {
  const visit = visitForVenue(memory, venueId);
  if (visit == null || visit.rating !== 'disliked') return false;
  return daysSince(visit.visitedAt) <= withinDays;
}

export function filterExcludedVenues<T extends {id: string}>(options: T[], memory: UserMemory): T[] {
  return options.filter((option) => !isVenueExcluded(option.id, memory));
}

export function excludedVenueTitles(options: {id: string; title: string}[], memory: UserMemory): string[] {
  return options.filter((option) => isVenueExcluded(option.id, memory)).map((option) => option.title);
}

/** Positive signals boost ranking; dislikes that weren't filtered still sink. */
export function memoryRankScore(venueId: string, memory: UserMemory): number {
  const visit = visitForVenue(memory, venueId);
  if (visit?.rating === 'liked') return 3;
  if (visit?.rating === 'disliked') return -5;
  if (memory.savedVenueIds.includes(venueId)) return 2;
  return 0;
}

export function formatPersonalizationBadge(venueId: string, memory: UserMemory): string | null {
  const visit = visitForVenue(memory, venueId);
  if (visit?.rating === 'liked') {
    const weeks = Math.max(1, Math.round(daysSince(visit.visitedAt) / 7));
    return weeks <= 8 ? `You liked this ${weeks} week${weeks === 1 ? '' : 's'} ago` : 'You liked this before';
  }
  if (memory.savedVenueIds.includes(venueId)) return 'Saved — not booked yet';
  return null;
}

export function buildVenueListPersonalizationNote(
  memory: UserMemory,
  excludedTitles: string[],
): string | null {
  // FLAG: FALLBACK_VENUE_INTRO_IS_TEMPLATE — factual exclusions only for local fallback.
  // Soft taste lines (e.g. "favouring calmer spots") are live-agent copy, not fallback.
  void memory;
  if (excludedTitles.length === 0) return null;
  return excludedTitles.length === 1
    ? `I've left out ${excludedTitles[0]} — you didn't enjoy it last time.`
    : `I've left out ${excludedTitles.join(' and ')} based on past visits.`;
}

export function dietaryQuestionForMemory(_memory?: UserMemory): string {
  return 'Any dietary restrictions?';
}

export function summarizeUserMemoryForAgent(memory: UserMemory) {
  return {
    firstName: memory.firstName,
    homeArea: memory.homeArea,
    recentVisits: memory.recentVisits.map((visit) => ({
      venueId: visit.venueId,
      rating: visit.rating,
      visitedAt: visit.visitedAt,
      notes: visit.notes,
    })),
    savedVenueIds: memory.savedVenueIds,
    preferences: memory.preferences,
  };
}
