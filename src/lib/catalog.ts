// The restaurant catalog, the same one the iOS app uses (src/data/catalog.json,
// copied by scripts/sync-catalog.mjs). Every place Find shows comes from here:
// no hand-written lists, no made-up ratings or availability.

import catalogJson from '@/data/catalog.json';
import type {DietaryTag, OpeningHours} from '@/lib/venue-options';

export type BookingSystem = 'sevenrooms' | 'opentable' | 'zenchef' | 'designmynight' | 'resy' | 'link';
export type Booking = {system: BookingSystem; id: string};
export type PlaceKind = 'casual' | 'date-night' | 'michelin' | 'group';
/** Food for one at dinner, no drinks: 1 under 30, 2 30–60, 3 60–110, 4 over 110. */
export type PriceBand = 1 | 2 | 3 | 4;

export type CatalogPlace = {
  id: string;
  name: string;
  city: string;
  area: string | null;
  cuisines: string[];
  diet_tags: DietaryTag[];
  opening_hours: Record<string, [string, string][]> | null;
  michelin: string | null;
  website: string | null;
  description: string | null;
  kinds: PlaceKind[];
  /** Lower is more popular. */
  rank: number;
  apple_maps_id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** How many guides and lists recommend it. */
  mentions: number;
  instagram: string | null;
  booking: Booking | null;
  new_since: string | null;
  price: PriceBand | null;
  /** Starred places within about an hour of a city: that city, and the journey. */
  near: string | null;
  travel: string | null;
};

export const CATALOG = catalogJson as CatalogPlace[];
const BY_ID = new Map(CATALOG.map((place) => [place.id, place]));

export function catalogPlace(id: string): CatalogPlace | undefined {
  return BY_ID.get(id);
}

/** The two cities Find covers. */
export type CatalogCity = 'Amsterdam' | 'London';

const LONDON_WORDS =
  /\b(london|soho|shoreditch|hackney|camden|islington|peckham|brixton|clerkenwell|marylebone|mayfair|fitzrovia|covent garden|notting hill|dalston|bermondsey|borough|kings cross|king's cross|chelsea|kensington|westminster|stoke newington|deptford|clapham|battersea|whitechapel|spitalfields|holborn|bloomsbury|southwark|greenwich|walthamstow)\b/i;
const AMSTERDAM_WORDS =
  /\b(amsterdam|jordaan|de pijp|oud-west|oud west|oud-zuid|oud zuid|westerpark|noord|oost|zuid|centrum|plantage|ndsm|de baarsjes|rivierenbuurt|watergraafsmeer|amstel|zuidas)\b/i;

/** Which catalog city a typed location means, if either. */
export function catalogCity(location: string | null | undefined): CatalogCity | null {
  const text = location?.trim() ?? '';
  if (text.length === 0) return 'Amsterdam';
  if (LONDON_WORDS.test(text)) return 'London';
  if (AMSTERDAM_WORDS.test(text)) return 'Amsterdam';
  return null;
}

/** The part of town a location names ("De Pijp" in "De Pijp, Amsterdam"), if
 * it's narrower than the city. */
export function catalogArea(location: string | null | undefined): string | null {
  const first = location?.split(',')[0]?.trim() ?? '';
  if (first.length === 0 || /^(amsterdam|london)$/i.test(first)) return null;
  return first;
}

/** Places in a city that suit a kind of table. Starred places just outside
 * the city (near) only come into Michelin searches. */
export function placesFor(city: CatalogCity, kind: PlaceKind): CatalogPlace[] {
  return CATALOG.filter((place) => {
    if (!place.kinds.includes(kind)) return false;
    if (place.city === city) return true;
    return kind === 'michelin' && place.near === city;
  });
}

const CUISINE_LABELS: Record<string, string> = {
  italian: 'Italian',
  french: 'French',
  japanese: 'Japanese',
  korean: 'Korean',
  chinese: 'Chinese',
  thai: 'Thai',
  'southeast-asian': 'Southeast Asian',
  indian: 'Indian',
  indonesian: 'Indonesian',
  'modern-european': 'Modern European',
  'spanish-tapas': 'Spanish & tapas',
  seafood: 'Seafood',
  mexican: 'Mexican',
  'middle-eastern': 'Middle Eastern',
  'steak-grill': 'Steak & grill',
  'vegetarian-forward': 'Vegetarian-forward',
};

/** The first cuisine as a label; "Other" isn't shown. */
export function cuisineLabel(place: CatalogPlace): string | null {
  const first = place.cuisines.find((id) => id !== 'other');
  return first != null ? (CUISINE_LABELS[first] ?? null) : null;
}

/** "€€" in Amsterdam (and nearby), "££" in London. */
export function priceSigns(place: CatalogPlace): string | null {
  if (place.price == null) return null;
  const sign = place.city === 'London' ? '£' : '€';
  return sign.repeat(place.price);
}

/** "Oud-West · Modern European · €€ · Bib Gourmand", as on iOS. */
export function placeDetailsLine(place: CatalogPlace): string {
  return [place.area, cuisineLabel(place), priceSigns(place), place.michelin]
    .filter((part): part is string => part != null && part.length > 0)
    .join(' · ');
}

export function appleMapsUrl(place: CatalogPlace): string {
  if (place.apple_maps_id != null) {
    return `https://maps.apple.com/place?auid=${encodeURIComponent(place.apple_maps_id)}`;
  }
  const query = [place.name, place.address ?? place.city].filter(Boolean).join(', ');
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

/** The table from Find: yyyy-mm-dd, "7:30pm", and how many. */
export type Table = {date: string; time: string; party: number};

/** Book's link, as on iOS: the place's booking page filled in with the table
 * where its system allows, else its page, its website, or Google Maps. */
export function bookingUrl(place: CatalogPlace, table: Table | null): string {
  const booking = place.booking;
  if (booking != null) {
    const filled = table != null ? withTable(booking, table) : null;
    if (filled != null) return filled;
    return plainUrl(booking);
  }
  if (place.website != null) return place.website;
  const query = [place.name, place.address ?? place.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function withTable(booking: Booking, table: Table): string | null {
  const time = clock(table.time);
  const id = encodeURIComponent(booking.id);
  const party = String(Math.max(1, table.party));
  const query = (params: Record<string, string>) => new URLSearchParams(params).toString();
  switch (booking.system) {
    case 'sevenrooms':
      return `https://www.sevenrooms.com/explore/${id}/reservations/create/search?${query({
        party_size: party,
        date: table.date,
        ...(time != null && {start_time: halfHour(time)}),
      })}`;
    case 'opentable':
      return `https://www.opentable.co.uk/booking/restref/availability?${query({
        rid: booking.id,
        partySize: party,
        ...(time != null && {dateTime: `${table.date}T${time}`}),
      })}`;
    case 'zenchef':
      return `https://bookings.zenchef.com/results?${query({rid: booking.id, pax: party, day: table.date})}`;
    case 'designmynight':
      return `https://bookings.designmynight.com/book?${query({
        venue_id: booking.id,
        num_people: party,
        date: table.date,
        ...(time != null && {time}),
      })}`;
    case 'resy':
      return `https://resy.com/cities/${booking.id}?${query({
        seats: party,
        date: table.date,
        ...(time != null && {time: time.replace(':', '')}),
      })}`;
    default:
      return null;
  }
}

function plainUrl(booking: Booking): string {
  const id = encodeURIComponent(booking.id);
  switch (booking.system) {
    case 'sevenrooms':
      return `https://www.sevenrooms.com/explore/${id}/reservations/create/search`;
    case 'opentable':
      return `https://www.opentable.co.uk/booking/restref/availability?rid=${id}`;
    case 'zenchef':
      return `https://bookings.zenchef.com/results?rid=${id}`;
    case 'designmynight':
      return `https://bookings.designmynight.com/book?venue_id=${id}`;
    case 'resy':
      return `https://resy.com/cities/${booking.id}`;
    case 'link':
      return booking.id;
  }
}

/** "7:30pm" → "19:30"; null if it doesn't read as a time. */
function clock(label: string): string | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(label.trim());
  if (match == null) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'pm') hours += 12;
  return `${String(hours).padStart(2, '0')}:${match[2] ?? '00'}`;
}

/** "19:45" → "19:30". */
function halfHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${String(hours).padStart(2, '0')}:${minutes >= 30 ? '30' : '00'}`;
}
