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
  /** Display name when venueId is outside the catalog (e.g. osm-* search hits). */
  title?: string;
  subtitle?: string;
};

export type VenueVisitDisplay = {
  title?: string;
  subtitle?: string;
};

export type PendingInvite = {
  label?: string;
  sentAt: string;
  channel: 'share_sheet' | 'sms' | 'copy_link';
};

/** Demo principal portrait — served from public/ for local + Vercel. */
export const PRINCIPAL_AVATAR_SRC = '/personas/philip.jpg';

export type TasteProfile = {
  userId: string;
  username: string;
  /** Profile photo URL; defaults to PRINCIPAL_AVATAR_SRC for the prototype principal. */
  avatarSrc?: string;
  /** Clerk identity snapshot for avatars and display names (initials when no image). */
  clerk?: {
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  };
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
  /** Member-ranked positive places — first id weighs most in Find and taste signals. */
  positivePlaceOrder: string[];
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
  'cuisine',
  'venue_quiz',
  'invite_friends',
];

const USERNAME_PATTERN = /^[a-z0-9_]{2,20}$/;

export function createEmptyTasteProfile(userId?: string): TasteProfile {
  const now = new Date().toISOString();
  const resolvedUserId =
    userId != null && userId.trim().length > 0 ? userId.trim() : crypto.randomUUID();
  return {
    userId: resolvedUserId,
    username: '',
    avatarSrc: undefined,
    homeArea: '',
    preferences: {},
    anchorVenueIds: [],
    excludedVenueIds: [],
    venueReactions: {},
    recentVisits: [],
    positivePlaceOrder: [],
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

export function validateHomeArea(raw: string): {ok: true; value: string} | {ok: false; error: string} {
  const value = raw.trim();
  if (value.length < 2) return {ok: false, error: 'Enter your city or neighborhood.'};
  if (value.length > 80) return {ok: false, error: 'Max 80 characters.'};
  return {ok: true, value};
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

function appendPositivePlaceOrder(profile: TasteProfile, venueId: string): string[] {
  const without = profile.positivePlaceOrder.filter((id) => id !== venueId);
  return [...without, venueId];
}

export function setPositivePlaceOrder(profile: TasteProfile, orderedVenueIds: string[]): TasteProfile {
  return refreshTasteConfidence({
    ...profile,
    positivePlaceOrder: orderedVenueIds,
    updatedAt: new Date().toISOString(),
  });
}

function attachVisitDisplay(
  profile: TasteProfile,
  venueId: string,
  display?: VenueVisitDisplay,
): TasteProfile {
  if (display?.title == null && display?.subtitle == null) return profile;
  return {
    ...profile,
    recentVisits: profile.recentVisits.map((visit) =>
      visit.venueId === venueId
        ? {
            ...visit,
            title: display?.title ?? visit.title,
            subtitle: display?.subtitle ?? visit.subtitle,
          }
        : visit,
    ),
  };
}

/** Add a place the member enjoyed — positive-only taste graph (no dislike list on QT). */
export function addPositiveRestaurantToProfile(
  profile: TasteProfile,
  venueId: string,
  strength: 'loved' | 'liked' | 'fine',
  display?: VenueVisitDisplay,
): TasteProfile {
  const now = new Date().toISOString().slice(0, 10);

  if (strength === 'loved') {
    let next = applyVenueReaction(profile, venueId, 'love');
    if (!next.savedVenueIds.includes(venueId)) {
      next = {...next, savedVenueIds: [...next.savedVenueIds, venueId]};
    }
    next = {
      ...next,
      excludedVenueIds: next.excludedVenueIds.filter((id) => id !== venueId),
    };
    next = attachVisitDisplay(next, venueId, display);
    next = {...next, positivePlaceOrder: appendPositivePlaceOrder(next, venueId)};
    return refreshTasteConfidence({...next, updatedAt: new Date().toISOString()});
  }

  if (strength === 'fine') {
    let next = applyVenueReaction(profile, venueId, 'fine');
    if (!next.savedVenueIds.includes(venueId)) {
      next = {...next, savedVenueIds: [...next.savedVenueIds, venueId]};
    }
    next = {
      ...next,
      excludedVenueIds: next.excludedVenueIds.filter((id) => id !== venueId),
    };
    next = attachVisitDisplay(next, venueId, display);
    next = {...next, positivePlaceOrder: appendPositivePlaceOrder(next, venueId)};
    return refreshTasteConfidence({...next, updatedAt: new Date().toISOString()});
  }

  const venueReactions = {...profile.venueReactions};
  delete venueReactions[venueId];
  let recentVisits = profile.recentVisits.filter((visit) => visit.venueId !== venueId);
  recentVisits.push({
    venueId,
    visitedAt: now,
    rating: 'liked',
    source: 'manual',
    title: display?.title,
    subtitle: display?.subtitle,
  });
  const savedVenueIds = profile.savedVenueIds.includes(venueId)
    ? profile.savedVenueIds
    : [...profile.savedVenueIds, venueId];

  return refreshTasteConfidence({
    ...profile,
    venueReactions,
    anchorVenueIds: profile.anchorVenueIds.filter((id) => id !== venueId),
    excludedVenueIds: profile.excludedVenueIds.filter((id) => id !== venueId),
    recentVisits,
    savedVenueIds,
    positivePlaceOrder: appendPositivePlaceOrder(profile, venueId),
    updatedAt: new Date().toISOString(),
  });
}

/** Drop from positive taste list — removes reactions, visits, and saves for this venue. */
export function removePositiveRestaurantFromProfile(
  profile: TasteProfile,
  venueId: string,
): TasteProfile {
  const venueReactions = {...profile.venueReactions};
  delete venueReactions[venueId];
  return refreshTasteConfidence({
    ...profile,
    venueReactions,
    anchorVenueIds: profile.anchorVenueIds.filter((id) => id !== venueId),
    savedVenueIds: profile.savedVenueIds.filter((id) => id !== venueId),
    recentVisits: profile.recentVisits.filter((visit) => visit.venueId !== venueId),
    positivePlaceOrder: profile.positivePlaceOrder.filter((id) => id !== venueId),
    updatedAt: new Date().toISOString(),
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

export function isOnboardingComplete(profile: TasteProfile | null | undefined): boolean {
  return (
    profile != null &&
    hasOnboardingUsername(profile) &&
    profile.onboarding.completedAt != null &&
    profile.onboarding.completedAt.length > 0
  );
}

export function saveTasteProfileToLocalStorage(profile: TasteProfile): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TASTE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function loadTasteProfile(): TasteProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TASTE_PROFILE_STORAGE_KEY);
    if (raw == null) return null;
    const profile = JSON.parse(raw) as TasteProfile;
    return profile;
  } catch {
    return null;
  }
}

/** Persists locally; syncs to Upstash when username is set (see profile-sync). */
export function saveTasteProfile(profile: TasteProfile, options?: {remote?: boolean}): void {
  saveTasteProfileToLocalStorage(profile);
  if (options?.remote === false || typeof window === 'undefined') return;
  void import('@/lib/profile-sync').then(({pushTasteProfileToServer}) =>
    pushTasteProfileToServer(profile),
  );
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

export function formatInviteSentSummary(sentCount: number): string {
  return `${sentCount} sent`;
}

export function recordProfileInviteSent(
  profile: TasteProfile,
  channel: 'share_sheet' | 'copy_link',
): TasteProfile {
  return {
    ...profile,
    social: {
      ...profile.social,
      invites: {
        ...profile.social.invites,
        sent: [
          ...profile.social.invites.sent,
          {sentAt: new Date().toISOString(), channel},
        ],
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

const ONBOARDING_STEP_LABELS: Record<OnboardingStepId, string> = {
  basics: 'Basics',
  last_meal: 'Last meal',
  vibe: 'Vibe',
  cuisine: 'Cuisine',
  venue_quiz: 'Venue quiz',
  invite_friends: 'Invite friends',
};

export type OnboardingSummaryRow = {label: string; value: string};

export const LOVED_QUIZ_SUMMARY_VISIBLE = 5;

/** Profile summary only — titles, capped with "(+N more)". */
export function formatLovedQuizVenueSummary(
  profile: TasteProfile,
  maxVisible = LOVED_QUIZ_SUMMARY_VISIBLE,
): string | null {
  const lovedTitles = Object.entries(profile.venueReactions)
    .filter(([, reaction]) => reaction === 'love')
    .map(([venueId]) => findVenueOption(venueId)?.title ?? venueId);
  if (lovedTitles.length === 0) return null;
  const visible = lovedTitles.slice(0, maxVisible);
  const rest = lovedTitles.length - visible.length;
  let text = visible.join(', ');
  if (rest > 0) text += ` (+${rest} more)`;
  return text;
}

function formatProfileDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Read-only lines for Profile — mirrors what onboarding captured. */
export function buildOnboardingSummaryRows(profile: TasteProfile): OnboardingSummaryRow[] {
  const rows: OnboardingSummaryRow[] = [];

  const confidence =
    profile.onboarding.tasteConfidence.charAt(0).toUpperCase() +
    profile.onboarding.tasteConfidence.slice(1);
  rows.push({label: 'Taste confidence', value: confidence});

  const cuisineIds = profile.preferences.cuisineAffinities ?? [];
  if (cuisineIds.length > 0) {
    const labels = cuisineIds
      .map((id) => CUISINE_OPTIONS.find((option) => option.id === id)?.label ?? id)
      .join(', ');
    rows.push({label: 'Cuisines you picked', value: labels});
  } else if (!profile.onboarding.skippedSteps.includes('cuisine')) {
    rows.push({label: 'Cuisines you picked', value: 'None — skipped or open to anything'});
  }

  const lovedSummary = formatLovedQuizVenueSummary(profile);
  if (lovedSummary != null) {
    rows.push({label: 'Loved in the quiz', value: lovedSummary});
  }

  rows.push({
    label: 'Friend invites',
    value: formatInviteSentSummary(profile.social.invites.sent.length),
  });

  if (profile.onboarding.completedAt != null) {
    rows.push({
      label: 'Member since',
      value: formatProfileDate(profile.onboarding.completedAt),
    });
  }

  if (profile.onboarding.skippedSteps.length > 0) {
    rows.push({
      label: 'Skipped steps',
      value: profile.onboarding.skippedSteps
        .map((step) => ONBOARDING_STEP_LABELS[step] ?? step)
        .join(', '),
    });
  }

  return rows;
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
