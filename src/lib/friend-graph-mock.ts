import type {SocialProof} from '@/lib/venue-options';

export type FriendPick = {
  venueId: string;
  title: string;
  vibe: string;
  note: string;
  visitedAt: string;
  rating: 'loved' | 'liked';
};

export type FriendFoodProfile = {
  id: string;
  name: string;
  fullName: string;
  relationship: 'close_friend';
  homeArea: string;
  tasteSummary: string;
  cuisineAffinities: string[];
  topPicks: FriendPick[];
};

/** Demo close friend — ramen, KBBQ, Asian fusion (Amsterdam). */
export const SAVAS_OZAY: FriendFoodProfile = {
  id: 'savas',
  name: 'Savas',
  fullName: 'Savas Ozay',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Ramen, Korean BBQ, and Asian fusion',
  cuisineAffinities: ['japanese', 'korean', 'asian-fusion', 'ramen'],
  topPicks: [
    {
      venueId: 'genki',
      title: 'Genki',
      vibe: 'casual ramen spot',
      note: 'Go-to for tonkotsu — quick, fun, reliably good.',
      visitedAt: '2026-07-10',
      rating: 'loved',
    },
    {
      venueId: 'kimchi-premium',
      title: 'Kimchi Premium',
      vibe: 'Korean BBQ, group-friendly',
      note: 'Brings groups for table grills — banchan is the star.',
      visitedAt: '2026-06-22',
      rating: 'loved',
    },
    {
      venueId: 'taiko',
      title: 'Taiko',
      vibe: 'date-night Asian fusion, mid-range',
      note: 'Date spot — sharing plates, dim room, cocktails.',
      visitedAt: '2026-05-15',
      rating: 'loved',
    },
  ],
};

/** Demo close friend — quiet date nights, wine bars, European. */
export const MAYA_CHEN: FriendFoodProfile = {
  id: 'maya',
  name: 'Maya',
  fullName: 'Maya Chen',
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

/** Demo close friend — groups, Italian, loud-casual energy. */
export const EMMA_VAN_DIJK: FriendFoodProfile = {
  id: 'emma',
  name: 'Emma',
  fullName: 'Emma van Dijk',
  relationship: 'close_friend',
  homeArea: 'Amsterdam',
  tasteSummary: 'Group dinners, Italian, shareable tables',
  cuisineAffinities: ['italian', 'casual', 'group-friendly'],
  topPicks: [
    {
      venueId: 'cecconis',
      title: "Cecconi's Amsterdam",
      vibe: 'group-friendly Italian, lively',
      note: 'Default for six-plus — long tables, everyone leaves happy.',
      visitedAt: '2026-07-02',
      rating: 'loved',
    },
    {
      venueId: 'momo',
      title: 'MOMO Restaurant',
      vibe: 'group Pan-Asian, big tables',
      note: 'When the group wants variety — seats everyone properly.',
      visitedAt: '2026-05-28',
      rating: 'loved',
    },
    {
      venueId: 'gruppo-di-amici',
      title: 'Gruppo di Amici',
      vibe: 'casual Italian neighbourhood',
      note: 'Low-key pasta night with friends — no reservation stress.',
      visitedAt: '2026-03-11',
      rating: 'liked',
    },
  ],
};

const DEMO_FRIENDS: FriendFoodProfile[] = [SAVAS_OZAY, MAYA_CHEN, EMMA_VAN_DIJK];

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

/** Card social line when a demo friend has visited this venue. */
export function friendSocialProofForVenue(venueId: string): SocialProof | undefined {
  for (const friend of DEMO_FRIENDS) {
    const pick = friend.topPicks.find((p) => p.venueId === venueId);
    if (pick == null) continue;
    const when = daysAgoLabel(pick.visitedAt);
    return {
      name: friend.name,
      action: pick.rating === 'loved' ? 'booked' : 'liked',
      source: 'contact',
      when,
    };
  }
  return undefined;
}

function daysAgoLabel(isoDate: string): string | undefined {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 14) return 'last week';
  if (days < 45) return 'last month';
  if (days < 120) return 'in spring';
  return undefined;
}

/** Boost ranking when a named friend's picks align with the brief. */
export function friendRankScore(
  venueId: string,
  contextText: string,
  intent?: string,
): number {
  const friend = getMentionedFriend(contextText);
  if (friend == null) return 0;
  const pick = friend.topPicks.find((p) => p.venueId === venueId);
  if (pick == null) return 0;
  let score = pick.rating === 'loved' ? 4 : 2;
  const intentLower = (intent ?? contextText).toLowerCase();
  if (intentLower.includes('date') && pick.vibe.includes('date-night')) score += 6;
  if (intentLower.includes('group') && pick.vibe.includes('group')) score += 5;
  if (intentLower.includes('casual') && pick.vibe.includes('casual')) score += 4;
  return score;
}
