import {resolveGoogleMapsUrl, type VenueOptionCard} from '@/lib/venue-options';

export type VenueBookingHandoffDraft = {
  date?: string;
  time?: string;
  partySize?: string;
  location?: string;
};

function formatHandoffDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** One line to paste into a reservation form or message. */
export function formatBookingHandoffSnippet(
  title: string,
  draft: VenueBookingHandoffDraft,
): string {
  const segments = [title.trim()];
  const date = draft.date?.trim();
  if (date != null && date.length > 0) segments.push(formatHandoffDate(date));
  const time = draft.time?.trim();
  if (time != null && time.length > 0) segments.push(time);
  const size = draft.partySize?.trim();
  if (size != null && size.length > 0) segments.push(`party of ${size}`);
  return segments.join(' · ');
}

/** Open the venue in Google Maps and copy booking context when the draft has it. */
export function handoffVenueBooking(
  venue: Pick<VenueOptionCard, 'title' | 'subtitle' | 'google_reviews_url'>,
  draft: VenueBookingHandoffDraft,
): void {
  if (typeof window === 'undefined') return;

  const city = draft.location?.trim() || 'Amsterdam';
  window.open(resolveGoogleMapsUrl(venue, city), '_blank', 'noopener,noreferrer');

  const snippet = formatBookingHandoffSnippet(venue.title, draft);
  const hasContext = snippet.length > venue.title.trim().length;
  if (hasContext && navigator.clipboard?.writeText != null) {
    void navigator.clipboard.writeText(snippet).catch(() => {});
  }
}
