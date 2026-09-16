import type {FriendFoodProfile, FriendPick} from '@/lib/friend-graph-mock';
import {findVenueOption, type SocialProof} from '@/lib/venue-options';

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickForVenue(
  member: FriendFoodProfile,
  venueId: string,
  venueTitle: string,
): FriendPick | undefined {
  const byId = member.topPicks.find((pick) => pick.venueId === venueId);
  if (byId != null) return byId;
  const needle = normalizeTitle(venueTitle);
  if (needle.length === 0) return undefined;
  return member.topPicks.find((pick) => normalizeTitle(pick.title) === needle);
}

function whenFromPick(pick: FriendPick): string | undefined {
  if (pick.visitedAt.length === 0) return undefined;
  const days = Math.floor((Date.now() - new Date(pick.visitedAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 14) return 'last week';
  if (days < 45) return 'last month';
  if (days < 120) return 'in spring';
  return undefined;
}

/** Beta: empty wizard selection → weight all other members' tastes. */
export function effectiveCommunityCompanionIds(
  selectedCompanionIds: string[] | undefined,
  communityMembers: FriendFoodProfile[],
): string[] {
  if (selectedCompanionIds != null && selectedCompanionIds.length > 0) {
    return selectedCompanionIds;
  }
  return communityMembers.map((member) => member.id);
}

export function memberSocialProofForVenue(
  venueId: string,
  venueTitle: string,
  communityMembers: FriendFoodProfile[],
  preferCompanionIds?: string[],
): SocialProof | undefined {
  const prefer = new Set(preferCompanionIds ?? []);
  const ordered =
    prefer.size > 0
      ? [
          ...communityMembers.filter((member) => prefer.has(member.id)),
          ...communityMembers.filter((member) => !prefer.has(member.id)),
        ]
      : communityMembers;

  for (const member of ordered) {
    const pick = pickForVenue(member, venueId, venueTitle);
    if (pick == null) continue;
    const when = whenFromPick(pick);
    return {
      name: member.name,
      friendId: member.id,
      action: pick.rating === 'loved' ? 'loved' : pick.rating === 'fine' ? 'liked' : 'liked',
      source: 'contact',
      when,
    };
  }
  return undefined;
}

export function scoreMemberVenuePick(
  member: FriendFoodProfile,
  venueId: string,
  venueTitle: string,
  intent?: string,
  contextText?: string,
): number {
  const pick = pickForVenue(member, venueId, venueTitle);
  if (pick == null) return 0;
  let score = pick.rating === 'loved' ? 5 : pick.rating === 'fine' ? 3 : 2;
  const intentLower = (intent ?? contextText ?? '').toLowerCase();
  if (intentLower.includes('date') && pick.vibe.includes('date-night')) score += 6;
  if (intentLower.includes('group') && pick.vibe.includes('group')) score += 5;
  if (intentLower.includes('casual') && pick.vibe.includes('casual')) score += 4;
  const pickIndex = member.topPicks.findIndex(
    (candidate) =>
      candidate.venueId === venueId || normalizeTitle(candidate.title) === normalizeTitle(venueTitle),
  );
  if (pickIndex >= 0 && member.topPicks.length > 1) {
    score +=
      ((member.topPicks.length - 1 - pickIndex) / (member.topPicks.length - 1)) * 2;
  }
  return score;
}

export function communityRankScoreForVenue(
  venueId: string,
  venueTitle: string,
  communityMembers: FriendFoodProfile[],
  companionIds: string[],
  contextText: string,
  intent?: string,
): number {
  let total = 0;
  const seen = new Set<string>();
  for (const id of companionIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const member = communityMembers.find((friend) => friend.id === id);
    if (member == null) continue;
    total += scoreMemberVenuePick(member, venueId, venueTitle, intent, contextText);
  }
  return total;
}

export function createCommunityFriendLookup(
  communityMembers: FriendFoodProfile[],
): (id: string) => FriendFoodProfile | undefined {
  const byId = new Map(communityMembers.map((member) => [member.id, member]));
  return (id: string) => byId.get(id);
}

export function summarizeCommunityTasteForAgent(members: FriendFoodProfile[]) {
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    homeArea: member.homeArea,
    tasteSummary: member.tasteSummary,
    topPicks: member.topPicks.slice(0, 8).map((pick) => ({
      venueId: pick.venueId,
      title: pick.title,
      rating: pick.rating,
    })),
  }));
}
