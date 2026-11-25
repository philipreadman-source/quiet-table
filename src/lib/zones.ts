// Copied from quiet-table-ios/src/shared/zones.ts by scripts/sync-catalog.mjs.
// Edit it there, then run the sync.

// Parts of each Find city, so you can look in Soho and South rather than all
// of London. Each zone lists the catalog's area names in it; a place with an
// area we don't know (one a member added from Apple Maps) goes to the zone
// whose centre is nearest. `near` is used when a zone alone has too few
// places: Find widens to them and says so.

export type Zone = {
  id: string;
  label: string;
  areas: string[];
  centre: {lat: number; lng: number};
  near: string[];
};

export const ZONES: Record<string, Zone[]> = {
  London: [
    {
      id: 'soho',
      label: 'Soho & Covent Garden',
      areas: ['Soho', 'Covent Garden', 'Chinatown', 'Strand', 'Embankment', 'Temple', 'Holborn', 'Bloomsbury'],
      centre: {lat: 51.5125, lng: -0.1307},
      near: ['mayfair', 'city-east'],
    },
    {
      id: 'mayfair',
      label: 'Mayfair & Marylebone',
      areas: [
        'Mayfair',
        'Marylebone',
        'Fitzrovia',
        "St James's",
        'Whitehall',
        'Westminster',
        'Victoria',
        'Pimlico',
        'Belgravia',
        'Knightsbridge',
        'Paddington',
        'Bayswater',
      ],
      centre: {lat: 51.5125, lng: -0.1515},
      near: ['soho', 'west'],
    },
    {
      id: 'city-east',
      label: 'City & East',
      areas: [
        'City of London',
        'Bank',
        'Liverpool Street',
        'Smithfield',
        'Farringdon',
        'Clerkenwell',
        'Shoreditch',
        'Spitalfields',
        'Whitechapel',
        'Bethnal Green',
        'Hackney',
        'London Fields',
        'Hackney Wick',
        'Dalston',
        'Clapton',
        'Canary Wharf',
        'St Katharine Docks',
        'Tower Hill',
        'Forest Gate',
      ],
      centre: {lat: 51.5235, lng: -0.0795},
      near: ['soho', 'north'],
    },
    {
      id: 'north',
      label: 'North',
      areas: [
        'Islington',
        'Canonbury',
        'Newington Green',
        'Stoke Newington',
        'Kentish Town',
        'Holloway',
        'Crouch End',
        'Muswell Hill',
        "Queen's Park",
        'Maida Vale',
        'Little Venice',
      ],
      centre: {lat: 51.5555, lng: -0.1085},
      near: ['city-east', 'soho'],
    },
    {
      id: 'south',
      label: 'South',
      areas: [
        'Borough',
        'Southwark',
        'London Bridge',
        'South Bank',
        'Peckham',
        'Brixton',
        'Clapham',
        'Wandsworth',
        'East Dulwich',
        'Brockley',
        'Greenwich',
        'Putney',
        'Barnes',
        'Wimbledon',
        'Richmond',
      ],
      centre: {lat: 51.4705, lng: -0.1035},
      near: ['soho', 'city-east'],
    },
    {
      id: 'west',
      label: 'West',
      areas: [
        'Notting Hill',
        'North Kensington',
        'Holland Park',
        'Kensington',
        'Chelsea',
        'Fulham',
        'Hammersmith',
        'Olympia',
        'Brook Green',
        "Shepherd's Bush",
        'White City',
        'Chiswick',
      ],
      centre: {lat: 51.4985, lng: -0.2005},
      near: ['mayfair', 'soho'],
    },
  ],
  Amsterdam: [
    {
      id: 'centre',
      label: 'Centre & Canals',
      areas: ['Centrum', 'Center', 'Canal Belt', 'Leidseplein', 'Weteringbuurt', 'Oosterdok'],
      centre: {lat: 52.3705, lng: 4.8925},
      near: ['jordaan-west', 'de-pijp'],
    },
    {
      id: 'jordaan-west',
      label: 'Jordaan & West',
      areas: [
        'Jordaan',
        'Oud-West',
        'West',
        'Houthaven',
        'Staatsliedenbuurt',
        'Westerpark',
        'De Baarsjes',
        'Rembrandtpark',
      ],
      centre: {lat: 52.3745, lng: 4.8665},
      near: ['centre', 'zuid'],
    },
    {
      id: 'de-pijp',
      label: 'De Pijp',
      areas: ['De Pijp'],
      centre: {lat: 52.3545, lng: 4.8935},
      near: ['centre', 'zuid'],
    },
    {
      id: 'zuid',
      label: 'Zuid',
      areas: ['Oud-Zuid', 'Zuid', 'Museum Quarter', 'Stadionplein', 'Rivierenbuurt', 'Zuidas', 'Schinkelbuurt'],
      centre: {lat: 52.3485, lng: 4.8705},
      near: ['de-pijp', 'jordaan-west'],
    },
    {
      id: 'oost',
      label: 'Oost',
      areas: ['Oost', 'East', 'Plantage', 'Park Frankendael', 'Oostenburg'],
      centre: {lat: 52.3605, lng: 4.9285},
      near: ['centre', 'de-pijp'],
    },
    {
      id: 'noord',
      label: 'Noord',
      areas: ['Noord', 'NDSM', 'Broek in Waterland'],
      centre: {lat: 52.3925, lng: 4.9165},
      near: ['centre', 'oost'],
    },
  ],
};

/** The zones of a Find city ("London"), or none for a city without them. */
export function zonesOf(city: string): Zone[] {
  const key = Object.keys(ZONES).find((name) => city.toLowerCase().includes(name.toLowerCase()));
  return key != null ? ZONES[key] : [];
}

type Located = {city: string; area: string | null; lat?: number | null; lng?: number | null};

/** Which zone a place is in: by its area name, else the nearest zone centre,
 * else none (no area we know and no coordinates). */
export function zoneOf(place: Located): string | null {
  const zones = zonesOf(place.city);
  if (zones.length === 0) return null;
  const area = place.area?.toLowerCase().trim();
  const named = area != null ? zones.find((zone) => zone.areas.some((name) => name.toLowerCase() === area)) : undefined;
  if (named != null) return named.id;
  if (place.lat == null || place.lng == null) return null;
  const {lat, lng} = place;
  // Close enough to compare across a city: degrees of longitude shrink by cos(latitude).
  const squeeze = Math.cos((lat * Math.PI) / 180);
  const distance = (zone: Zone) => (zone.centre.lat - lat) ** 2 + ((zone.centre.lng - lng) * squeeze) ** 2;
  return zones.reduce((best, zone) => (distance(zone) < distance(best) ? zone : best)).id;
}

/** The zones picked plus their neighbours, for widening a thin search. */
export function widenZones(city: string, picked: string[]): string[] {
  const zones = zonesOf(city);
  const near = zones.filter((zone) => picked.includes(zone.id)).flatMap((zone) => zone.near);
  return [...new Set([...picked, ...near])];
}
