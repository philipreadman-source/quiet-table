import {
  findVenueOption,
  searchCatalogVenues,
  type VenueOptionCard,
} from '@/lib/venue-options';

const NOMINATIM_USER_AGENT = 'QuietTable/1.0 (onboarding; https://quiet-table-1.vercel.app)';

const FOOD_AMENITY_TYPES = new Set([
  'restaurant',
  'cafe',
  'bar',
  'pub',
  'fast_food',
  'food_court',
  'bistro',
  'ice_cream',
  'biergarten',
]);

type NominatimResult = {
  place_id: number;
  name?: string;
  display_name?: string;
  type?: string;
  class?: string;
  address?: Record<string, string | undefined>;
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function isFoodPlace(result: NominatimResult): boolean {
  if (result.class === 'amenity' && result.type != null && FOOD_AMENITY_TYPES.has(result.type)) {
    return true;
  }
  return result.type === 'restaurant';
}

function titleFromNominatim(result: NominatimResult): string | null {
  const name = result.name?.trim();
  if (name != null && name.length > 0) return name;
  const display = result.display_name?.trim();
  if (display == null) return null;
  return display.split(',')[0]?.trim() ?? null;
}

function subtitleFromNominatim(result: NominatimResult, area: string): string {
  const address = result.address ?? {};
  const neighbourhood =
    address.suburb ?? address.neighbourhood ?? address.quarter ?? address.city_district;
  const city = address.city ?? address.town ?? address.municipality;
  const typeLabel = result.type?.replace(/_/g, ' ') ?? 'place';
  const locality = neighbourhood ?? city ?? area;
  return `${locality} · ${typeLabel}`;
}

function nominatimToVenue(result: NominatimResult, area: string): VenueOptionCard | null {
  const title = titleFromNominatim(result);
  if (title == null || title.length < 2) return null;
  return {
    id: `osm-${result.place_id}`,
    title,
    subtitle: subtitleFromNominatim(result, area),
    meta: 'Found on OpenStreetMap',
  };
}

/** Free forward search — real restaurants/places, not limited to our mock catalog. */
export async function searchRestaurantsExternal(
  query: string,
  area: string,
  limit = 8,
): Promise<VenueOptionCard[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const areaPart = area.trim() || 'Amsterdam';
  const q = `${trimmed} ${areaPart}`;

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(Math.min(limit * 2, 12)));
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url.toString(), {
      headers: {'User-Agent': NOMINATIM_USER_AGENT},
      next: {revalidate: 3600},
    });
    if (!res.ok) return [];

    const data = (await res.json()) as NominatimResult[];
    const venues: VenueOptionCard[] = [];
    const seen = new Set<string>();

    for (const result of data) {
      if (!isFoodPlace(result)) continue;
      const venue = nominatimToVenue(result, areaPart);
      if (venue == null) continue;
      const key = normalizeTitle(venue.title);
      if (seen.has(key)) continue;
      seen.add(key);
      venues.push(venue);
      if (venues.length >= limit) break;
    }

    return venues;
  } catch {
    return [];
  }
}

/** Catalog first (rich cards), then OSM — skip OSM rows that duplicate catalog titles. */
export function mergeVenueSearchResults(
  catalog: VenueOptionCard[],
  external: VenueOptionCard[],
  limit = 10,
): VenueOptionCard[] {
  const merged = [...catalog];
  const seen = new Set(catalog.map((venue) => normalizeTitle(venue.title)));

  for (const venue of external) {
    const key = normalizeTitle(venue.title);
    const known = findVenueOption(venue.title);
    if (known != null) {
      if (!seen.has(normalizeTitle(known.title))) {
        merged.push(known);
        seen.add(normalizeTitle(known.title));
      }
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(venue);
    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
}

export async function searchRestaurantsForOnboarding(
  query: string,
  area: string,
  limit = 10,
): Promise<{results: VenueOptionCard[]; catalogCount: number; externalCount: number}> {
  const catalog = searchCatalogVenues(query, limit);
  const external = await searchRestaurantsExternal(query, area, limit);
  const results = mergeVenueSearchResults(catalog, external, limit);
  const catalogTitles = new Set(catalog.map((v) => normalizeTitle(v.title)));
  const externalOnly = external.filter((v) => !catalogTitles.has(normalizeTitle(v.title)));
  return {
    results,
    catalogCount: catalog.length,
    externalCount: externalOnly.length,
  };
}
