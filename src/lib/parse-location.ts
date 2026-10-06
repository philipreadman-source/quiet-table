import {listUniqueCatalogVenues, venueNeighbourhood} from '@/lib/venue-options';

function toTitleCase(place: string): string {
  return place
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function looksLikeBareLocation(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 48) return false;
  if (/\b(show more|book|confirm|reserve|yes|vegetarian|vegan|mixed|restrictions)\b/i.test(lower)) {
    return false;
  }
  if (/\b(casual|date night|michelin|business|group|party of|for \d)\b/i.test(lower)) return false;
  if (/\b([6-9](?::30|:00)?\s?(?:pm|p\.m\.))\b/i.test(lower)) return false;
  return /^[a-zA-ZÀ-ÿ\s'.-]+$/.test(trimmed);
}

let knownAreas: Set<string> | null = null;

function isKnownArea(place: string): boolean {
  knownAreas ??= new Set(
    ['amsterdam', ...listUniqueCatalogVenues().map((venue) => venueNeighbourhood(venue) ?? '')]
      .map((area) => area.trim().toLowerCase())
      .filter((area) => area.length > 0),
  );
  return knownAreas.has(place.trim().toLowerCase());
}

/** "in/near/around X" accepts any place; looser phrasings ("try X", bare "X") only known areas,
 * so "try seafood" or "seafood" stay search terms. */
export function parseLocationFromMessage(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length < 2) return null;

  const inMatch = trimmed.match(/\b(?:in|near|around)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{0,40})/i);
  if (inMatch?.[1] != null && !/^the mood\b/i.test(inMatch[1])) {
    const place = inMatch[1].replace(/\b(?:instead|please|thanks)\b/gi, '').trim();
    if (place.length >= 2) return toTitleCase(place);
  }

  const insteadMatch = trimmed.match(
    /\b(?:try|instead|switch to|make it)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{0,40})/i,
  );
  if (insteadMatch?.[1] != null) {
    const place = insteadMatch[1].replace(/\b(?:instead|please|thanks)\b/gi, '').trim();
    if (isKnownArea(place)) return toTitleCase(place);
  }

  if (looksLikeBareLocation(trimmed) && isKnownArea(trimmed)) return toTitleCase(trimmed);

  return null;
}
