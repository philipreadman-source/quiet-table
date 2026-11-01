import type {CuisineId} from '@/lib/taste-profile';
import {CUISINE_OPTIONS} from '@/lib/taste-profile';
import {
  listUniqueCatalogVenues,
  popularCatalogVenues,
  type DietaryNeeds,
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
  'flore': ['modern-european', 'vegetarian-forward'],
  'cue': ['modern-european', 'other'],
  'restaurant-plantage': ['vegetarian-forward', 'modern-european'],
  'restaurant-wils': ['modern-european'],
  'restaurant-spectrum': ['modern-european'],
  'restaurant-sinne': ['modern-european'],
  'cecconis': ['italian'],
  'momo': ['japanese'],
  'kimchi-premium': ['korean'],
  'lapaz': ['spanish-tapas'],
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
  {id: 'japanese', pattern: /\bjapanese|sushi|ramen|izakaya\b/i},
  {id: 'korean', pattern: /\b(?:korean|kimchi|bibimbap)\b/i},
  {id: 'chinese', pattern: /\b(?:chinese|dim sum|dumplings?|cantonese|sichuan|szechuan)\b/i},
  {id: 'southeast-asian', pattern: /\b(?:thai|vietnamese|pho|banh mi|malaysian|southeast asian)\b/i},
  {id: 'indian', pattern: /\b(?:indian|tandoori|biryani|masala)\b/i},
  {id: 'indonesian', pattern: /\b(?:indonesian|rijsttafel|nasi|rendang)\b/i},
  {id: 'spanish-tapas', pattern: /\b(?:spanish|tapas|pintxos|paella)\b/i},
  {id: 'modern-european', pattern: /\bmodern european|dutch|seasonal|fine dining|greenhouse\b/i},
  {id: 'seafood', pattern: /\bseafood|fish|oyster\b/i},
  {id: 'mexican', pattern: /\bmexican|taco\b/i},
  {id: 'middle-eastern', pattern: /\bmiddle eastern|israeli|mezze|lebanese|mezze\b/i},
  {id: 'steak-grill', pattern: /\bsteak|grill|ribs|bbq\b/i},
  {id: 'vegetarian-forward', pattern: /\bvegetarian|vegan|salad|plant\b/i},
];

export function isAmsterdamCatalogArea(area: string): boolean {
  const normalized = area.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return normalized === 'amsterdam' || normalized.includes('amsterdam');
}

/** Districts we treat as Amsterdam for city-wide quiz catalog (not neighborhood OSM). */
const AMSTERDAM_DISTRICT_KEYWORDS = [
  'centrum',
  'de pijp',
  'indische buurt',
  'jordaan',
  'museumkwartier',
  'nieuwmarkt',
  'noord',
  'oost',
  'oosterpark',
  'oud-west',
  'oud-zuid',
  'plantage',
  'rivierenbuurt',
  'west',
  'westergas',
  'zuid',
  'zuidas',
];

export function isAmsterdamMetroHomeArea(homeArea: string): boolean {
  if (isAmsterdamCatalogArea(homeArea)) return true;
  const normalized = homeArea.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return AMSTERDAM_DISTRICT_KEYWORDS.some(
    (district) => normalized === district || normalized.startsWith(`${district},`),
  );
}

/** Quiz searches at city granularity — not tight neighborhood OSM. */
export function quizCityArea(homeArea: string): string {
  const trimmed = homeArea.trim();
  if (trimmed.length === 0) return 'Amsterdam';
  if (isAmsterdamMetroHomeArea(trimmed)) return 'Amsterdam';

  const parts = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length >= 2) {
    const countryPattern =
      /^(netherlands|the netherlands|nederland|nl|uk|united kingdom|usa|united states)$/i;
    const localities = parts.filter((part) => !countryPattern.test(part));
    if (localities.length >= 2) {
      return localities[localities.length - 1]!;
    }
    if (localities.length === 1) return localities[0]!;
  }

  return trimmed;
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

/** Hard filter: never ask someone to rate a place they can't eat at. */
export function venueSuitsDiet(venue: VenueOptionCard, diet: DietaryNeeds = 'none'): boolean {
  if (diet === 'none' || diet === 'mixed') return true;
  const tags = cuisineTagsForVenue(venue);
  if (tags.includes('steak-grill')) return false;
  // Few veg options is fine for a pescatarian if it's a fish place.
  if (diet === 'pescatarian') {
    return !venue.dietary_tags?.includes('limited-veg') || tags.includes('seafood');
  }
  if (venue.dietary_tags?.includes('limited-veg')) return false;
  // Vegetarian and vegan: a seafood place only counts if it's tagged veg-friendly.
  const vegFriendly =
    venue.dietary_tags?.includes('vegetarian-friendly') ||
    venue.dietary_tags?.includes('vegan-friendly') ||
    tags.includes('vegetarian-forward');
  if (tags.includes('seafood') && !vegFriendly) return false;
  if (diet === 'vegan' && venue.dietary_tags != null && !venue.dietary_tags.includes('vegan-friendly')) {
    return false;
  }
  return true;
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
  excludeIds: readonly string[] = [],
  diet: DietaryNeeds = 'none',
): TasteQuizVenue[] {
  const exclude = new Set(excludeIds);
  const catalog = listUniqueCatalogVenues().filter((venue) => venueSuitsDiet(venue, diet));
  const ranked = [...catalog].sort(
    (a, b) => scoreVenueForQuiz(b, cuisines) - scoreVenueForQuiz(a, cuisines),
  );

  const picked: TasteQuizVenue[] = [];
  const seenIds = new Set<string>();

  const addVenue = (venue: VenueOptionCard) => {
    if (picked.length >= limit || seenIds.has(venue.id) || exclude.has(venue.id)) return;
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
      if (!venueSuitsDiet(venue, diet)) continue;
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
  excludeIds: string[] = [],
  diet: DietaryNeeds = 'none',
): Promise<TasteQuizVenue[]> {
  const exclude = new Set(excludeIds.map((id) => id.trim().toLowerCase()));
  const areaPart = quizCityArea(area);
  const collected: VenueOptionCard[] = [];
  const seen = new Set<string>();

  const addResults = (results: VenueOptionCard[]) => {
    for (const venue of results) {
      const key = venue.title.trim().toLowerCase();
      if (seen.has(key) || exclude.has(venue.id.toLowerCase()) || exclude.has(key)) continue;
      if (!venueSuitsDiet(venue, diet)) continue;
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
  limit = TASTE_QUIZ_VENUE_COUNT,
  excludeIds: string[] = [],
  diet: DietaryNeeds = 'none',
): Promise<TasteQuizVenue[]> {
  const cityArea = quizCityArea(area);

  if (isAmsterdamMetroHomeArea(area)) {
    const fromCatalog = buildCatalogTasteQuizVenues(cuisines, limit, excludeIds, diet);
    if (fromCatalog.length >= limit) return fromCatalog;

    const exclude = [
      ...excludeIds,
      ...fromCatalog.map((venue) => venue.id),
    ];
    const fromExternal = await buildExternalTasteQuizVenues(
      cityArea,
      cuisines,
      limit - fromCatalog.length,
      exclude,
      diet,
    );
    const merged = dedupeQuizVenues([...fromCatalog, ...fromExternal]);
    if (merged.length > 0) return merged.slice(0, limit);

    return fromCatalog;
  }

  let venues = await buildExternalTasteQuizVenues(cityArea, cuisines, limit, excludeIds, diet);
  if (venues.length === 0 && !cityArea.toLowerCase().includes('netherlands')) {
    venues = await buildExternalTasteQuizVenues(
      `${cityArea}, Netherlands`,
      cuisines,
      limit,
      excludeIds,
      diet,
    );
  }
  return venues;
}

export const PROFILE_TASTE_QUIZ_BATCH = 5;
