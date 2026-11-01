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

// Type-ahead uses Photon (OpenStreetMap data, built for search-as-you-type
// and partial names). Nominatim above stays for the quiz's category queries
// ("Italian restaurant"), which Photon doesn't match on.
const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_FOOD_TAGS = [...FOOD_AMENITY_TYPES].map((type) => `amenity:${type}`);
// Roughly 25km around the city centre counts as "near you".
const NEARBY_LAT = 0.22;
const NEARBY_LON = 0.36;

type PhotonFeature = {
  geometry?: {coordinates?: [number, number]};
  properties: {
    osm_id?: number;
    osm_type?: string;
    osm_value?: string;
    name?: string;
    district?: string;
    locality?: string;
    city?: string;
    country?: string;
  };
};

async function photonSearch(params: URLSearchParams): Promise<PhotonFeature[]> {
  try {
    const res = await fetch(`${PHOTON_URL}?${params}`, {
      headers: {'User-Agent': NOMINATIM_USER_AGENT},
      next: {revalidate: 3600},
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {features?: PhotonFeature[]};
    return body.features ?? [];
  } catch {
    return [];
  }
}

const cityCentreCache = new Map<string, [number, number]>();

/** [lon, lat] of the home city, so results near it come first. */
async function cityCentre(area: string): Promise<[number, number] | null> {
  const key = area.trim().toLowerCase();
  const cached = cityCentreCache.get(key);
  if (cached != null) return cached;
  const params = new URLSearchParams({q: area, limit: '1', lang: 'en'});
  for (const tag of ['place:city', 'place:town', 'place:suburb']) params.append('osm_tag', tag);
  const [feature] = await photonSearch(params);
  const centre = feature?.geometry?.coordinates ?? null;
  // Only remember hits, so a failed lookup is retried next time.
  if (centre != null) cityCentreCache.set(key, centre);
  return centre;
}

function photonToVenue(feature: PhotonFeature): VenueOptionCard | null {
  const {osm_id, osm_type, osm_value, name, district, locality, city} = feature.properties;
  const title = name?.trim();
  if (title == null || title.length < 2 || osm_id == null) return null;
  const place = [district ?? locality, city].filter(
    (part, index, all): part is string => part != null && all.indexOf(part) === index,
  );
  const typeLabel = osm_value?.replace(/_/g, ' ') ?? 'place';
  return {
    id: `osm-${osm_type ?? ''}${osm_id}`,
    title,
    subtitle: place.length > 0 ? `${place.join(', ')} · ${typeLabel}` : typeLabel,
    meta: 'Found on OpenStreetMap',
  };
}

/** Restaurants by (partial) name near the home city, or anywhere if none match there. */
export async function searchRestaurantsPhoton(
  query: string,
  area: string,
  limit = 8,
): Promise<VenueOptionCard[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const base = () => {
    const params = new URLSearchParams({q: trimmed, limit: String(limit), lang: 'en'});
    for (const tag of PHOTON_FOOD_TAGS) params.append('osm_tag', tag);
    return params;
  };

  const centre = await cityCentre(area.trim() || 'Amsterdam');
  const features: PhotonFeature[] = [];
  if (centre != null) {
    const [lon, lat] = centre;
    const nearby = base();
    nearby.set(
      'bbox',
      [lon - NEARBY_LON, lat - NEARBY_LAT, lon + NEARBY_LON, lat + NEARBY_LAT].join(','),
    );
    features.push(...(await photonSearch(nearby)));
  }
  // Nothing nearby: maybe a favourite from a trip, so widen out.
  if (features.length === 0) {
    const anywhere = base();
    if (centre != null) {
      anywhere.set('lon', String(centre[0]));
      anywhere.set('lat', String(centre[1]));
    }
    features.push(...(await photonSearch(anywhere)));
  }

  const venues: VenueOptionCard[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const venue = photonToVenue(feature);
    if (venue == null || seen.has(venue.id)) continue;
    seen.add(venue.id);
    venues.push(venue);
    if (venues.length >= limit) break;
  }
  return venues;
}

export async function searchRestaurantsForOnboarding(
  query: string,
  area: string,
  limit = 10,
): Promise<{results: VenueOptionCard[]; catalogCount: number; externalCount: number}> {
  const catalog = searchCatalogVenues(query, limit);
  const external = await searchRestaurantsPhoton(query, area, limit);
  const results = mergeVenueSearchResults(catalog, external, limit);
  const catalogTitles = new Set(catalog.map((v) => normalizeTitle(v.title)));
  const externalOnly = external.filter((v) => !catalogTitles.has(normalizeTitle(v.title)));
  return {
    results,
    catalogCount: catalog.length,
    externalCount: externalOnly.length,
  };
}
