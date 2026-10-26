import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';

/** `location` is what goes into the booking draft — short, but unambiguous. */
export type PlaceItem = SearchableItem<{location: string}>;

type PhotonFeature = {
  properties: {
    osm_id?: number;
    name?: string;
    type?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

const PHOTON_URL = 'https://photon.komoot.io/api/';

function toPlaceItem(feature: PhotonFeature): PlaceItem | null {
  const {osm_id, name, type, city, state, country} = feature.properties;
  if (name == null || name.trim().length === 0) return null;
  // A neighbourhood is named with its city; a city with its country, so
  // "London" and "London, Ontario" stay distinct for the agent's search.
  const context = type === 'city' ? country : (city ?? state ?? country);
  const location = context != null && context !== name ? `${name}, ${context}` : name;
  const detail = [city, state, country].filter((part) => part != null && part !== name).join(', ');
  return {
    id: `${osm_id ?? name}-${type ?? ''}`,
    label: detail.length > 0 ? `${name} — ${detail}` : name,
    auxiliaryData: {location},
  };
}

/** Typeahead source for cities and neighbourhoods, via Photon (OpenStreetMap
 * data; free, and unlike Nominatim it allows search-as-you-type). */
export function createPlaceSearchSource(): SearchSource<PlaceItem> & {cancel: () => void} {
  let controller: AbortController | null = null;
  return {
    cancel() {
      controller?.abort();
    },
    async search(query: string) {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      controller?.abort();
      controller = new AbortController();
      const params = new URLSearchParams({q: trimmed, limit: '6', lang: 'en'});
      for (const layer of ['city', 'district', 'locality']) params.append('layer', layer);
      try {
        const res = await fetch(`${PHOTON_URL}?${params}`, {signal: controller.signal});
        if (!res.ok) return [];
        const data = (await res.json()) as {features?: PhotonFeature[]};
        const items = (data.features ?? []).map(toPlaceItem).filter((item): item is PlaceItem => item != null);
        const seen = new Set<string>();
        return items.filter((item) => !seen.has(item.label) && seen.add(item.label) != null);
      } catch {
        return [];
      }
    },
    bootstrap: () => [],
  };
}
