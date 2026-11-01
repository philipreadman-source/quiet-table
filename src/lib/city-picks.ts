import {CUISINE_OPTIONS, type CuisineId} from '@/lib/taste-profile';
import {isAmsterdamMetroHomeArea, venueSuitsDiet} from '@/lib/taste-quiz';
import {searchRestaurantsPhoton} from '@/lib/venue-search';
import {paginateVenueOptions, type DietaryNeeds, type VenueOptionCard} from '@/lib/venue-options';

// Outside Amsterdam there's no catalog, so with the agent off results come
// from OpenStreetMap (Photon), searched inside the chosen city: the user's
// cuisines first, then general restaurants. Sit-down restaurants only, and
// places they can't eat at left out. Rough by design — the agent does the
// real search when it's on.

const CITY_PICKS_POOL = 15;
const GENERAL_QUERIES = ['restaurant', 'bistro', 'brasserie', 'kitchen'];
// Unnamed places mapped by type alone: "Restaurant", "Restaurant 3", "Bistro H".
const GENERIC_NAME = /^(?:restaurant|bistro|brasserie|kitchen|cafe|café)(?:\s+\w{1,2}|\s*\d+)?$/i;

export function hasCatalogFor(location: string | undefined): boolean {
  return location == null || location.trim().length === 0 || isAmsterdamMetroHomeArea(location);
}

/** As the location card shows it ("London, England"), minus stray punctuation. */
export function cityLabel(location: string): string {
  return location.trim().replace(/[.!?]+$/, '');
}

export async function cityPicksPage(
  location: string,
  page: number,
  options: {cuisines?: CuisineId[]; diet?: DietaryNeeds} = {},
): Promise<{options: VenueOptionCard[]; hasMore: boolean; total: number}> {
  const area = cityLabel(location);
  const diet = options.diet ?? 'none';
  const queries = [
    ...(options.cuisines ?? [])
      .slice(0, 3)
      .map((id) => CUISINE_OPTIONS.find((option) => option.id === id)?.label)
      .filter((label): label is string => label != null),
    ...GENERAL_QUERIES,
  ];

  const cards: VenueOptionCard[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    if (cards.length >= CITY_PICKS_POOL) break;
    for (const venue of await searchRestaurantsPhoton(query, area, 8)) {
      const key = venue.title.trim().toLowerCase();
      // Photon labels each place's type last ("Soho · restaurant").
      if (seen.has(key) || GENERIC_NAME.test(venue.title.trim())) continue;
      if (!/· restaurant$/.test(venue.subtitle ?? '')) continue;
      if (!venueSuitsDiet(venue, diet)) continue;
      seen.add(key);
      cards.push(venue);
    }
  }
  return paginateVenueOptions(cards.slice(0, CITY_PICKS_POOL), page);
}
