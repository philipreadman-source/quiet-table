import type {DietaryNeeds} from '@/lib/venue-options';
import {findVenueOption} from '@/lib/venue-options';

export type NoisePreference = 'quiet' | 'lively' | 'any';
export type VenueReaction = 'love' | 'fine' | 'not_for_me' | 'never_been';
export type TasteConfidence = 'low' | 'medium' | 'high';

export type CuisineId =
  | 'italian'
  | 'french'
  | 'mexican'
  | 'seafood'
  | 'japanese'
  | 'middle-eastern'
  | 'modern-european'
  | 'steak-grill'
  | 'vegetarian-forward'
  | 'other';

export type OnboardingStepId =
  | 'basics'
  | 'last_meal'
  | 'vibe'
  | 'cuisine'
  | 'venue_quiz'
  | 'invite_friends';

export type VenueVisit = {
  venueId: string;
  visitedAt: string;
  rating: 'liked' | 'disliked' | 'neutral';
  source: 'quiz' | 'booking' | 'manual' | 'inferred';
  notes?: string;
};

export type PendingInvite = {
  label?: string;
  sentAt: string;
  channel: 'share_sheet' | 'sms' | 'copy_link';
};

export type TasteProfile = {
  userId: string;
  username: string;
  homeArea: string;
  homeCoordinates?: {lat: number; lon: number};
  preferences: {
    noise?: NoisePreference;
    dietaryLean?: DietaryNeeds;
    cuisineAffinities?: CuisineId[];
    notes?: string;
  };
  anchorVenueIds: string[];
  excludedVenueIds: string[];
  venueReactions: Record<string, VenueReaction>;
  lastMeal?: {
    rawText: string;
    resolvedVenueId?: string;
    capturedAt: string;
  };
  recentVisits: VenueVisit[];
  savedVenueIds: string[];
  social: {
    friendUserIds: string[];
    showFriendActivity: boolean;
    invites: {
      targetCount: number;
      sent: PendingInvite[];
    };
  };
  onboarding: {
    completedAt?: string;
    skippedSteps: OnboardingStepId[];
    tasteConfidence: TasteConfidence;
  };
  updatedAt: string;
};

export const TASTE_PROFILE_STORAGE_KEY = 'quiet-table.taste-profile.v1';

export const CUISINE_OPTIONS: {id: CuisineId; label: string}[] = [
  {id: 'italian', label: 'Italian'},
  {id: 'french', label: 'French'},
  {id: 'japanese', label: 'Japanese'},
  {id: 'modern-european', label: 'Modern European'},
  {id: 'seafood', label: 'Seafood'},
  {id: 'mexican', label: 'Mexican'},
  {id: 'middle-eastern', label: 'Middle Eastern'},
  {id: 'steak-grill', label: 'Steak & grill'},
  {id: 'vegetarian-forward', label: 'Vegetarian-forward'},
  {id: 'other', label: 'Other'},
];

export const ONBOARDING_STEP_ORDER: OnboardingStepId[] = [
  'basics',
  'last_meal',
  'vibe',
  'cuisine',
  'venue_quiz',
  'invite_friends',
];

const USERNAME_PATTERN = /^[a-z0-9_]{2,20}$/;

export function createEmptyTasteProfile(): TasteProfile {
  const now = new Date().toISOString();
  return {
    userId: crypto.randomUUID(),
    username: '',
    homeArea: 'Amsterdam',
    preferences: {},
    anchorVenueIds: [],
    excludedVenueIds: [],
    venueReactions: {},
    recentVisits: [],
    savedVenueIds: [],
    social: {
      friendUserIds: [],
      showFriendActivity: true,
      invites: {targetCount: 3, sent: []},
    },
    onboarding: {
      skippedSteps: [],
      tasteConfidence: 'low',
    },
    updatedAt: now,
  };
}

export function validateUsername(raw: string): {ok: true; value: string} | {ok: false; error: string} {
  const value = raw.trim().toLowerCase();
  if (value.length < 2) return {ok: false, error: 'At least 2 characters.'};
  if (value.length > 20) return {ok: false, error: 'Max 20 characters.'};
  if (!USERNAME_PATTERN.test(value)) {
    return {ok: false, error: 'Letters, numbers, and underscores only.'};
  }
  return {ok: true, value};
}

export function computeTasteConfidence(profile: TasteProfile): TasteConfidence {
  let score = 0;
  if (profile.preferences.noise) score += 1;
  if (profile.preferences.cuisineAffinities?.length) score += 1;
  if (profile.lastMeal?.resolvedVenueId) score += 2;
  if (profile.anchorVenueIds.length) score += 2;
  if (
    Object.values(profile.venueReactions).filter((r) => r === 'love' || r === 'not_for_me').length >= 3
  ) {
    score += 2;
  }
  if (profile.recentVisits.length) score += 1;
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

export function refreshTasteConfidence(profile: TasteProfile): TasteProfile {
  return {
    ...profile,
    onboarding: {
      ...profile.onboarding,
      tasteConfidence: computeTasteConfidence(profile),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function markStepSkipped(profile: TasteProfile, step: OnboardingStepId): TasteProfile {
  const skipped = profile.onboarding.skippedSteps.includes(step)
    ? profile.onboarding.skippedSteps
    : [...profile.onboarding.skippedSteps, step];
  return refreshTasteConfidence({
    ...profile,
    onboarding: {...profile.onboarding, skippedSteps: skipped},
  });
}

export function resolveLastMealText(rawText: string): TasteProfile['lastMeal'] {
  const trimmed = rawText.trim();
  const capturedAt = new Date().toISOString();
  if (trimmed.length === 0) return undefined;
  const known =
    findVenueOption(trimmed) ??
    findVenueOption(trimmed.toLowerCase());
  return {
    rawText: trimmed,
    resolvedVenueId: known?.id,
    capturedAt,
  };
}

export function applyLovedVenues(
  profile: TasteProfile,
  venueIds: string[],
  rawText?: string,
): TasteProfile {
  let next = profile;
  for (const venueId of venueIds) {
    next = applyVenueReaction(next, venueId, 'love');
  }

  const trimmed = rawText?.trim() ?? '';
  if (trimmed.length > 0) {
    const lastMeal = resolveLastMealText(trimmed);
    next = {...next, lastMeal};
    if (lastMeal?.resolvedVenueId != null && !next.anchorVenueIds.includes(lastMeal.resolvedVenueId)) {
      next = {
        ...next,
        anchorVenueIds: [...next.anchorVenueIds, lastMeal.resolvedVenueId],
      };
    }
    return refreshTasteConfidence(next);
  }

  if (venueIds.length > 0) {
    const primaryId = venueIds[0]!;
    const known = findVenueOption(primaryId);
    next = {
      ...next,
      lastMeal: {
        rawText: known?.title ?? primaryId,
        resolvedVenueId: known?.id ?? primaryId,
        capturedAt: new Date().toISOString(),
      },
    };
  }

  return refreshTasteConfidence(next);
}

export function applyVenueReaction(
  profile: TasteProfile,
  venueId: string,
  reaction: VenueReaction,
): TasteProfile {
  const venueReactions = {...profile.venueReactions, [venueId]: reaction};
  let anchorVenueIds = [...profile.anchorVenueIds];
  let excludedVenueIds = [...profile.excludedVenueIds];
  let recentVisits = [...profile.recentVisits.filter((v) => v.venueId !== venueId)];
  const now = new Date().toISOString().slice(0, 10);

  if (reaction === 'love') {
    if (!anchorVenueIds.includes(venueId)) anchorVenueIds.push(venueId);
    excludedVenueIds = excludedVenueIds.filter((id) => id !== venueId);
    recentVisits.push({venueId, visitedAt: now, rating: 'liked', source: 'quiz'});
  } else if (reaction === 'not_for_me') {
    anchorVenueIds = anchorVenueIds.filter((id) => id !== venueId);
    if (!excludedVenueIds.includes(venueId)) excludedVenueIds.push(venueId);
    recentVisits.push({venueId, visitedAt: now, rating: 'disliked', source: 'quiz'});
  } else if (reaction === 'fine') {
    recentVisits.push({venueId, visitedAt: now, rating: 'liked', source: 'quiz'});
  }

  return refreshTasteConfidence({
    ...profile,
    venueReactions,
    anchorVenueIds,
    excludedVenueIds,
    recentVisits,
  });
}

export function finishOnboarding(profile: TasteProfile): TasteProfile {
  return refreshTasteConfidence({
    ...profile,
    onboarding: {
      ...profile.onboarding,
      completedAt: new Date().toISOString(),
    },
  });
}

export function hasOnboardingUsername(profile: TasteProfile | null | undefined): boolean {
  return profile != null && profile.username.trim().length >= 2;
}

export function loadTasteProfile(): TasteProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TASTE_PROFILE_STORAGE_KEY);
    if (raw == null) return null;
    return JSON.parse(raw) as TasteProfile;
  } catch {
    return null;
  }
}

export function saveTasteProfile(profile: TasteProfile): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TASTE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function inviteShareUrl(userId: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== 'undefined' ? window.location.origin : 'https://quiet-table-1.vercel.app');
  return `${base}/join?ref=${encodeURIComponent(userId)}`;
}

export function inviteShareMessage(username: string, url: string): string {
  return `${username} invited you to Quiet Table — see where friends actually eat and book a table. ${url}`;
}

export function summarizeTasteProfileForAgent(profile: TasteProfile) {
  return {
    userId: profile.userId,
    username: profile.username,
    homeArea: profile.homeArea,
    tasteConfidence: profile.onboarding.tasteConfidence,
    anchorVenueIds: profile.anchorVenueIds,
    excludedVenueIds: profile.excludedVenueIds,
    recentVisits: profile.recentVisits,
    savedVenueIds: profile.savedVenueIds,
    preferences: profile.preferences,
    venueReactions: profile.venueReactions,
    lastMeal: profile.lastMeal,
  };
}
