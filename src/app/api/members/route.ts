import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {tasteProfileToFriendFoodProfile} from '@/lib/member-friends';
import {listMemberProfilesForSession} from '@/lib/member-registry-server';

export async function GET() {
  const {userId} = await auth();
  if (userId == null || userId.length === 0) {
    return NextResponse.json({error: 'Unauthorized.'}, {status: 401});
  }

  const listed = await listMemberProfilesForSession(userId);
  if (!listed.ok) {
    return NextResponse.json({error: listed.error, members: []}, {status: 503});
  }

  const members = listed.profiles.map(tasteProfileToFriendFoodProfile);
  return NextResponse.json({members});
}
