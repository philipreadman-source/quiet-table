import type {DietaryNeeds} from '@/lib/venue-options';
import type {TasteProfile} from '@/lib/taste-profile';

export type VisitRating = 'liked' | 'disliked' | 'neutral';

export type VenueVisit = {
  venueId: string;
  visitedAt: string;
  rating: VisitRating;
  notes?: string;
};

export type UserMemory = {
  firstName: string;
  avatarSrc?: string;
  homeArea: string;
  recentVisits: VenueVisit[];
  savedVenueIds: string[];
  excludedVenueIds: string[];
  anchorVenueIds: string[];
  /** Loved / fine / liked — already on the member's taste profile; omit from discovery. */
  positiveVenueIds: string[];
  preferences: {
    noise?: 'quiet' | 'lively' | 'any';
    dietaryLean?: DietaryNeeds;
    notes?: string;
  };
};

export const EMPTY_USER_MEMORY: UserMemory = {
  firstName: '',
  homeArea: 'Amsterdam',
  recentVisits: [],
  savedVenueIds: [],
  excludedVenueIds: [],
  anchorVenueIds: [],
  positiveVenueIds: [],
  preferences: {},
};

function collectPositiveVenueIds(profile: TasteProfile): string[] {
  const ids = new Set<string>();
  for (const [venueId, reaction] of Object.entries(profile.venueReactions)) {
    if (reaction === 'love' || reaction === 'fine') ids.add(venueId);
  }
  for (const visit of profile.recentVisits) {
    if (visit.rating !== 'disliked') ids.add(visit.venueId);
  }
  for (const venueId of profile.savedVenueIds) ids.add(venueId);
  for (const venueId of profile.anchorVenueIds) ids.add(venueId);
  return [...ids];
}

export function profileToUserMemory(profile: TasteProfile): UserMemory {
  return {
    firstName: profile.username,
    avatarSrc: profile.avatarSrc ?? profile.clerk?.imageUrl,
    homeArea: profile.homeArea || 'Amsterdam',
    recentVisits: profile.recentVisits.map((visit) => ({
      venueId: visit.venueId,
      visitedAt: visit.visitedAt,
      rating: visit.rating,
      notes: visit.notes,
    })),
    savedVenueIds: profile.savedVenueIds,
    excludedVenueIds: profile.excludedVenueIds,
    anchorVenueIds: profile.anchorVenueIds,
    positiveVenueIds: collectPositiveVenueIds(profile),
    preferences: profile.preferences,
  };
}

/** Resolve taste profile when provided (API); otherwise empty memory — no demo persona. */
export function getUserMemory(profile?: TasteProfile | null): UserMemory {
  if (profile != null && profile.username.trim().length > 0) {
    return profileToUserMemory(profile);
  }
  return EMPTY_USER_MEMORY;
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
  if (memory.excludedVenueIds.includes(venueId)) return true;
  const visit = visitForVenue(memory, venueId);
  if (visit == null || visit.rating !== 'disliked') return false;
  return daysSince(visit.visitedAt) <= withinDays;
}

/** Already loved, liked, or fine — skip in Find / wizard results. */
export function isVenueAlreadyEnjoyed(venueId: string, memory: UserMemory): boolean {
  return memory.positiveVenueIds.includes(venueId);
}

export function filterExcludedVenues<T extends {id: string}>(options: T[], memory: UserMemory): T[] {
  return options.filter(
    (option) => !isVenueExcluded(option.id, memory) && !isVenueAlreadyEnjoyed(option.id, memory),
  );
}

export function excludedVenueTitles(options: {id: string; title: string}[], memory: UserMemory): string[] {
  return options.filter((option) => isVenueExcluded(option.id, memory)).map((option) => option.title);
}

/** Positive signals boost ranking; dislikes that weren't filtered still sink. */
export function memoryRankScore(venueId: string, memory: UserMemory): number {
  if (memory.anchorVenueIds.includes(venueId)) return 4;
  const visit = visitForVenue(memory, venueId);
  if (visit?.rating === 'liked') return 3;
  if (visit?.rating === 'disliked') return -5;
  if (memory.savedVenueIds.includes(venueId)) return 2;
  return 0;
}

export function formatPersonalizationBadge(venueId: string, memory: UserMemory): string | null {
  if (memory.firstName.length === 0) return null;
  if (isVenueAlreadyEnjoyed(venueId, memory)) return null;
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
    username: memory.firstName,
    homeArea: memory.homeArea,
    recentVisits: memory.recentVisits.map((visit) => ({
      venueId: visit.venueId,
      rating: visit.rating,
      visitedAt: visit.visitedAt,
      notes: visit.notes,
    })),
    savedVenueIds: memory.savedVenueIds,
    anchorVenueIds: memory.anchorVenueIds,
    excludedVenueIds: memory.excludedVenueIds,
    positiveVenueIds: memory.positiveVenueIds,
    preferences: memory.preferences,
  };
}
