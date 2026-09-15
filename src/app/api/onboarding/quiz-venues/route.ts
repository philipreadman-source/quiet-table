import {NextResponse} from 'next/server';
import type {CuisineId} from '@/lib/taste-profile';
import {buildTasteQuizVenues} from '@/lib/taste-quiz';

const VALID_CUISINES = new Set<CuisineId>([
  'italian',
  'french',
  'mexican',
  'seafood',
  'japanese',
  'middle-eastern',
  'modern-european',
  'steak-grill',
  'vegetarian-forward',
  'other',
]);

function parseCuisines(raw: string | null): CuisineId[] {
  if (raw == null || raw.trim().length === 0) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is CuisineId => VALID_CUISINES.has(part as CuisineId));
}

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const area = searchParams.get('area')?.trim() || 'Amsterdam';
  const cuisines = parseCuisines(searchParams.get('cuisines'));

  try {
    const venues = await buildTasteQuizVenues(area, cuisines);
    return NextResponse.json({venues, area, cuisines});
  } catch (error) {
    console.error('[onboarding/quiz-venues]', error);
    return NextResponse.json({venues: [], area, cuisines, error: 'Could not load quiz venues'}, {status: 503});
  }
}
