import {clerkClient} from '@clerk/nextjs/server';
import {normalizeProfileEmail} from '@/lib/profile-email';

const CLERK_LIST_LIMIT = 100;

/**
 * Clerk is the source of truth for which accounts exist; Redis only holds taste data.
 * Returns null when Clerk could not be reached — callers must treat that as "unknown".
 */
export async function lookupClerkPrimaryEmails(
  userIds: readonly string[],
): Promise<Map<string, string | null> | null> {
  const found = new Map<string, string | null>();
  if (userIds.length === 0) return found;
  try {
    const client = await clerkClient();
    for (let i = 0; i < userIds.length; i += CLERK_LIST_LIMIT) {
      const batch = userIds.slice(i, i + CLERK_LIST_LIMIT);
      const {data} = await client.users.getUserList({userId: [...batch], limit: CLERK_LIST_LIMIT});
      for (const user of data) {
        found.set(
          user.id,
          normalizeProfileEmail(
            user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress,
          ),
        );
      }
    }
    return found;
  } catch (error) {
    console.error('[clerk-directory] user lookup failed:', error);
    return null;
  }
}
