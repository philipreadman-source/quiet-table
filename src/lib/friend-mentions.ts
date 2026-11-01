import type {FriendFoodProfile} from '@/lib/friend-graph-mock';
import {CUISINE_OPTIONS} from '@/lib/taste-profile';

// Spotting Quiet Table members named in a chat message, and saying back what
// matters about them. Used while the agent is off; the agent reads the same
// member data itself.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function friendNames(friend: FriendFoodProfile): string[] {
  return [friend.fullName, friend.name, friend.username ?? '']
    .map((name) => name.trim())
    .filter((name) => name.length > 1);
}

/** Friends named in a message ("with Molly", "@molly_t"), by name or username. */
export function friendsMentioned(text: string, members: readonly FriendFoodProfile[]): FriendFoodProfile[] {
  const lower = text.toLowerCase();
  return members.filter((member) =>
    friendNames(member).some((name) =>
      new RegExp(`(?:^|[^\\w])@?${escapeRegExp(name.toLowerCase())}(?![\\w])`).test(lower),
    ),
  );
}

/** One line on a friend for the chat: how they eat and what they like. */
export function friendBrief(friend: FriendFoodProfile): string {
  const parts: string[] = [];
  parts.push(friend.dietaryNotes?.trim().replace(/[.\s]+$/, '') || 'no dietary needs saved');
  const cuisines = friend.cuisineAffinities
    .map((id) => CUISINE_OPTIONS.find((option) => option.id === id)?.label ?? null)
    .filter((label): label is string => label != null)
    .slice(0, 3);
  if (cuisines.length > 0) parts.push(`likes ${cuisines.join(', ')}`);
  const loved = [...friend.topPicks]
    .sort((a, b) => (a.rating === 'loved' ? 0 : 1) - (b.rating === 'loved' ? 0 : 1))
    .slice(0, 3)
    .map((pick) => pick.title);
  if (loved.length > 0) parts.push(`favourites ${loved.join(', ')}`);
  return `- **${friend.name}**: ${parts.join('; ')}`;
}

/** The message without the friends' names, so "with Molly" isn't read as a place. */
export function withoutFriendMentions(text: string, friends: readonly FriendFoodProfile[]): string {
  let rest = text;
  for (const friend of friends) {
    for (const name of friendNames(friend)) {
      rest = rest.replace(new RegExp(`@?\\b${escapeRegExp(name)}\\b`, 'gi'), ' ');
    }
  }
  return rest
    .replace(/\b(?:with|and|&)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
