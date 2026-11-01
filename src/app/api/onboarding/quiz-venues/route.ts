import {NextResponse} from 'next/server';
import {CUISINE_OPTIONS, type CuisineId} from '@/lib/taste-profile';
import {buildTasteQuizVenues} from '@/lib/taste-quiz';
import type {DietaryNeeds} from '@/lib/venue-options';

// From the picker's own list, so a new cuisine can't be silently dropped here.
const VALID_CUISINES = new Set<CuisineId>(CUISINE_OPTIONS.map((option) => option.id));

const VALID_DIETS = new Set<DietaryNeeds>(['none', 'vegetarian', 'vegan', 'mixed', 'pescatarian']);

function parseDiet(raw: string | null): DietaryNeeds {
  return raw != null && VALID_DIETS.has(raw as DietaryNeeds) ? (raw as DietaryNeeds) : 'none';
}

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
  const diet = parseDiet(searchParams.get('diet'));
  const limitRaw = Number.parseInt(searchParams.get('limit') ?? '5', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;
  const exclude =
    searchParams
      .get('exclude')
      ?.split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0) ?? [];

  try {
    const venues = await buildTasteQuizVenues(area, cuisines, limit, exclude, diet);
    return NextResponse.json({venues, area, cuisines});
  } catch (error) {
    console.error('[onboarding/quiz-venues]', error);
    return NextResponse.json({venues: [], area, cuisines, error: 'Could not load quiz venues'}, {status: 503});
  }
}
