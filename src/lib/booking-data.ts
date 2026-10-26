// Mock domain data + tool implementations for the booking agent prototype.
// No real calendar/venue/car APIs — these stand in for them.

import {findVenueOption, searchCatalogForAgent} from '@/lib/venue-options';

export type Venue = {
  id: string;
  name: string;
  travel: string;
  available: string;
  description: string;
  tags: string[];
  shellfishHeavy?: boolean;
};

export const VENUES: Venue[] = [
  {
    id: 'nick-stef',
    name: "Nick + Stef's Steakhouse",
    travel: '8 min via subway',
    available: '8:30pm',
    description: 'High-end steakhouse with a big communal table, an array of meats & wine. Built for a crowd.',
    tags: ['group', 'classic', 'steakhouse'],
  },
  {
    id: 'peak-priceless',
    name: 'Peak with Priceless',
    travel: '7 min walk',
    available: '8:15pm',
    description: 'Quiet rooftop dining with skyline views, known for a hushed back room.',
    tags: ['quiet', 'date-night', 'rooftop'],
  },
  {
    id: 'estiatorio-milos',
    name: 'Estiatorio Milos',
    travel: '15 min walk',
    available: '8:15pm',
    description: 'Refined Greek seafood, spaced tables, low ambient noise. Menu leans heavily shellfish — flag any allergy.',
    tags: ['michelin', 'fine-dining', 'seafood', 'quiet'],
    shellfishHeavy: true,
  },
  {
    id: 'carbone',
    name: 'Carbone',
    travel: '12 min via subway',
    available: '9:00pm',
    description: 'Old-school Italian glamour, red-sauce classics, a scene built for a night to remember.',
    tags: ['date-night', 'celebration', 'italian', 'lively'],
  },
  {
    id: 'employees-only',
    name: 'Employees Only',
    travel: '5 min walk',
    available: '8:45pm',
    description: 'Speakeasy-style cocktail den with a big table upstairs, made for a group.',
    tags: ['group', 'casual', 'cocktails', 'lively'],
  },
  {
    id: 'le-bernardin',
    name: 'Le Bernardin',
    travel: '10 min via subway',
    available: '9:15pm',
    description: 'Three-Michelin-star seafood tasting menu, hushed dining room, occasion-worthy.',
    tags: ['michelin', 'fine-dining', 'seafood', 'celebration'],
    shellfishHeavy: true,
  },
];

// Tool-call ids/names/vibes drift in shape (hyphens, underscores, spaces,
// partial words). Normalize to a bare word-sequence before comparing so any
// form resolves consistently.
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-');

function findVenue(idOrName: string): Venue | undefined {
  const catalog = findVenueOption(idOrName);
  if (catalog != null) {
    return {
      id: catalog.id,
      name: catalog.title,
      travel: catalog.subtitle ?? 'Amsterdam',
      available: '7:30pm',
      description: catalog.description ?? catalog.subtitle ?? '',
      tags: ['catalog'],
    };
  }
  const needle = slug(idOrName).replace(/-/g, ' ');
  return VENUES.find((v) => {
    const idSlug = slug(v.id).replace(/-/g, ' ');
    const nameSlug = slug(v.name).replace(/-/g, ' ');
    return idSlug === needle || nameSlug === needle || nameSlug.includes(needle) || needle.includes(idSlug);
  });
}

export function searchTables(args: {
  vibe?: string;
  near?: string;
  party_size?: number;
  time_window?: string;
  dietary_restrictions?: string[];
  query?: string;
  limit?: number;
}) {
  const catalog = searchCatalogForAgent({
    vibe: args.vibe,
    near: args.near,
    query: args.query,
    limit: args.limit ?? 12,
  });
  // Amsterdam catalog only. An empty result means the agent should use
  // web_search for that city, not the old mock list.
  return catalog;
}

// Deterministic pseudo-availability for venues outside the mock catalog —
// real venues surfaced via web_search have no seeded `available` field, so
// this stands in for a real reservation-system lookup rather than always
// reporting unavailable just because the name isn't in VENUES.
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

export function checkVenueAvailability(args: {venue_id: string; time: string}) {
  const venue = findVenue(args.venue_id);
  if (venue != null) return {available: true, time: args.time || venue.available};
  return {available: seededRandom(`${args.venue_id}-${args.time}`) > 0.2, time: args.time};
}

export function createBooking(args: {venue_id: string; time: string; party_size: number}) {
  const venue = findVenue(args.venue_id);
  return {
    confirmation_id: `bk_${Math.random().toString(36).slice(2, 8)}`,
    venue_name: venue?.name ?? args.venue_id,
    time: args.time,
    party_size: args.party_size,
  };
}
