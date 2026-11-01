import {NextResponse} from 'next/server';
import {cityPicksPage} from '@/lib/city-picks';
import {CUISINE_OPTIONS, type CuisineId} from '@/lib/taste-profile';
import type {DietaryNeeds} from '@/lib/venue-options';

const VALID_CUISINES = new Set<CuisineId>(CUISINE_OPTIONS.map((option) => option.id));
const VALID_DIETS = new Set<DietaryNeeds>(['none', 'vegetarian', 'vegan', 'mixed', 'pescatarian']);

/** Places in a non-catalog city, a page at a time, for the agent-off chat. */
export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const area = searchParams.get('area')?.trim() ?? '';
  if (area.length < 2) return NextResponse.json({error: 'area is required'}, {status: 400});
  const page = Math.max(0, Number.parseInt(searchParams.get('page') ?? '0', 10) || 0);
  const cuisines = (searchParams.get('cuisines') ?? '')
    .split(',')
    .filter((id): id is CuisineId => VALID_CUISINES.has(id as CuisineId));
  const dietRaw = searchParams.get('diet') as DietaryNeeds | null;
  const diet = dietRaw != null && VALID_DIETS.has(dietRaw) ? dietRaw : 'none';
  try {
    return NextResponse.json(await cityPicksPage(area, page, {cuisines, diet}));
  } catch (error) {
    console.error('[fallback-places]', error);
    return NextResponse.json({options: [], hasMore: false, total: 0}, {status: 503});
  }
}
