// Rich venue option cards for the booking flow — mock social proof, ratings,
// and outbound links until real menu/review APIs are wired up.

export const TIME_SLOTS = ['6:00pm', '6:30pm', '7:00pm', '7:30pm', '8:00pm', '8:30pm', '9:00pm', '9:30pm'];

// Deterministic pseudo-random fake data — same seed always gives the same
// result, so a demo run is reproducible instead of flickering between
// reloads. Not cryptographic, just a cheap string hash.
export function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

export function isDateAvailable(date: Date): boolean {
  return seededRandom(date.toISOString().slice(0, 10)) > 0.25;
}

/** Coarse date-level fake — unused on the time step (all slots are choosable).
 * Kept for any legacy demos that still want evening-level scarcity. */
export function timeSlotAvailability(dateIso: string): Record<string, boolean> {
  const availability = Object.fromEntries(
    TIME_SLOTS.map((slot) => [slot, seededRandom(`${dateIso}-${slot}`) > 0.3]),
  );
  if (!Object.values(availability).some(Boolean)) {
    availability[TIME_SLOTS[0]] = true;
  }
  return availability;
}

/** Fine-grained fake — whether *this specific venue* has a table at the
 * chosen date/time. Availability is only meaningful once a venue is known;
 * the time step never greys out slots based on this. */
export function isVenueAvailableAt(venueId: string, dateIso: string, time: string): boolean {
  return seededRandom(`${venueId}-${dateIso}-${time}`) > 0.35;
}

/** Soft offset availability (e.g. +15 min) — not on the chip grid, but offerable. */
export function isVenueAvailableAtOffset(
  venueId: string,
  dateIso: string,
  aimedTime: string,
  offsetMinutes: number,
): boolean {
  if (offsetMinutes === 0) return isVenueAvailableAt(venueId, dateIso, aimedTime);
  return seededRandom(`${venueId}-${dateIso}-${aimedTime}-offset-${offsetMinutes}`) > 0.4;
}

const TIME_LABEL_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;

export function parseTimeLabelToMinutes(time: string): number | null {
  const match = time.trim().match(TIME_LABEL_RE);
  if (match == null) return null;
  let hours = Number(match[1]);
  const minutes = match[2] != null ? Number(match[2]) : 0;
  const period = match[3].toLowerCase();
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatMinutesAsTimeLabel(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return minutes === 0 ? `${hours}:00${period}` : `${hours}:${String(minutes).padStart(2, '0')}${period}`;
}

export function offsetTimeLabel(time: string, deltaMinutes: number): string | null {
  const base = parseTimeLabelToMinutes(time);
  if (base == null) return null;
  return formatMinutesAsTimeLabel(base + deltaMinutes);
}

/** Slot grid step — used when stretching to ±30 min. */
export const TIME_TOLERANCE_SLOTS = 1;

/** Sparse result threshold — below this, stretch to ±15–30 min. */
export const SPARSE_RESULT_THRESHOLD = 3;

/** Plentiful result threshold — at/above this, mix in a couple of near (+15) offers. */
export const PLENTIFUL_RESULT_THRESHOLD = 4;

/** Times within ±tolerance slots of the user's aim (30-min grid). */
export function timesWithinTolerance(
  requestedTime: string,
  toleranceSlots = TIME_TOLERANCE_SLOTS,
): string[] {
  const index = TIME_SLOTS.indexOf(requestedTime);
  if (index < 0) return [requestedTime];
  return TIME_SLOTS.filter((_, i) => Math.abs(i - index) <= toleranceSlots);
}

export type OfferedAvailability = {
  offeredTime: string;
  aimedTime: string;
  kind: 'exact' | 'near-15' | 'near-30';
};

/**
 * Best bookable offer for a venue around the aimed time.
 * Prefers exact, then ±15, then ±30 (later preferred on ties).
 */
export function bestAvailableTimeForVenue(
  venueId: string,
  dateIso: string,
  requestedTime: string,
): string | null {
  return resolveOfferedAvailability(venueId, dateIso, requestedTime)?.offeredTime ?? null;
}

export function resolveOfferedAvailability(
  venueId: string,
  dateIso: string,
  aimedTime: string,
  options?: {preferNear15?: boolean},
): OfferedAvailability | null {
  const exact = isVenueAvailableAt(venueId, dateIso, aimedTime);
  const plus15 = offsetTimeLabel(aimedTime, 15);
  const minus15 = offsetTimeLabel(aimedTime, -15);
  const plus30 = offsetTimeLabel(aimedTime, 30);
  const minus30 = offsetTimeLabel(aimedTime, -30);

  const hasPlus15 = plus15 != null && isVenueAvailableAtOffset(venueId, dateIso, aimedTime, 15);
  const hasMinus15 = minus15 != null && isVenueAvailableAtOffset(venueId, dateIso, aimedTime, -15);
  const hasPlus30 =
    plus30 != null &&
    (isVenueAvailableAt(venueId, dateIso, plus30) ||
      isVenueAvailableAtOffset(venueId, dateIso, aimedTime, 30));
  const hasMinus30 =
    minus30 != null &&
    (isVenueAvailableAt(venueId, dateIso, minus30) ||
      isVenueAvailableAtOffset(venueId, dateIso, aimedTime, -30));

  // Plentiful mix: a great find is worth waiting ~15 min — offer +15 when we can.
  if (options?.preferNear15 === true && exact && hasPlus15 && plus15 != null) {
    return {offeredTime: plus15, aimedTime, kind: 'near-15'};
  }

  if (exact) return {offeredTime: aimedTime, aimedTime, kind: 'exact'};
  if (hasPlus15 && plus15 != null) return {offeredTime: plus15, aimedTime, kind: 'near-15'};
  if (hasMinus15 && minus15 != null) return {offeredTime: minus15, aimedTime, kind: 'near-15'};
  if (hasPlus30 && plus30 != null) return {offeredTime: plus30, aimedTime, kind: 'near-30'};
  if (hasMinus30 && minus30 != null) return {offeredTime: minus30, aimedTime, kind: 'near-30'};
  return null;
}

/** Only venues with a table at the aimed time or within ±15–30 min. */
export function filterVenuesByAimedTime<T extends {id: string}>(
  options: T[],
  dateIso: string | undefined,
  time: string,
): T[] {
  if (dateIso == null) return options;
  return options.filter((option) => resolveOfferedAvailability(option.id, dateIso, time) != null);
}

/**
 * Assign offered times for a result set:
 * - Prefer exact matches.
 * - If fewer than 3 exact → stretch with ±15 / ±30 (already in resolve).
 * - If 4+ exact → mark ~2 as +15 near offers (worth waiting for a strong find).
 */
export function assignOfferedAvailabilityForResults<T extends {id: string}>(
  options: T[],
  dateIso: string,
  aimedTime: string,
): Map<string, OfferedAvailability> {
  const exactIds = options
    .filter((option) => isVenueAvailableAt(option.id, dateIso, aimedTime))
    .map((option) => option.id);

  const nearMixIds = new Set<string>();
  const isSparse = exactIds.length < SPARSE_RESULT_THRESHOLD;
  const isPlentiful = exactIds.length >= PLENTIFUL_RESULT_THRESHOLD;
  // Sparse: nearMix stays empty — resolve already stretches ±15/±30 to fill the list.
  // Plentiful: mark ~2 as +15 offers (worth waiting for a strong find).
  if (isPlentiful && !isSparse) {
    const candidates = [...exactIds]
      .filter((id) => isVenueAvailableAtOffset(id, dateIso, aimedTime, 15))
      .sort(
        (a, b) =>
          seededRandom(`near-mix-${a}-${dateIso}-${aimedTime}`) -
          seededRandom(`near-mix-${b}-${dateIso}-${aimedTime}`),
      );
    for (const id of candidates.slice(0, 2)) nearMixIds.add(id);
  }

  const map = new Map<string, OfferedAvailability>();
  for (const option of options) {
    const offered = resolveOfferedAvailability(option.id, dateIso, aimedTime, {
      preferNear15: nearMixIds.has(option.id),
    });
    if (offered != null) map.set(option.id, offered);
  }
  return map;
}

export function formatOfferedAvailabilityLine(offered: OfferedAvailability): string {
  return `Available at ${offered.offeredTime}`;
}

export function formatVenueAvailabilityLine(
  venueId: string,
  dateIso: string,
  requestedTime: string,
  offeredById?: Map<string, OfferedAvailability>,
): string | null {
  const offered =
    offeredById?.get(venueId) ?? resolveOfferedAvailability(venueId, dateIso, requestedTime);
  if (offered == null) return null;
  return formatOfferedAvailabilityLine(offered);
}

/** @deprecated Prefer bestAvailableTimeForVenue — kept for detail edge cases. */
export function nextAvailableTimeForVenue(venueId: string, dateIso: string, time: string): string | null {
  return bestAvailableTimeForVenue(venueId, dateIso, time);
}

/** When every venue in a result set is full at the requested time, find the
 * times nearest to it (by distance, later breaking ties before earlier)
 * where at least one of them does have a table — the "try 8:00pm or
 * 6:30pm" suggestion instead of a dead "0 restaurants" list. */
export function nearestAvailableTimesAcrossVenues(
  venueIds: string[],
  dateIso: string,
  time: string,
  limit = 2,
): string[] {
  const requestedIndex = TIME_SLOTS.indexOf(time);
  if (requestedIndex < 0) return [];
  const candidates = TIME_SLOTS.map((slot, index) => ({slot, index}))
    .filter(({slot}) => slot !== time)
    .sort((a, b) => {
      const distanceDiff = Math.abs(a.index - requestedIndex) - Math.abs(b.index - requestedIndex);
      if (distanceDiff !== 0) return distanceDiff;
      return b.index - a.index; // ties: prefer the later slot
    });

  const found: string[] = [];
  for (const {slot} of candidates) {
    if (venueIds.some((venueId) => isVenueAvailableAt(venueId, dateIso, slot))) {
      found.push(slot);
      if (found.length >= limit) break;
    }
  }
  return found;
}

export type SocialProofSource = 'contact' | 'instagram' | 'tripadvisor';

export type SocialProof = {
  name: string;
  action: 'liked' | 'booked' | 'recommended' | 'saved';
  source: SocialProofSource;
  when?: string;
};

export type DietaryTag = 'vegetarian-friendly' | 'vegan-friendly' | 'limited-veg';

export type DietaryNeeds = 'none' | 'vegetarian' | 'vegan' | 'mixed';

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
};

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

function socialProofLine(proof: SocialProof): string {
  const when = proof.when != null ? ` ${proof.when}` : '';
  switch (proof.source) {
    case 'contact':
      if (proof.action === 'liked') return `${proof.name} recently liked this`;
      if (proof.action === 'booked') return `${proof.name} booked here${when}`;
      if (proof.action === 'recommended') return `${proof.name} recommended this`;
      return `${proof.name} saved this`;
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

const CASUAL_OPTIONS: VenueOptionCard[] = [
  {
    id: 'bar-fisk',
    title: 'Bar Fisk',
    subtitle: 'De Pijp · Israeli-style seafood',
    description: 'Laid-back, buzzy, unfussy — grilled fish and mezze in a fun room.',
    image_url: '/venues/bar-fisk.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://barfisk.nl/menu',
    google_rating: 4.5,
    tripadvisor_rating: 4.5,
    review_count: 1240,
    dietary_tags: ['limited-veg'],
    social_proof: {name: 'John', action: 'liked', source: 'contact'},
  },
  {
    id: 'cafe-de-klos',
    title: 'Café de Klos',
    subtitle: 'Canal Belt · ribs and grill',
    description: 'Cozy, no-frills Amsterdam classic known for its ribs.',
    image_url: '/venues/cafe-de-klos.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://cafedeklos.nl/menu',
    google_rating: 4.4,
    tripadvisor_rating: 4.3,
    review_count: 8900,
    dietary_tags: ['limited-veg'],
    social_proof: {name: 'Emma', action: 'booked', source: 'contact', when: 'last month'},
  },
  {
    id: 'genki',
    title: 'Genki',
    subtitle: 'De Pijp · ramen and small plates',
    description: 'Quick, fun, and reliably good — ramen, gyoza, and a few veg bowls.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.3,
    tripadvisor_rating: 4.2,
    review_count: 980,
    dietary_tags: ['vegetarian-friendly'],
    social_proof: {name: 'Alex', action: 'liked', source: 'contact'},
  },
  {
    id: 'sla-amsterdam',
    title: 'SLA',
    subtitle: 'Nine Streets · salads and bowls',
    description: 'Bright, healthy, easy — big salads, warm bowls, and a strong vegan line.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    google_rating: 4.4,
    tripadvisor_rating: 4.3,
    review_count: 2100,
    dietary_tags: ['vegan-friendly', 'vegetarian-friendly'],
    social_proof: {name: 'Nina', action: 'saved', source: 'instagram'},
  },
  {
    id: 'lapaz',
    title: 'La Paz',
    subtitle: 'West · tapas and sharing plates',
    description: 'Lively room, shareable plates, good for a casual catch-up.',
    image_url: '/venues/cecconis.jpg',
    cta_label: 'Book your table',
    google_rating: 4.2,
    tripadvisor_rating: 4.1,
    review_count: 760,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'bakers-roasting',
    title: "Bakers & Roasters",
    subtitle: 'De Pijp · brunch and all-day',
    description: 'Kiwi-style café with a serious brunch menu and plenty of veg options.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    google_rating: 4.5,
    tripadvisor_rating: 4.4,
    review_count: 3400,
    dietary_tags: ['vegan-friendly', 'vegetarian-friendly'],
    social_proof: {name: 'Chris', action: 'recommended', source: 'contact'},
  },
  {
    id: 'piket',
    title: 'Piket',
    subtitle: 'Jordaan · modern Dutch',
    description: 'Seasonal Dutch cooking in a relaxed room — veg mains hold their own.',
    image_url: '/venues/rijks.jpg',
    cta_label: 'Book your table',
    google_rating: 4.6,
    tripadvisor_rating: 4.5,
    review_count: 620,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'hannekes-boom',
    title: "Hanneke's Boom",
    subtitle: 'Oosterdok · waterside hangout',
    description: 'Casual terrace on the water — burgers, bitterballen, and a few veg bites.',
    image_url: '/venues/bar-fisk.jpg',
    cta_label: 'Book your table',
    google_rating: 4.1,
    tripadvisor_rating: 4.0,
    review_count: 4500,
    dietary_tags: ['limited-veg'],
    social_proof: {name: 'Tom', action: 'booked', source: 'contact', when: 'last week'},
  },
  {
    id: 'kimchi-premium',
    title: 'Kimchi Premium',
    subtitle: 'De Pijp · Korean BBQ',
    description: 'Table grills, shared banchan, built for groups — loud in the best way.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.5,
    tripadvisor_rating: 4.4,
    review_count: 1100,
    dietary_tags: ['limited-veg'],
  },
];

const DATE_NIGHT_OPTIONS: VenueOptionCard[] = [
  {
    id: 'de-kas',
    title: 'De Kas',
    subtitle: 'Park Frankendael · greenhouse dining',
    description: 'Warm, occasion-worthy, and intimate without feeling stiff.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://restaurantdekas.com/menu',
    google_rating: 4.6,
    tripadvisor_rating: 4.5,
    review_count: 2100,
    dietary_tags: ['vegetarian-friendly'],
    social_proof: {name: 'Sophie', action: 'recommended', source: 'contact'},
  },
  {
    id: 'taiko',
    title: 'Taiko',
    subtitle: 'Rembrandtplein · Asian fusion',
    description: 'Dim room, sharing plates with Japanese and Southeast Asian lean — date-night without white tablecloths.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.4,
    tripadvisor_rating: 4.3,
    review_count: 980,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'bar-fisk-date',
    title: 'Bar Fisk',
    subtitle: 'De Pijp · lively and relaxed',
    description: 'Easygoing but still special enough for a date night.',
    image_url: '/venues/bar-fisk.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://barfisk.nl/menu',
    google_rating: 4.5,
    tripadvisor_rating: 4.5,
    review_count: 1240,
    dietary_tags: ['limited-veg'],
    social_proof: {name: 'John', action: 'liked', source: 'contact'},
  },
  {
    id: 'restaurant-cedric',
    title: 'Restaurant Cédric',
    subtitle: 'Amstel · French bistro',
    description: 'Candlelight, white tablecloths, and a menu that still feels relaxed.',
    image_url: '/venues/rijks.jpg',
    cta_label: 'Book your table',
    google_rating: 4.7,
    tripadvisor_rating: 4.6,
    review_count: 890,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'bolenius',
    title: 'Bolenius',
    subtitle: 'Zuidas · plant-forward fine dining',
    description: 'Greenhouse produce, elegant plates — a date-night pick for veg-forward eaters.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    google_rating: 4.8,
    tripadvisor_rating: 4.7,
    review_count: 540,
    dietary_tags: ['vegan-friendly', 'vegetarian-friendly'],
    social_proof: {name: 'Anna', action: 'saved', source: 'instagram'},
  },
  {
    id: 'gruppo-di-amici',
    title: 'Gruppo di Amici',
    subtitle: 'Jordaan · Italian',
    description: 'Neighbourhood Italian with a warm room and a solid pasta list.',
    image_url: '/venues/cecconis.jpg',
    cta_label: 'Book your table',
    google_rating: 4.4,
    tripadvisor_rating: 4.3,
    review_count: 1100,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'fitchers',
    title: "Fitcher's",
    subtitle: 'Canal Belt · wine bar',
    description: 'Small plates, natural wine, and a buzzy but intimate back room.',
    image_url: '/venues/graphite.jpg',
    cta_label: 'Book your table',
    google_rating: 4.5,
    tripadvisor_rating: 4.4,
    review_count: 430,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'neni-amsterdam',
    title: 'NENI Amsterdam',
    subtitle: 'Oost · sharing plates',
    description: 'Middle Eastern sharing menu — colourful, fun, and easy for two.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.3,
    tripadvisor_rating: 4.2,
    review_count: 2800,
    dietary_tags: ['vegetarian-friendly', 'vegan-friendly'],
    social_proof: {name: 'Lisa', action: 'booked', source: 'contact', when: 'for an anniversary'},
  },
  {
    id: 'restaurant-212',
    title: 'Restaurant 212',
    subtitle: 'Center · chef\'s counter',
    description: 'Counter seating, tasting-menu energy — special without being stiff.',
    image_url: '/venues/graphite.jpg',
    cta_label: 'Book your table',
    google_rating: 4.7,
    tripadvisor_rating: 4.6,
    review_count: 380,
    dietary_tags: ['limited-veg'],
  },
];

const MICHELIN_OPTIONS: VenueOptionCard[] = [
  {
    id: 'rijks',
    title: 'RIJKS',
    subtitle: 'Museum Quarter · refined Dutch',
    description: 'Polished, memorable, and firmly in occasion territory.',
    image_url: '/venues/rijks.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://www.rijksrestaurant.nl/menu',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/rijks',
    michelin_distinction: '1 Star',
    google_rating: 4.7,
    tripadvisor_rating: 4.6,
    review_count: 3200,
    dietary_tags: ['vegetarian-friendly'],
    social_proof: {name: 'Marco', action: 'booked', source: 'contact', when: 'in March'},
  },
  {
    id: 'graphite',
    title: 'Graphite',
    subtitle: 'Center · hidden tasting-menu room',
    description: 'A discreet fine-dining pick with a little theatre.',
    image_url: '/venues/graphite.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://graphite.amsterdam/menu',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/graphite',
    michelin_distinction: 'Selected',
    google_rating: 4.8,
    tripadvisor_rating: 4.7,
    review_count: 410,
    dietary_tags: ['limited-veg'],
    social_proof: {name: 'Anna', action: 'saved', source: 'instagram'},
  },
  {
    id: 'restaurant-gem',
    title: 'Restaurant GEM',
    subtitle: 'Oud-West · modern European',
    description: 'Two-Michelin-star room with a calm, precise tasting menu.',
    image_url: '/venues/rijks.jpg',
    cta_label: 'Book your table',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/restaurant-gem',
    michelin_distinction: '2 Stars',
    google_rating: 4.9,
    tripadvisor_rating: 4.8,
    review_count: 290,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'restaurant-brut172',
    title: 'Brut172',
    subtitle: 'Noord · wine-forward',
    description: 'Small, chef-driven, and deeply wine-focused — a hidden gem.',
    image_url: '/venues/graphite.jpg',
    cta_label: 'Book your table',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/brut172',
    michelin_distinction: '1 Star',
    google_rating: 4.7,
    tripadvisor_rating: 4.6,
    review_count: 180,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'restaurant-plantage',
    title: 'Restaurant Plantage',
    subtitle: 'Plantage · seasonal',
    description: 'Greenhouse-adjacent dining with a strong vegetable programme.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/restaurant-plantage',
    michelin_distinction: 'Bib Gourmand',
    google_rating: 4.6,
    tripadvisor_rating: 4.5,
    review_count: 720,
    dietary_tags: ['vegan-friendly', 'vegetarian-friendly'],
  },
  {
    id: 'restaurant-wils',
    title: 'Wils',
    subtitle: 'Center · contemporary',
    description: 'Open kitchen, Nordic-leaning plates, and a lively but refined room.',
    image_url: '/venues/rijks.jpg',
    cta_label: 'Book your table',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/wils',
    michelin_distinction: '1 Star',
    google_rating: 4.7,
    tripadvisor_rating: 4.6,
    review_count: 510,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'restaurant-spectrum',
    title: 'Spectrum',
    subtitle: 'Center · tasting menu',
    description: 'Two stars, theatrical service, and a menu that rewards attention.',
    image_url: '/venues/graphite.jpg',
    cta_label: 'Book your table',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/spectrum',
    michelin_distinction: '2 Stars',
    google_rating: 4.8,
    tripadvisor_rating: 4.7,
    review_count: 340,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'restaurant-sinne',
    title: 'Sinne',
    subtitle: 'Oud-West · neighbourhood star',
    description: 'Relaxed Michelin energy — seasonal, local, and unpretentious.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    michelin_guide_url: 'https://guide.michelin.com/en/noord-holland/amsterdam/restaurant/sinne',
    michelin_distinction: '1 Star',
    google_rating: 4.6,
    tripadvisor_rating: 4.5,
    review_count: 650,
    dietary_tags: ['vegetarian-friendly'],
    social_proof: {name: 'Sophie', action: 'recommended', source: 'contact'},
  },
];

const GROUP_OPTIONS: VenueOptionCard[] = [
  {
    id: 'kimchi-premium',
    title: 'Kimchi Premium',
    subtitle: 'De Pijp · Korean BBQ',
    description: 'Table grills, shared banchan, built for groups — loud in the best way.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.5,
    tripadvisor_rating: 4.4,
    review_count: 1100,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'cecconis',
    title: "Cecconi's Amsterdam",
    subtitle: 'Canal Belt · long tables, Italian-American',
    description: 'Buzzy but manageable for six-plus — big booths, shareable pasta, easy for a crowd.',
    image_url: '/venues/cecconis.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://www.cecconisamsterdam.com/menu',
    google_rating: 4.3,
    tripadvisor_rating: 4.2,
    review_count: 1800,
    dietary_tags: ['vegetarian-friendly'],
    social_proof: {name: 'Tom', action: 'booked', source: 'contact', when: 'for a team dinner'},
  },
  {
    id: 'momo',
    title: 'MOMO Restaurant',
    subtitle: 'Center · Pan-Asian, large tables',
    description: 'Spacious dining room that actually seats bigger parties without feeling chaotic.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    menu_url: 'https://www.momo.nl/menu',
    google_rating: 4.4,
    tripadvisor_rating: 4.3,
    review_count: 2400,
    dietary_tags: ['vegetarian-friendly'],
    social_proof: {name: 'Lisa', action: 'recommended', source: 'contact'},
  },
  {
    id: 'the-pancake-bakery',
    title: 'The Pancake Bakery',
    subtitle: 'Canal Belt · Dutch pancakes',
    description: 'Huge tables, savoury and sweet pancakes — easy with kids or a big group.',
    image_url: '/venues/cecconis.jpg',
    cta_label: 'Book your table',
    google_rating: 4.2,
    tripadvisor_rating: 4.1,
    review_count: 5200,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'restaurant-rouge',
    title: 'Rouge',
    subtitle: 'Rembrandtplein · brasserie',
    description: 'Classic brasserie scale — long banquets and a broad, crowd-pleasing menu.',
    image_url: '/venues/cecconis.jpg',
    cta_label: 'Book your table',
    google_rating: 4.1,
    tripadvisor_rating: 4.0,
    review_count: 1900,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'restaurant-llama',
    title: 'Llama',
    subtitle: 'Red Light · South American',
    description: 'Sharing plates, loud fun energy, and tables that actually fit eight.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.3,
    tripadvisor_rating: 4.2,
    review_count: 870,
    dietary_tags: ['vegetarian-friendly', 'vegan-friendly'],
  },
  {
    id: 'restaurant-meatless',
    title: 'Meatless District',
    subtitle: 'West · plant-based',
    description: 'Fully vegan menu, big communal tables — no one stuck ordering sides only.',
    image_url: '/venues/de-kas.jpg',
    cta_label: 'Book your table',
    google_rating: 4.5,
    tripadvisor_rating: 4.4,
    review_count: 1100,
    dietary_tags: ['vegan-friendly', 'vegetarian-friendly'],
    social_proof: {name: 'Nina', action: 'booked', source: 'contact', when: 'with a group'},
  },
  {
    id: 'restaurant-canvas',
    title: 'Canvas',
    subtitle: 'Oost · flexible dining',
    description: 'Event-friendly room with modular seating and a shareable menu.',
    image_url: '/venues/momo.jpg',
    cta_label: 'Book your table',
    google_rating: 4.2,
    tripadvisor_rating: 4.1,
    review_count: 640,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'restaurant-ctaste',
    title: 'CTaste',
    subtitle: 'Center · experience dining',
    description: 'Dining in the dark — memorable for a group, book well ahead.',
    image_url: '/venues/graphite.jpg',
    cta_label: 'Book your table',
    google_rating: 4.4,
    tripadvisor_rating: 4.3,
    review_count: 920,
    dietary_tags: ['limited-veg'],
  },
];

const ALL_VENUE_OPTIONS: VenueOptionCard[] = [
  ...CASUAL_OPTIONS,
  ...DATE_NIGHT_OPTIONS,
  ...MICHELIN_OPTIONS,
  ...GROUP_OPTIONS,
];

export function getVenueOptionsForIntent(intent: string): VenueOptionCard[] {
  const lower = intent.toLowerCase();
  if (lower.includes('date')) return DATE_NIGHT_OPTIONS;
  if (lower.includes('michelin')) return MICHELIN_OPTIONS;
  if (lower.includes('group')) return GROUP_OPTIONS;
  return CASUAL_OPTIONS;
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
  if (needs === 'vegetarian' || needs === 'mixed') {
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
  return [...options].sort((a, b) => {
    if (dateIso != null) {
      const offeredA = resolveOfferedAvailability(a.id, dateIso, time);
      const offeredB = resolveOfferedAvailability(b.id, dateIso, time);
      const rankKind = (kind: OfferedAvailability['kind'] | undefined) =>
        kind === 'exact' ? 2 : kind === 'near-15' ? 1 : kind === 'near-30' ? 0 : -1;
      const kindDiff = rankKind(offeredB?.kind) - rankKind(offeredA?.kind);
      if (kindDiff !== 0) return kindDiff;
    }
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

export function buildVenueOptionsTitle(
  total: number,
  time: string,
  dateIso: string | undefined,
  ranked: VenueOptionCard[],
): string {
  if (dateIso == null) return `${total} restaurant${total === 1 ? '' : 's'} at ${time}`;
  if (total === 0) {
    const nearestTimes = nearestAvailableTimesAcrossVenues(
      ranked.map((option) => option.id),
      dateIso,
      time,
    );
    return nearestTimes.length > 0
      ? `No tables around ${time} — try ${nearestTimes.join(' or ')}`
      : `No tables around ${time}`;
  }
  const exactCount = ranked.filter((option) => isVenueAvailableAt(option.id, dateIso, time)).length;
  if (exactCount === total) {
    return `${total} restaurant${total === 1 ? '' : 's'} at ${time}`;
  }
  return `${total} restaurant${total === 1 ? '' : 's'} around ${time}`;
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
  if (needs === 'vegetarian' || needs === 'mixed') {
    if (tags.includes('vegan-friendly') || tags.includes('vegetarian-friendly')) return 'Good vegetarian options';
    return 'Limited veg — check menu';
  }
  return null;
}

import {mockSocialProofForVenue} from '@/lib/social-proof-mock';
import {friendSocialProofForVenue} from '@/lib/friend-graph-mock';

export function findVenueOption(idOrTitle: string): VenueOptionCard | undefined {
  const needle = idOrTitle.trim().toLowerCase();
  return ALL_VENUE_OPTIONS.find(
    (v) => v.id === needle || v.title.toLowerCase() === needle || v.title.toLowerCase().includes(needle),
  );
}

function normalizeVenueTitle(title: string): string {
  return title.trim().toLowerCase();
}

function preferCanonicalVenueId(id: string): boolean {
  return !id.includes('-date') && !id.includes('-group') && !id.includes('-michelin');
}

/** Neighbourhood token from subtitle — e.g. "De Pijp · seafood" → "De Pijp". */
export function venueNeighbourhood(option: VenueOptionCard): string | null {
  const subtitle = option.subtitle?.trim();
  if (subtitle == null || subtitle.length === 0) return null;
  const separator = subtitle.indexOf(' · ');
  return separator >= 0 ? subtitle.slice(0, separator).trim() : subtitle;
}

/** One card per restaurant title — drops intent-specific duplicates (e.g. bar-fisk-date). */
export function listUniqueCatalogVenues(): VenueOptionCard[] {
  const byTitle = new Map<string, VenueOptionCard>();
  for (const option of ALL_VENUE_OPTIONS) {
    const key = normalizeVenueTitle(option.title);
    const existing = byTitle.get(key);
    if (existing == null) {
      byTitle.set(key, option);
      continue;
    }
    if (preferCanonicalVenueId(option.id) && !preferCanonicalVenueId(existing.id)) {
      byTitle.set(key, option);
    }
  }
  return [...byTitle.values()];
}

const ONBOARDING_POPULAR_VENUE_IDS = new Set([
  'bar-fisk',
  'de-kas',
  'cafe-de-klos',
  'rijks',
  'cecconis',
  'momo',
  'graphite',
  'sla-amsterdam',
]);

function popularCatalogVenues(limit: number): VenueOptionCard[] {
  return [...listUniqueCatalogVenues()]
    .sort((a, b) => {
      const boostA = ONBOARDING_POPULAR_VENUE_IDS.has(a.id) ? 1 : 0;
      const boostB = ONBOARDING_POPULAR_VENUE_IDS.has(b.id) ? 1 : 0;
      if (boostB !== boostA) return boostB - boostA;
      return (b.google_rating ?? 0) - (a.google_rating ?? 0);
    })
    .slice(0, limit);
}

/** Local typeahead over the mock catalog — instant, no agent round-trip. */
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

  const ranked = matched.sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0));
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

/** Merge sparse agent/fallback payloads with the local mock catalog. */
export function enrichVenueOption(option: VenueOptionCard): VenueOptionCard {
  if (option.michelin_guide_url != null) {
    return withMockSocialProof(option);
  }
  const known = findVenueOption(option.id) ?? findVenueOption(option.title);
  if (known == null) return withMockSocialProof(option);
  const exactCatalogMatch = known.id === option.id;
  return withMockSocialProof({
    ...known,
    ...option,
    menu_url: option.menu_url ?? (exactCatalogMatch ? known.menu_url : undefined),
    menu_overview: option.menu_overview ?? (exactCatalogMatch ? known.menu_overview : undefined),
    social_proof: option.social_proof ?? known.social_proof,
  });
}

function withMockSocialProof(option: VenueOptionCard): VenueOptionCard {
  if (option.social_proof != null) return option;
  const friendProof = friendSocialProofForVenue(option.id);
  if (friendProof != null) return {...option, social_proof: friendProof};
  const mocked = mockSocialProofForVenue(option.id);
  return mocked != null ? {...option, social_proof: mocked} : option;
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
