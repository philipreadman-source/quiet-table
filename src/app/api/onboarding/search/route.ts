import {NextResponse} from 'next/server';
import {searchRestaurantsForOnboarding} from '@/lib/venue-search';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const area = searchParams.get('area') ?? 'Amsterdam';

  if (q.trim().length < 2) {
    return NextResponse.json({results: [], catalogCount: 0, externalCount: 0});
  }

  const payload = await searchRestaurantsForOnboarding(q, area);
  return NextResponse.json(payload);
}
