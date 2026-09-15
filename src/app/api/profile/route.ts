import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getStoredProfile, isProfileStoreConfigured, putStoredProfile} from '@/lib/profile-store-server';
import {parseTasteProfilePayloadForSession} from '@/lib/taste-profile-payload';

export async function GET() {
  const {userId} = await auth();
  if (userId == null || userId.length === 0) {
    return NextResponse.json({error: 'Unauthorized.'}, {status: 401});
  }
  if (!isProfileStoreConfigured()) {
    return NextResponse.json({error: 'Profile storage not configured.', profile: null}, {status: 503});
  }
  const profile = await getStoredProfile(userId);
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
  const saved = await putStoredProfile(parsed.profile);
  if (!saved.ok) {
    return NextResponse.json({error: saved.error}, {status: 503});
  }
  return NextResponse.json({ok: true, userId: parsed.profile.userId});
}
