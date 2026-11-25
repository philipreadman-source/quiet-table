// Quick follow-ups under Find's results, as on iOS ("Cheaper", "Great wine"),
// picked to suit what's showing: only ones that would change the list, and
// only when the city has places to change it to. Sent as a normal message, so
// the live agent reads them as words, and the catalog fallback filters by
// them (fallback-response.ts), so they still work with no AI credits left.

import {CATALOG, catalogCity, catalogPlace, type CatalogPlace} from '@/lib/catalog';

type Nudge = {
  label: string;
  /** The fallback's opening line: "Cheaper picks at 19:30." */
  lead: string;
  matches: (place: CatalogPlace) => boolean;
};

const NUDGES = {
  cheaper: {
    label: 'Cheaper',
    lead: 'Cheaper picks',
    matches: (place: CatalogPlace) => place.price != null && place.price <= 2,
  },
  groups: {
    label: 'Good for groups',
    lead: 'Picks that suit a group',
    matches: (place: CatalogPlace) => place.kinds.includes('group'),
  },
  wine: {
    label: 'Known for wine',
    lead: 'Picks known for their wine',
    matches: (place: CatalogPlace) => /\bwines?\b/i.test(place.description ?? ''),
  },
  cocktails: {
    label: 'Great cocktails',
    lead: 'Picks with good cocktails',
    matches: (place: CatalogPlace) => /cocktail/i.test(place.description ?? ''),
  },
} satisfies Record<string, Nudge>;

const ALL_NUDGES: Nudge[] = Object.values(NUDGES);

/** The nudge a message is, when it's exactly one of the labels. */
export function nudgeForText(text: string | undefined): Nudge | null {
  const lower = text?.trim().toLowerCase();
  return ALL_NUDGES.find((nudge) => nudge.label.toLowerCase() === lower) ?? null;
}

/** "4+" or "6" → 6; unknown → 2. */
function partyCount(partySize: string | undefined): number {
  return Number.parseInt(partySize ?? '2', 10) || 2;
}

/** Two or three nudges for the places on screen; none when they aren't
 * catalog places (cities Find doesn't cover yet). */
export function nudgesFor(
  shownIds: string[],
  draft: {location?: string; partySize?: string; intent?: string},
): string[] {
  const shown = shownIds.map(catalogPlace).filter((place): place is CatalogPlace => place != null);
  if (shown.length === 0) return [];
  const city = catalogCity(draft.location) ?? shown[0].city;
  const shownSet = new Set(shown.map((place) => place.id));
  const pool = CATALOG.filter((place) => place.city === city && !shownSet.has(place.id));
  // Worth offering: there are a few more such places, and the list isn't
  // mostly them already.
  const worthIt = (nudge: Nudge) =>
    pool.filter(nudge.matches).length >= 3 && shown.filter(nudge.matches).length < shown.length / 2;

  const picks: Nudge[] = [];
  if (shown.some((place) => (place.price ?? 0) >= 3) && worthIt(NUDGES.cheaper)) picks.push(NUDGES.cheaper);
  const groupTable = partyCount(draft.partySize) >= 4 && !/group/i.test(draft.intent ?? '');
  if (groupTable && worthIt(NUDGES.groups)) picks.push(NUDGES.groups);
  if (worthIt(NUDGES.wine)) picks.push(NUDGES.wine);
  if (worthIt(NUDGES.cocktails)) picks.push(NUDGES.cocktails);
  return picks.slice(0, 3).map((nudge) => nudge.label);
}

/** The fallback's places for a nudge: those of the kind of table that fit,
 * else any in the city that do. */
export function nudgeCatalog<T extends {id: string}>(nudge: Nudge, intentCatalog: T[], cityCatalog: T[]): T[] {
  const fits = (venue: T) => {
    const place = catalogPlace(venue.id);
    return place != null && nudge.matches(place);
  };
  const inIntent = intentCatalog.filter(fits);
  return inIntent.length >= 3 ? inIntent : [...inIntent, ...cityCatalog.filter((venue) => fits(venue) && !inIntent.includes(venue))];
}
