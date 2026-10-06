import {auth, currentUser} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {normalizeProfileEmail} from '@/lib/profile-email';
import {
  isProfileStoreConfigured,
  putStoredProfile,
  resolveProfileForSession,
} from '@/lib/profile-store-server';
import {parseTasteProfilePayloadForSession} from '@/lib/taste-profile-payload';

function clerkPrimaryEmailFromUser(
  user: Awaited<ReturnType<typeof currentUser>>,
): string | undefined {
  const email =
    user?.primaryEmailAddress?.emailAddress?.trim() ??
    user?.emailAddresses?.[0]?.emailAddress?.trim();
  return normalizeProfileEmail(email) ?? undefined;
}

export async function GET() {
  const {userId} = await auth();
  if (userId == null || userId.length === 0) {
    return NextResponse.json({error: 'Unauthorized.'}, {status: 401});
  }
  if (!isProfileStoreConfigured()) {
    return NextResponse.json({error: 'Profile storage not configured.', profile: null}, {status: 503});
  }

  const profile = await resolveProfileForSession(
    userId,
    clerkPrimaryEmailFromUser(await currentUser()),
  );

  if (profile == null) {
    return NextResponse.json({profile: null}, {status: 404});
  }
  return NextResponse.json({profile});
}

export async function PUT(request: Request) {
  const {userId} = await auth();
  if (userId == null || userId.length === 0) {
    return NextResponse.json({error: 'Unauthorized.'}, {status: 401});
  }
  if (!isProfileStoreConfigured()) {
    return NextResponse.json({error: 'Profile storage not configured.'}, {status: 503});
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON body.'}, {status: 400});
  }
  const parsed = parseTasteProfilePayloadForSession(body, userId);
  if (!parsed.ok) {
    return NextResponse.json({error: parsed.error}, {status: 400});
  }

  const clerkUser = await currentUser();
  const primaryEmail = clerkPrimaryEmailFromUser(clerkUser);
  const profile =
    primaryEmail != null
      ? {
          ...parsed.profile,
          clerk: {...parsed.profile.clerk, primaryEmail},
        }
      : parsed.profile;

  const saved = await putStoredProfile(profile);
  if (!saved.ok) {
    return NextResponse.json({error: saved.error}, {status: 503});
  }
  return NextResponse.json({ok: true, userId: profile.userId});
}
