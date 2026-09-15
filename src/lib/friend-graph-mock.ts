import type {DietaryNeeds, SocialProof} from '@/lib/venue-options';

export type FriendPick = {
  venueId: string;
  title: string;
  vibe: string;
  note: string;
  visitedAt: string;
  rating: 'loved' | 'liked';
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
};

/** Synthetic close friends until real users join the graph. */
export const SAVAS_OZAY: FriendFoodProfile = {
  id: 'savas',
  name: 'Savas',
  fullName: 'Savas Ozay',
  avatarSrc: '/personas/savas.png',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Ramen, Korean BBQ, Asian fusion',
  cuisineAffinities: ['japanese', 'other'],
  topPicks: [
    {
      venueId: 'genki',
      title: 'Genki',
      vibe: 'casual ramen, quick bite',
      note: 'Go-to tonkotsu — quick, fun.',
      visitedAt: '2026-05-12',
      rating: 'loved',
      visitCount: 3,
    },
    {
      venueId: 'kimchi-premium',
      title: 'Kimchi Premium',
      vibe: 'group Korean BBQ, lively',
      note: 'Table grills — banchan is the star.',
      visitedAt: '2026-06-22',
      rating: 'loved',
    },
    {
      venueId: 'taiko',
      title: 'Taiko',
      vibe: 'date-night Asian fusion, intimate',
      note: 'Sharing plates, dim room, cocktails.',
      visitedAt: '2026-07-03',
      rating: 'liked',
    },
  ],
};

export const MAYA_CHEN: FriendFoodProfile = {
  id: 'maya',
  name: 'Maya',
  fullName: 'Maya Chen',
  avatarSrc: '/personas/maya.jpg',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Quiet date nights, natural wine, greenhouse dining',
  cuisineAffinities: ['french', 'modern-european', 'wine-bar'],
  topPicks: [
    {
      venueId: 'de-kas',
      title: 'De Kas',
      vibe: 'date-night greenhouse, special occasion',
      note: 'Anniversary pick — greenhouse room, unhurried service.',
      visitedAt: '2026-07-18',
      rating: 'loved',
    },
    {
      venueId: 'fitchers',
      title: "Fitcher's",
      vibe: 'date-night wine bar, intimate',
      note: 'Natural wine and small plates — conversation-friendly back room.',
      visitedAt: '2026-06-08',
      rating: 'loved',
    },
    {
      venueId: 'restaurant-cedric',
      title: 'Restaurant Cédric',
      vibe: 'date-night French, mid-splurge',
      note: 'Classic bistro energy without the tourist crush.',
      visitedAt: '2026-04-20',
      rating: 'liked',
    },
  ],
};

export const EMMA_VAN_DIJK: FriendFoodProfile = {
  id: 'emma',
  name: 'Emma',
  fullName: 'Emma van Dijk',
  avatarSrc: '/personas/emma.jpg',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Group dinners, Italian, shareable tables',
  cuisineAffinities: ['italian', 'japanese'],
  dietaryNotes: 'Mostly vegetarian (pescatarian) — no meat, but she eats fish and seafood.',
  topPicks: [
    {
      venueId: 'cecconis',
      title: "Cecconi's Amsterdam",
      vibe: 'group Italian, lively',
      note: 'Default for six-plus — long tables.',
      visitedAt: '2026-06-15',
      rating: 'loved',
    },
    {
      venueId: 'momo',
      title: 'MOMO Restaurant',
      vibe: 'group Pan-Asian, large tables',
      note: 'Seats bigger parties properly.',
      visitedAt: '2026-04-28',
      rating: 'loved',
    },
    {
      venueId: 'gruppo-di-amici',
      title: 'Gruppo di Amici',
      vibe: 'casual Italian, group-friendly',
      note: 'Low-key pasta night, no reservation stress.',
      visitedAt: '2026-03-10',
      rating: 'liked',
    },
  ],
};

export const ANNA_VAN_BERG: FriendFoodProfile = {
  id: 'anna',
  name: 'Anna',
  fullName: 'Anna van Berg',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Neighbourhood gems, wine bars, Instagram finds',
  cuisineAffinities: ['modern-european', 'other'],
  topPicks: [],
};

export const TOM_JANSEN: FriendFoodProfile = {
  id: 'tom',
  name: 'Tom',
  fullName: 'Tom Jansen',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Steak, cocktails, late reservations',
  cuisineAffinities: ['steak-grill', 'other'],
  topPicks: [],
};

const DEMO_FRIENDS: FriendFoodProfile[] = [
  SAVAS_OZAY,
  MAYA_CHEN,
  EMMA_VAN_DIJK,
  ANNA_VAN_BERG,
  TOM_JANSEN,
];

/** Five faces shown on the “Who are you going with?” wizard step (room for + grid later). */
export function listWizardCompanionFriends(): readonly FriendFoodProfile[] {
  return DEMO_FRIENDS.slice(0, 5);
}

/** Friends tab — avatars with at least one logged visit (demo). */
export function listFriendsForFriendsTab(): readonly FriendFoodProfile[] {
  return DEMO_FRIENDS.filter((friend) => friend.topPicks.length > 0).slice(0, 3);
}

export function recentFriendVisits(friend: FriendFoodProfile, limit = 2): FriendPick[] {
  return [...friend.topPicks]
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
    .slice(0, limit);
}

/** Demo presence — Savas online for Friends v1. */
export function friendShowsOnlineInDemo(friendId: string): boolean {
  return friendId === 'savas';
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getFriendFoodProfile(nameOrId: string): FriendFoodProfile | undefined {
  const needle = normalizeName(nameOrId);
  return DEMO_FRIENDS.find(
    (friend) =>
      friend.id === needle ||
      normalizeName(friend.name) === needle ||
      normalizeName(friend.fullName) === needle ||
      needle.includes(friend.id),
  );
}

export function summarizeFriendGraphForAgent(): {closeFriends: ReturnType<typeof summarizeFriendForAgent>[]} {
  return {closeFriends: DEMO_FRIENDS.map(summarizeFriendForAgent)};
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

export function friendMentionedInText(text: string, friendId?: string): boolean {
  const lower = text.toLowerCase();
  const friends = friendId != null ? DEMO_FRIENDS.filter((f) => f.id === friendId) : DEMO_FRIENDS;
  return friends.some(
    (friend) =>
      lower.includes(friend.id) ||
      lower.includes(friend.name.toLowerCase()) ||
      lower.includes(friend.fullName.toLowerCase()),
  );
}

export function getMentionedFriend(text: string): FriendFoodProfile | undefined {
  return DEMO_FRIENDS.find(
    (friend) =>
      text.toLowerCase().includes(friend.id) ||
      text.toLowerCase().includes(friend.name.toLowerCase()) ||
      text.toLowerCase().includes(friend.fullName.toLowerCase()),
  );
}

function socialProofFromFriendPick(friend: FriendFoodProfile, venueId: string): SocialProof | undefined {
  const pick = friend.topPicks.find((p) => p.venueId === venueId);
  if (pick == null) return undefined;
  if (pick.rating !== 'loved' && pick.rating !== 'liked') return undefined;
  const visits = pick.visitCount ?? 1;
  const when = daysAgoLabel(pick.visitedAt);
  if (visits >= 2) {
    return {
      name: friend.name,
      friendId: friend.id,
      action: 'repeat_booker',
      source: 'contact',
    };
  }
  return {
    name: friend.name,
    friendId: friend.id,
    action: pick.rating === 'loved' ? 'loved' : 'liked',
    source: 'contact',
    when,
  };
}

/** Card social line when a demo friend has visited this venue — prefer selected companions first. */
export function friendSocialProofForVenue(
  venueId: string,
  preferCompanionIds?: string[],
): SocialProof | undefined {
  if (preferCompanionIds != null) {
    for (const id of preferCompanionIds) {
      const friend = getFriendFoodProfile(id);
      if (friend == null) continue;
      const proof = socialProofFromFriendPick(friend, venueId);
      if (proof != null) return proof;
    }
  }
  for (const friend of DEMO_FRIENDS) {
    const proof = socialProofFromFriendPick(friend, venueId);
    if (proof != null) return proof;
  }
  return undefined;
}

export type FriendDietaryLean = 'none' | 'pescatarian' | 'vegetarian' | 'vegan';

export function friendDietaryLean(friend: FriendFoodProfile): FriendDietaryLean {
  const notes = friend.dietaryNotes?.toLowerCase() ?? '';
  if (notes.includes('vegan')) return 'vegan';
  if (notes.includes('pescatarian') || notes.includes('fish')) return 'pescatarian';
  if (notes.includes('vegetarian')) return 'vegetarian';
  return 'none';
}

type FriendLookup = (id: string) => FriendFoodProfile | undefined;

/** Map wizard companion picks → table dietary needs + copy for the agent/UI. */
export function derivePartyDietaryFromCompanions(
  friendIds: string[],
  lookup: FriendLookup = getFriendFoodProfile,
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

function daysAgoLabel(isoDate: string): string | undefined {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 14) return 'last week';
  if (days < 45) return 'last month';
  if (days < 120) return 'in spring';
  return undefined;
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

/** Boost ranking for each companion’s catalog picks (wizard “going with”) plus any friend named in text. */
export function friendRankScoreForCompanions(
  venueId: string,
  companionIds: string[] | undefined,
  contextText: string,
  intent?: string,
): number {
  let total = 0;
  const seen = new Set<string>();

  for (const id of companionIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const friend = getFriendFoodProfile(id);
    if (friend != null) total += scoreFriendVenuePick(friend, venueId, intent, contextText);
  }

  const mentioned = getMentionedFriend(contextText);
  if (mentioned != null && !seen.has(mentioned.id)) {
    total += scoreFriendVenuePick(mentioned, venueId, intent, contextText);
  }

  return total;
}

/** @deprecated Prefer friendRankScoreForCompanions */
export function friendRankScore(
  venueId: string,
  contextText: string,
  intent?: string,
): number {
  return friendRankScoreForCompanions(venueId, undefined, contextText, intent);
}
