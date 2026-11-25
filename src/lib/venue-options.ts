// Venue option cards for Find, built from the restaurant catalog
// (src/lib/catalog.ts): opening hours, diet fit and the card's lines.
import {widenZones, zoneOf} from '@/lib/zones';
import {
  CATALOG,
  catalogArea,
  catalogCity,
  placeDetailsLine,
  placesFor,
  type CatalogPlace,
  type PlaceKind,
} from '@/lib/catalog';

export const TIME_SLOTS = ['6:00pm', '6:30pm', '7:00pm', '7:30pm', '8:00pm', '8:30pm', '9:00pm', '9:30pm'];

export type SocialProofSource = 'contact' | 'instagram' | 'tripadvisor';

export type SocialProof = {
  name: string;
  /** Demo graph friend id when proof comes from close-friend picks. */
  friendId?: string;
  action: 'liked' | 'loved' | 'repeat_booker' | 'booked' | 'recommended' | 'saved';
  source: SocialProofSource;
  when?: string;
};

export type DietaryTag = 'vegetarian-friendly' | 'vegan-friendly' | 'limited-veg';

export type DietaryNeeds = 'none' | 'vegetarian' | 'vegan' | 'mixed' | 'pescatarian';

export const VENUE_PAGE_SIZE = 3;

export type VenueOptionCard = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  description?: string;
  image_url?: string;
  cta_label?: string;
  /** Exact menu URL when known — View menu opens this. */
  menu_url?: string;
  /** Optional curated overview when no exact menu URL; otherwise we synthesize one. */
  menu_overview?: string;
  google_reviews_url?: string;
  tripadvisor_url?: string;
  google_rating?: number;
  tripadvisor_rating?: number;
  review_count?: number;
  /** Live Michelin mode — must be a guide.michelin.com URL from search. */
  michelin_guide_url?: string;
  michelin_distinction?: string;
  social_proof?: SocialProof;
  dietary_tags?: DietaryTag[];
  /** When set, a day that's missing is a closed day. */
  opening_hours?: OpeningHours;
};

/** Day (0 = Sunday … 6 = Saturday, as Date#getDay) → 24h ['HH:MM', 'HH:MM']
 * ranges. A close at or before the open time runs past midnight. */
export type OpeningHours = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, [string, string][]>>;

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function minutesFromClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(value.trim());
  if (match == null) return null;
  let hours = Number(match[1]) % 24;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + Number(match[2]);
}

/** Open at that date and time? True when we don't know (no hours, no date). */
export function isVenueOpenAt(
  venue: VenueOptionCard,
  dateIso: string | undefined,
  time: string | undefined,
): boolean {
  const hours = venue.opening_hours;
  if (hours == null || dateIso == null) return true;
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return true;
  const day = date.getDay() as keyof OpeningHours;
  const ranges = hours[day] ?? [];
  const at = time != null ? minutesFromClock(time) : null;
  if (at == null) return ranges.length > 0;
  const previous = ((day + 6) % 7) as keyof OpeningHours;
  const inRange = ([open, close]: [string, string], offset: number) => {
    const start = minutesFromClock(open);
    let end = minutesFromClock(close);
    if (start == null || end == null) return true;
    if (end <= start) end += 24 * 60;
    // Inclusive: Michelin often lists seating windows ("18:30–20:00").
    return at + offset >= start && at + offset <= end;
  };
  return (
    ranges.some((range) => inRange(range, 0)) ||
    // Last night's late opening, for early-hours times.
    (hours[previous] ?? []).some((range) => inRange(range, 24 * 60))
  );
}

/** "Wed 19:00–01:00, Sun 13:00–16:00; closed Mon, Tue" — short, for the agent. */
export function formatOpeningHours(hours: OpeningHours | undefined): string | undefined {
  if (hours == null) return undefined;
  const open: string[] = [];
  const closed: string[] = [];
  for (const day of [1, 2, 3, 4, 5, 6, 0] as const) {
    const ranges = hours[day];
    if (ranges == null || ranges.length === 0) closed.push(DAY_SHORT[day]);
    else open.push(`${DAY_SHORT[day]} ${ranges.map(([a, b]) => `${a}–${b}`).join(', ')}`);
  }
  return closed.length > 0 ? `${open.join(', ')}; closed ${closed.join(', ')}` : open.join(', ');
}

/** Shown whenever menu content is agent/AI-synthesized rather than an exact menu link. */
export const AI_MENU_OVERVIEW_CAVEAT =
  'AI overview from the restaurant’s website and socials — not the live menu.';

export type MenuAction = {mode: 'exact'; url: string};

/** Card AI blurbs — description plus optional menu_overview when they differ. */
export function venueAiWriteUps(option: Pick<VenueOptionCard, 'description' | 'menu_overview'>): string[] {
  const lines: string[] = [];
  const description = option.description?.trim();
  const menuOverview = option.menu_overview?.trim();
  if (description != null && description.length > 0) lines.push(description);
  if (
    menuOverview != null &&
    menuOverview.length > 0 &&
    menuOverview !== description
  ) {
    lines.push(menuOverview);
  }
  return lines;
}

/** Opens an exact menu URL only — AI summaries live on the card, not this button. */
export function resolveMenuAction(option: VenueOptionCard): MenuAction | null {
  if (option.menu_url != null && option.menu_url.length > 0) {
    return {mode: 'exact', url: option.menu_url};
  }
  return null;
}

function socialProofLine(proof: SocialProof): string | null {
  const when = proof.when != null ? ` ${proof.when}` : '';
  switch (proof.source) {
    case 'contact':
      if (proof.action === 'repeat_booker') return `${proof.name} is a regular here`;
      if (proof.action === 'loved') return `${proof.name} loved this`;
      if (proof.action === 'liked') return `${proof.name} liked this`;
      if (proof.action === 'booked' || proof.action === 'saved') return null;
      if (proof.action === 'recommended') return `${proof.name} recommended this`;
      return null;
    case 'instagram':
      return `${proof.name} liked this on Instagram`;
    case 'tripadvisor':
      return `TripAdvisor Travellers' Choice · ${proof.name}`;
    default:
      return `${proof.name} recently liked this`;
  }
}

export function formatSocialProof(proof: SocialProof | undefined): string | null {
  if (proof == null) return null;
  return socialProofLine(proof);
}

// Every card comes from the restaurant catalog (src/lib/catalog.ts), the same
// places as the iOS app.

/** A catalog place as a Find card: "Oud-West · Modern European · €€ · Bib Gourmand". */
export function placeOptionCard(place: CatalogPlace): VenueOptionCard {
  return {
    id: place.id,
    title: place.name,
    subtitle: placeDetailsLine(place) || undefined,
    // Starred places just outside the city say how far: "Haarlem · 25 min by train".
    meta: place.near != null ? (place.travel ?? undefined) : undefined,
    description: place.description ?? undefined,
    menu_url: place.website ?? undefined,
    michelin_distinction: place.michelin ?? undefined,
    opening_hours: (place.opening_hours ?? undefined) as OpeningHours | undefined,
    dietary_tags: place.diet_tags,
  };
}

const ALL_VENUE_OPTIONS: VenueOptionCard[] = CATALOG.map(placeOptionCard);

function intentKind(intent: string): PlaceKind {
  const lower = intent.toLowerCase();
  if (lower.includes('michelin')) return 'michelin';
  if (lower.includes('date')) return 'date-night';
  if (lower.includes('group')) return 'group';
  return 'casual';
}

const STAR_WEIGHT: Record<string, number> = {
  '3 Stars': 6,
  '2 Stars': 5,
  '1 Star': 4,
  'Bib Gourmand': 2,
  Selected: 1,
};

/** How many places suit this kind of table in a city, in all and per zone,
 * for the area picker's counts. */
export function zoneCounts(intent: string, city: string): {total: number; byZone: Map<string, number>} {
  const catalog = catalogCity(city);
  const places = catalog != null ? placesFor(catalog, intentKind(intent)).filter((place) => place.city === catalog) : [];
  const byZone = new Map<string, number>();
  for (const place of places) {
    const zone = zoneOf(place);
    if (zone != null) byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
  }
  return {total: places.length, byZone};
}

/** Below this many places in the parts of town picked, their neighbours
 * follow them, as on iOS. */
const ZONE_MIN_RESULTS = 5;

/** The places that suit a kind of table in the location's city, best first:
 * the part of town they named, then (for Michelin) the stars, then how many
 * guides recommend it, then popularity. With `zones` (the area picker's
 * "Soho & Covent Garden"…), only places there, then their neighbours when
 * that's too few. */
export function getVenueOptionsForIntent(
  intent: string,
  location?: string | null,
  zones: string[] = [],
): VenueOptionCard[] {
  const kind = intentKind(intent);
  const city = catalogCity(location) ?? 'Amsterdam';
  const area = catalogArea(location)?.toLowerCase() ?? null;
  const score = (place: CatalogPlace) =>
    (area != null && place.area != null && place.area.toLowerCase().includes(area) ? 10 : 0) +
    // In a Michelin search each star outweighs the guides, as on iOS.
    (kind === 'michelin' ? (STAR_WEIGHT[place.michelin ?? ''] ?? 0) * 4 - (place.near != null ? 6 : 0) : 0) +
    Math.min(place.mentions, 4);
  const ranked = (places: CatalogPlace[]) =>
    places
      .map((place) => ({place, score: score(place)}))
      .sort((a, b) => b.score - a.score || a.place.rank - b.place.rank)
      .map(({place}) => placeOptionCard(place));
  const all = placesFor(city, kind);
  if (zones.length === 0) return ranked(all);
  const inZones = (ids: string[]) => all.filter((place) => ids.includes(zoneOf(place) ?? ''));
  const picked = ranked(inZones(zones));
  if (picked.length >= ZONE_MIN_RESULTS) return picked;
  const neighbours = ranked(inZones(widenZones(city, zones).filter((zone) => !zones.includes(zone))));
  return [...picked, ...neighbours];
}

function dietaryRankScore(tags: DietaryTag[] | undefined, needs: DietaryNeeds | undefined): number {
  if (needs == null || needs === 'none') return 0;
  const t = tags ?? [];
  if (needs === 'vegan') {
    if (t.includes('vegan-friendly')) return 2;
    if (t.includes('vegetarian-friendly')) return 0;
    if (t.includes('limited-veg')) return -2;
    return -1;
  }
  if (needs === 'vegetarian' || needs === 'mixed' || needs === 'pescatarian') {
    if (t.includes('vegan-friendly') || t.includes('vegetarian-friendly')) return 2;
    if (t.includes('limited-veg')) return -1;
    return 0;
  }
  return 0;
}

/** Rank: exact time → near (±15/30) → personal history → dietary fit.
 * Callers should filter with filterVenuesByAimedTime first. */
export function rankVenueOptions(
  options: VenueOptionCard[],
  dateIso: string | undefined,
  time: string,
  dietaryNeeds?: DietaryNeeds,
  memoryRank?: (venueId: string) => number,
): VenueOptionCard[] {
  // No real availability, but places known to be closed then are dropped.
  // Ranked on taste and diet only.
  return options.filter((venue) => isVenueOpenAt(venue, dateIso, time)).sort((a, b) => {
    if (memoryRank != null) {
      const memA = memoryRank(a.id);
      const memB = memoryRank(b.id);
      if (memA !== memB) return memB - memA;
    }
    const dietA = dietaryRankScore(a.dietary_tags, dietaryNeeds);
    const dietB = dietaryRankScore(b.dietary_tags, dietaryNeeds);
    if (dietA !== dietB) return dietB - dietA;
    return 0;
  });
}

export function paginateVenueOptions(
  ranked: VenueOptionCard[],
  page: number,
  pageSize = VENUE_PAGE_SIZE,
): {options: VenueOptionCard[]; hasMore: boolean; total: number} {
  const start = page * pageSize;
  const options = ranked.slice(start, start + pageSize);
  return {options, hasMore: start + pageSize < ranked.length, total: ranked.length};
}

// No live availability, so the title never claims a table is open or full.
export function buildVenueOptionsTitle(total: number, time: string): string {
  if (total === 0) return 'No matches for that yet';
  return `Top restaurants for ${time}`;
}

export function formatDietaryBadge(
  option: VenueOptionCard,
  needs: DietaryNeeds | undefined,
): string | null {
  if (needs == null || needs === 'none') return null;
  const tags = option.dietary_tags ?? [];
  if (needs === 'vegan') {
    if (tags.includes('vegan-friendly')) return 'Good vegan options';
    if (tags.includes('vegetarian-friendly')) return 'Vegetarian options — limited vegan menu';
    return 'Limited veg — check menu';
  }
  if (needs === 'pescatarian') {
    if (tags.includes('vegetarian-friendly')) return 'Vegetarian menu · fish/seafood OK';
    if (tags.includes('vegan-friendly')) return 'Plant-forward · check fish options';
    return 'Limited veg — confirm fish/no meat';
  }
  if (needs === 'vegetarian' || needs === 'mixed') {
    if (tags.includes('vegan-friendly') || tags.includes('vegetarian-friendly')) return 'Good vegetarian options';
    return 'Limited veg — check menu';
  }
  return null;
}

export function findVenueOption(idOrTitle: string): VenueOptionCard | undefined {
  const needle = idOrTitle.trim().toLowerCase();
  return ALL_VENUE_OPTIONS.find(
    (v) => v.id === needle || v.title.toLowerCase() === needle || v.title.toLowerCase().includes(needle),
  );
}


/** Neighbourhood token from subtitle — e.g. "De Pijp · seafood" → "De Pijp". */
export function venueNeighbourhood(option: VenueOptionCard): string | null {
  const subtitle = option.subtitle?.trim();
  if (subtitle == null || subtitle.length === 0) return null;
  const separator = subtitle.indexOf(' · ');
  return separator >= 0 ? subtitle.slice(0, separator).trim() : subtitle;
}

/** Every catalog place, once. */
export function listUniqueCatalogVenues(): VenueOptionCard[] {
  return ALL_VENUE_OPTIONS;
}

/** The most popular places (catalog rank), Amsterdam first. */
export function popularCatalogVenues(limit: number): VenueOptionCard[] {
  return [...CATALOG]
    .sort((a, b) => Number(b.city === 'Amsterdam') - Number(a.city === 'Amsterdam') || a.rank - b.rank)
    .slice(0, limit)
    .map(placeOptionCard);
}

/** Local typeahead over the catalog — instant, no agent round-trip. */
export function searchCatalogVenues(query: string, limit = 8): VenueOptionCard[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  return listUniqueCatalogVenues()
    .map((venue) => {
      const title = venue.title.toLowerCase();
      const subtitle = venue.subtitle?.toLowerCase() ?? '';
      const neighbourhood = venueNeighbourhood(venue)?.toLowerCase() ?? '';
      let score = 0;
      if (title === needle) score = 100;
      else if (title.startsWith(needle)) score = 80;
      else if (title.includes(needle)) score = 60;
      else if (neighbourhood.includes(needle) || subtitle.includes(needle)) score = 40;
      else return null;
      return {venue, score};
    })
    .filter((row): row is {venue: VenueOptionCard; score: number} => row != null)
    .sort((a, b) => b.score - a.score || a.venue.title.localeCompare(b.venue.title))
    .slice(0, limit)
    .map((row) => row.venue);
}

/** Suggest venues near the user's home area — matches neighbourhood in catalog subtitles. */
export function suggestVenuesForArea(area: string, limit = 6): VenueOptionCard[] {
  const needle = area.trim().toLowerCase();
  if (needle.length === 0 || needle === 'amsterdam') {
    return popularCatalogVenues(limit);
  }

  const venues = listUniqueCatalogVenues();
  const matched = venues.filter((venue) => {
    const neighbourhood = venueNeighbourhood(venue)?.toLowerCase() ?? '';
    const subtitle = venue.subtitle?.toLowerCase() ?? '';
    return (
      neighbourhood.includes(needle) ||
      needle.includes(neighbourhood) ||
      subtitle.includes(needle)
    );
  });

  const ranked = matched;
  if (ranked.length >= limit) return ranked.slice(0, limit);

  const seen = new Set(ranked.map((venue) => venue.id));
  for (const venue of popularCatalogVenues(limit)) {
    if (ranked.length >= limit) break;
    if (!seen.has(venue.id)) {
      ranked.push(venue);
      seen.add(venue.id);
    }
  }
  return ranked.slice(0, limit);
}

function isGoogleMapsUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('google.com/maps') ||
    lower.includes('maps.google.') ||
    lower.includes('maps.app.goo.gl') ||
    lower.includes('goo.gl/maps')
  );
}

/** Open venue in Google Maps — prefers catalog maps URL when present. */
export function resolveGoogleMapsUrl(
  option: Pick<VenueOptionCard, 'title' | 'subtitle' | 'google_reviews_url'>,
  city = 'Amsterdam',
): string {
  const direct = option.google_reviews_url?.trim();
  if (direct != null && direct.length > 0 && isGoogleMapsUrl(direct)) {
    return direct;
  }
  const parts = [option.title.trim()];
  const sub = option.subtitle?.trim();
  if (sub != null && sub.length > 0) {
    const locality = sub.split('·')[0]?.trim();
    if (locality != null && locality.length > 0) parts.push(locality);
  }
  parts.push(city);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.filter(Boolean).join(', '))}`;
}

/** Product is text-first — no venue hero photos in UI (avoids broken URLs and AI filler). */
function stripVenueHeroImage(option: VenueOptionCard): VenueOptionCard {
  if (option.image_url == null) return option;
  const {image_url: _removed, ...rest} = option;
  return rest;
}

/** Merge sparse agent/fallback payloads with the local mock catalog. */
export function enrichVenueOption(option: VenueOptionCard): VenueOptionCard {
  if (option.michelin_guide_url != null) {
    return stripVenueHeroImage(withMockSocialProof(option));
  }
  const known = findVenueOption(option.id) ?? findVenueOption(option.title);
  if (known == null) return stripVenueHeroImage(withMockSocialProof(option));
  const exactCatalogMatch = known.id === option.id;
  return stripVenueHeroImage(
    withMockSocialProof({
      ...known,
      ...option,
      menu_url: option.menu_url ?? (exactCatalogMatch ? known.menu_url : undefined),
      menu_overview: option.menu_overview ?? (exactCatalogMatch ? known.menu_overview : undefined),
      social_proof: option.social_proof ?? known.social_proof,
    }),
  );
}

function withMockSocialProof(option: VenueOptionCard): VenueOptionCard {
  if (option.social_proof != null) return option;
  return option;
}

export function formatMichelinLine(option: VenueOptionCard): string | null {
  if (option.michelin_guide_url == null) return null;
  const distinction = option.michelin_distinction?.trim();
  return distinction != null && distinction.length > 0
    ? `Michelin Guide · ${distinction}`
    : 'Listed on Michelin Guide';
}

export function formatRatingsLine(option: VenueOptionCard): string | null {
  const parts: string[] = [];
  if (option.google_rating != null) parts.push(`Google ★ ${option.google_rating.toFixed(1)}`);
  if (option.tripadvisor_rating != null) parts.push(`TripAdvisor ★ ${option.tripadvisor_rating.toFixed(1)}`);
  if (parts.length === 0) return null;
  if (option.review_count != null) parts.push(`${option.review_count.toLocaleString()} reviews`);
  return parts.join(' · ');
}

export function catalogAgentContextLine(): string {
  const count = listUniqueCatalogVenues().length;
  return (
    `Quiet Table's curated catalog: ${count} places in Amsterdam and London, plus starred places within an hour of Amsterdam. ` +
    'This is vetted product data — call search_quiet_table_catalog whenever you show Amsterdam options, and mix results with web_search (menus, verification, spots not in catalog). ' +
    'Use exact catalog id + title in render_ui.options so the UI enriches cards.'
  );
}

export function summarizeVenueForAgentCatalog(venue: VenueOptionCard) {
  const enriched = enrichVenueOption(venue);
  const proof = enriched.social_proof;
  return {
    id: enriched.id,
    title: enriched.title,
    subtitle: enriched.subtitle,
    meta: enriched.meta,
    description:
      enriched.description != null && enriched.description.length > 220
        ? `${enriched.description.slice(0, 217)}…`
        : enriched.description,
    dietary_tags: enriched.dietary_tags,
    hours: formatOpeningHours(enriched.opening_hours),
    friend_social:
      proof?.source === 'contact'
        ? {name: proof.name, action: proof.action, when: proof.when}
        : undefined,
    menu_url: enriched.menu_url,
  };
}

/** Agent + search_tables tool — same pool as local fallback mode. */
export function searchCatalogForAgent(args: {
  vibe?: string;
  near?: string;
  query?: string;
  limit?: number;
}): ReturnType<typeof summarizeVenueForAgentCatalog>[] {
  const limit = Math.min(Math.max(args.limit ?? 12, 1), 24);
  let pool: VenueOptionCard[];

  if (args.query != null && args.query.trim().length >= 2) {
    pool = searchCatalogVenues(args.query.trim(), limit);
  } else if (args.vibe != null && args.vibe.trim().length > 0) {
    pool = getVenueOptionsForIntent(args.vibe.trim());
  } else {
    pool = listUniqueCatalogVenues();
  }

  if (args.near != null && args.near.trim().length > 0) {
    const areaNeedle = args.near.trim().toLowerCase();
    const areaPool = suggestVenuesForArea(args.near.trim(), limit * 3);
    const areaIds = new Set(areaPool.map((venue) => venue.id));
    const inArea = pool.filter((venue) => areaIds.has(venue.id));
    const subtitleMatch = pool.filter((venue) => {
      const subtitle = venue.subtitle?.toLowerCase() ?? '';
      const neighbourhood = venueNeighbourhood(venue)?.toLowerCase() ?? '';
      return subtitle.includes(areaNeedle) || neighbourhood.includes(areaNeedle);
    });
    const merged = [...inArea, ...subtitleMatch];
    const byId = new Map<string, VenueOptionCard>();
    for (const venue of merged) byId.set(venue.id, venue);
    if (byId.size > 0) pool = [...byId.values()];
  }

  return pool.slice(0, limit).map(summarizeVenueForAgentCatalog);
}
