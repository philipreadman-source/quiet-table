'use client';

import {MapPin} from 'lucide-react';
import type {MouseEvent} from 'react';
import {resolveGoogleMapsUrl, type VenueOptionCard} from '@/lib/venue-options';
import styles from './venue-google-maps-pin.module.css';

function stopCardSelect(event: MouseEvent) {
  event.stopPropagation();
}

export function VenueGoogleMapsPin({
  venue,
  size = 20,
}: {
  venue: Pick<VenueOptionCard, 'title' | 'subtitle' | 'google_reviews_url'>;
  size?: number;
}) {
  const href = resolveGoogleMapsUrl(venue);
  const label = `Open ${venue.title} in Google Maps`;

  return (
    <a
      className={styles.pin}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={stopCardSelect}>
      <MapPin size={size} strokeWidth={1.8} aria-hidden />
    </a>
  );
}
