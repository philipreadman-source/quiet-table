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

export function parseLocationFromMessage(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length < 2) return null;

  const inMatch = trimmed.match(/\b(?:in|near|around|try)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{0,40})/i);
  if (inMatch?.[1] != null) {
    const place = inMatch[1].replace(/\b(?:instead|please|thanks)\b/gi, '').trim();
    if (place.length >= 2) return toTitleCase(place);
  }

  const insteadMatch = trimmed.match(/\b(?:instead|switch to|make it)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{0,40})/i);
  if (insteadMatch?.[1] != null) {
    const place = insteadMatch[1].replace(/\b(?:please|thanks)\b/gi, '').trim();
    if (place.length >= 2) return toTitleCase(place);
  }

  if (looksLikeBareLocation(trimmed)) return toTitleCase(trimmed);

  return null;
}
