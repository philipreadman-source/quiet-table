import {auth, currentUser} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {normalizeProfileEmail} from '@/lib/profile-email';
import {tasteProfileToFriendFoodProfile} from '@/lib/member-friends';
import {listMemberProfilesForSession} from '@/lib/member-registry-server';

export async function GET() {
  const {userId} = await auth();
  if (userId == null || userId.length === 0) {
    return NextResponse.json({error: 'Unauthorized.'}, {status: 401});
  }

  const clerkUser = await currentUser();
  const sessionEmail =
    normalizeProfileEmail(clerkUser?.primaryEmailAddress?.emailAddress) ??
    normalizeProfileEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);

  const listed = await listMemberProfilesForSession(userId, sessionEmail);
  if (!listed.ok) {
    return NextResponse.json({error: listed.error, members: []}, {status: 503});
  }

  const members = listed.profiles.map(tasteProfileToFriendFoodProfile);
  return NextResponse.json({members});
}
