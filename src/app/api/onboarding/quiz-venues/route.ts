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
  const area = searchParams.get('area')?.trim() ?? '';
  if (area.length < 2) {
    return NextResponse.json(
      {venues: [], area: '', cuisines: [], error: 'Location is required for the quiz.'},
      {status: 400},
    );
  }
  const cuisines = parseCuisines(searchParams.get('cuisines'));
  const limitRaw = Number.parseInt(searchParams.get('limit') ?? '5', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;
  const exclude =
    searchParams
      .get('exclude')
      ?.split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0) ?? [];

  try {
    const venues = await buildTasteQuizVenues(area, cuisines, limit, exclude);
    return NextResponse.json({venues, area, cuisines});
  } catch (error) {
    console.error('[onboarding/quiz-venues]', error);
    return NextResponse.json({venues: [], area, cuisines, error: 'Could not load quiz venues'}, {status: 503});
  }
}
