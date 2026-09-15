import type {CuisineId} from '@/lib/taste-profile';
import {CUISINE_OPTIONS} from '@/lib/taste-profile';
import {
  listUniqueCatalogVenues,
  popularCatalogVenues,
  type VenueOptionCard,
} from '@/lib/venue-options';
import {searchRestaurantsExternal} from '@/lib/venue-search';

export const TASTE_QUIZ_VENUE_COUNT = 5;

export type TasteQuizVenue = {
  id: string;
  title: string;
  subtitle?: string;
};

/** Canonical Amsterdam catalog ids → cuisine tags for quiz tailoring. */
const VENUE_CUISINE_OVERRIDES: Record<string, CuisineId[]> = {
  'bar-fisk': ['middle-eastern', 'seafood'],
  'cafe-de-klos': ['steak-grill'],
  'genki': ['japanese'],
  'sla-amsterdam': ['vegetarian-forward'],
  'de-kas': ['modern-european', 'vegetarian-forward'],
  'taiko': ['japanese'],
  'restaurant-cedric': ['french'],
  'bolenius': ['modern-european'],
  'gruppo-di-amici': ['italian'],
  'fitchers': ['modern-european', 'other'],
  'neni-amsterdam': ['middle-eastern'],
  'restaurant-212': ['modern-european'],
  'rijks': ['modern-european'],
  'graphite': ['french'],
  'restaurant-gem': ['modern-european'],
  'restaurant-brut172': ['modern-european'],
  'restaurant-plantage': ['vegetarian-forward', 'modern-european'],
  'restaurant-wils': ['modern-european'],
  'restaurant-spectrum': ['modern-european'],
  'restaurant-sinne': ['modern-european'],
  'cecconis': ['italian'],
  'momo': ['japanese'],
  'kimchi-premium': ['other'],
  'lapaz': ['other'],
  'piket': ['modern-european'],
  'restaurant-rouge': ['french'],
  'restaurant-meatless': ['vegetarian-forward'],
  'cafe-restaurant-de-baanderij': ['modern-european'],
  'rotate-leidseplein': ['modern-european'],
  'broth-petit-zuid': ['japanese'],
  'la-brutal-taqueria': ['mexican'],
  'omoka-nsdm': ['other'],
  'pure-wines-bar': ['modern-european', 'other'],
  'how-is-your': ['modern-european', 'other'],
  'chun-bijenkorf': ['japanese'],
  'arte-vanilla': ['other'],
};

const CUISINE_KEYWORDS: {id: CuisineId; pattern: RegExp}[] = [
  {id: 'italian', pattern: /\bitalian|pasta|pizza|trattoria|osteria\b/i},
  {id: 'french', pattern: /\bfrench|bistro|brasserie\b/i},
  {id: 'japanese', pattern: /\bjapanese|sushi|ramen|izakaya|korean\b/i},
  {id: 'modern-european', pattern: /\bmodern european|dutch|seasonal|fine dining|greenhouse\b/i},
  {id: 'seafood', pattern: /\bseafood|fish|oyster\b/i},
  {id: 'mexican', pattern: /\bmexican|taco\b/i},
  {id: 'middle-eastern', pattern: /\bmiddle eastern|israeli|mezze|lebanese|mezze\b/i},
  {id: 'steak-grill', pattern: /\bsteak|grill|ribs|bbq\b/i},
  {id: 'vegetarian-forward', pattern: /\bvegetarian|vegan|salad|plant\b/i},
];

export function isAmsterdamCatalogArea(area: string): boolean {
  const normalized = area.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return normalized === 'amsterdam' || normalized.includes('amsterdam');
}

export function cuisineTagsForVenue(venue: VenueOptionCard): CuisineId[] {
  const override = VENUE_CUISINE_OVERRIDES[venue.id];
  if (override != null && override.length > 0) return override;

  const haystack = `${venue.title} ${venue.subtitle ?? ''} ${venue.description ?? ''}`;
  const matched = CUISINE_KEYWORDS.filter(({pattern}) => pattern.test(haystack)).map(({id}) => id);
  return matched.length > 0 ? matched : ['other'];
}

function venueMatchesCuisines(venue: VenueOptionCard, cuisines: CuisineId[]): boolean {
  if (cuisines.length === 0) return false;
  const tags = cuisineTagsForVenue(venue);
  return cuisines.some((cuisine) => tags.includes(cuisine));
}

function scoreVenueForQuiz(
  venue: VenueOptionCard,
  cuisines: CuisineId[],
): number {
  const tags = cuisineTagsForVenue(venue);
  let score = venue.google_rating ?? 0;
  if (cuisines.length === 0) return score;
  const overlap = cuisines.filter((c) => tags.includes(c)).length;
  score += overlap * 10;
  return score;
}

function toQuizVenue(venue: VenueOptionCard): TasteQuizVenue {
  return {
    id: venue.id,
    title: venue.title,
    subtitle: venue.subtitle,
  };
}

function dedupeQuizVenues(venues: TasteQuizVenue[]): TasteQuizVenue[] {
  const seen = new Set<string>();
  const out: TasteQuizVenue[] = [];
  for (const venue of venues) {
    const key = venue.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(venue);
  }
  return out;
}

/** Amsterdam mock catalog — tailor to cuisine picks, fill with popular general picks. */
export function buildCatalogTasteQuizVenues(
  cuisines: CuisineId[],
  limit = TASTE_QUIZ_VENUE_COUNT,
): TasteQuizVenue[] {
  const catalog = listUniqueCatalogVenues();
  const ranked = [...catalog].sort(
    (a, b) => scoreVenueForQuiz(b, cuisines) - scoreVenueForQuiz(a, cuisines),
  );

  const picked: TasteQuizVenue[] = [];
  const seenIds = new Set<string>();

  const addVenue = (venue: VenueOptionCard) => {
    if (picked.length >= limit || seenIds.has(venue.id)) return;
    seenIds.add(venue.id);
    picked.push(toQuizVenue(venue));
  };

  if (cuisines.length > 0) {
    for (const venue of ranked) {
      if (!venueMatchesCuisines(venue, cuisines)) continue;
      addVenue(venue);
      if (picked.length >= limit) break;
    }
  }

  for (const venue of ranked) {
    addVenue(venue);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const venue of popularCatalogVenues(limit * 2)) {
      addVenue(venue);
      if (picked.length >= limit) break;
    }
  }

  return dedupeQuizVenues(picked).slice(0, limit);
}

function cuisineSearchQuery(cuisineId: CuisineId): string {
  const label = CUISINE_OPTIONS.find((option) => option.id === cuisineId)?.label ?? cuisineId;
  return `${label} restaurant`;
}

/** Non-Amsterdam — OpenStreetMap venues for the user's city, cuisine-first then general fill. */
export async function buildExternalTasteQuizVenues(
  area: string,
  cuisines: CuisineId[],
  limit = TASTE_QUIZ_VENUE_COUNT,
): Promise<TasteQuizVenue[]> {
  const areaPart = area.trim();
  const collected: VenueOptionCard[] = [];
  const seen = new Set<string>();

  const addResults = (results: VenueOptionCard[]) => {
    for (const venue of results) {
      const key = venue.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(venue);
    }
  };

  for (const cuisine of cuisines.slice(0, 4)) {
    if (collected.length >= limit) break;
    const results = await searchRestaurantsExternal(cuisineSearchQuery(cuisine), areaPart, 3);
    addResults(results);
  }

  const fillQueries = ['restaurant', 'bistro', 'cafe'];
  for (const query of fillQueries) {
    if (collected.length >= limit) break;
    const results = await searchRestaurantsExternal(query, areaPart, limit);
    addResults(results);
  }

  return dedupeQuizVenues(collected.map(toQuizVenue)).slice(0, limit);
}

export async function buildTasteQuizVenues(
  area: string,
  cuisines: CuisineId[] = [],
): Promise<TasteQuizVenue[]> {
  if (isAmsterdamCatalogArea(area)) {
    return buildCatalogTasteQuizVenues(cuisines);
  }
  return buildExternalTasteQuizVenues(area, cuisines);
}
