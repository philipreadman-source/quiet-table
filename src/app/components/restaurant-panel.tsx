'use client';

import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {ExternalLink} from 'lucide-react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Lightbox} from '@astryxdesign/core/Lightbox';
import {DialogHeader} from '@astryxdesign/core/Dialog';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {
  appleMapsUrl,
  bookingUrl,
  catalogPlace,
  cuisineLabel,
  placeDetailsLine,
  priceSigns,
  type CatalogPlace,
  type Table,
} from '@/lib/catalog';
import {
  formatScore,
  photoUrl,
  placeReviews,
  placeScores,
  reviewWhy,
  visitedMonth,
  type PlaceScore,
  type WebPlace,
} from '@/lib/web-reviews';
import {AppleMap} from '@/app/components/apple-map';
import styles from './restaurant-panel.module.css';

// "View restaurant": the place's card, as on iOS. A wide panel on desktop
// (details and map on the left, reviews on the right), the full screen on a
// phone with Details | Reviews.

type PanelContext = {open: (placeId: string) => void};
const RestaurantPanelContext = createContext<PanelContext | null>(null);

/** Opens the restaurant panel; null outside the provider. */
export function useRestaurantPanel(): PanelContext | null {
  return useContext(RestaurantPanelContext);
}

export function RestaurantPanelProvider({table, children}: {table: Table | null; children: ReactNode}) {
  const [placeId, setPlaceId] = useState<string | null>(null);
  const place = placeId != null ? catalogPlace(placeId) : undefined;
  return (
    <RestaurantPanelContext.Provider value={{open: setPlaceId}}>
      {children}
      {place != null && <RestaurantPanel place={place} table={table} onClose={() => setPlaceId(null)} />}
    </RestaurantPanelContext.Provider>
  );
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

function RestaurantPanel({place, table, onClose}: {place: CatalogPlace; table: Table | null; onClose: () => void}) {
  const narrow = useIsNarrow();
  const [tab, setTab] = useState<'details' | 'reviews'>('details');
  const [reviews, setReviews] = useState<WebPlace | null>(null);
  const [score, setScore] = useState<PlaceScore | null>(null);

  useEffect(() => {
    let cancelled = false;
    void placeReviews(place.id).then((found) => !cancelled && setReviews(found));
    void placeScores().then((scores) => !cancelled && setScore(scores.get(place.id) ?? null));
    return () => {
      cancelled = true;
    };
  }, [place.id]);

  const details = <PlaceDetails place={place} />;
  const reviewList = <PlaceReviewList reviews={reviews} />;

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      variant={narrow ? 'fullscreen' : 'standard'}
      width={narrow ? undefined : 'min(1100px, 94vw)'}
      maxHeight={narrow ? undefined : '90vh'}>
      <DialogHeader
        title={place.name}
        // Word joiners keep "€€€" from breaking across lines.
        subtitle={placeDetailsLine(place).replace(/([€£])(?=[€£])/g, '$1\u2060') || undefined}
        onOpenChange={onClose}
      />
      <VStack gap={4} className={styles.body}>
        <ScoreLine score={score} />
        {narrow ? (
          <>
            <SegmentedControl
              label="Details or reviews"
              value={tab}
              onChange={(value) => setTab(value as 'details' | 'reviews')}
              layout="fill">
              <SegmentedControlItem value="details" label="Details" />
              <SegmentedControlItem value="reviews" label="Reviews" />
            </SegmentedControl>
            {tab === 'details' ? details : reviewList}
          </>
        ) : (
          <HStack gap={8} vAlign="start" className={styles.columns}>
            <VStack gap={4} className={styles.detailsColumn}>
              {details}
            </VStack>
            <VStack gap={3} className={styles.reviewsColumn}>
              <Text weight="semibold">Reviews</Text>
              {reviewList}
            </VStack>
          </HStack>
        )}
      </VStack>
      <HStack gap={2} className={styles.footer}>
        <Button
          label="Book"
          variant="primary"
          style={narrow ? {width: '100%'} : undefined}
          endContent={<ExternalLink size={14} aria-hidden />}
          onClick={() => window.open(bookingUrl(place, table), '_blank', 'noopener,noreferrer')}
        />
      </HStack>
    </Dialog>
  );
}

function ScoreLine({score}: {score: PlaceScore | null}) {
  if (score == null) return <Text color="secondary">No reviews on Quiet Table yet</Text>;
  return (
    // One baseline: "9/10" (the /10 inline, so it sits on the 9's line),
    // then the count.
    <HStack gap={3} className={styles.scoreLine}>
      <Text type="display-3" weight="semibold">
        {formatScore(score.score)}
        <Text color="secondary">/10</Text>
      </Text>
      <Text color="secondary">
        {score.reviews === 1 ? '1 review' : `${score.reviews} reviews`} on Quiet Table
      </Text>
    </HStack>
  );
}

const DAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
] as const;

function PlaceDetails({place}: {place: CatalogPlace}) {
  const rows: {label: string; value: ReactNode}[] = [];
  if (place.near != null && place.travel != null) rows.push({label: 'Getting there', value: place.travel});
  if (place.address != null) {
    rows.push({
      label: 'Address',
      value: (
        <a className={styles.link} href={appleMapsUrl(place)} target="_blank" rel="noopener noreferrer">
          {place.address}
        </a>
      ),
    });
  }
  const cuisine = cuisineLabel(place);
  if (cuisine != null) rows.push({label: 'Cuisine', value: cuisine});
  const price = priceSigns(place);
  if (price != null) rows.push({label: 'Price', value: price});
  if (place.michelin != null) rows.push({label: 'Michelin', value: place.michelin});
  if (place.website != null) {
    rows.push({
      label: 'Website',
      value: (
        <a className={styles.link} href={place.website} target="_blank" rel="noopener noreferrer">
          {new URL(place.website).hostname.replace(/^www\./, '')}
        </a>
      ),
    });
  }
  if (place.instagram != null) {
    rows.push({
      label: 'Instagram',
      value: (
        <a
          className={styles.link}
          href={`https://www.instagram.com/${place.instagram}/`}
          target="_blank"
          rel="noopener noreferrer">
          @{place.instagram}
        </a>
      ),
    });
  }

  return (
    <VStack gap={4}>
      {place.lat != null && place.lng != null && <AppleMap lat={place.lat} lng={place.lng} name={place.name} />}
      {place.description != null && <Text color="secondary">{place.description}</Text>}
      <VStack gap={2}>
        {rows.map((row) => (
          <HStack key={row.label} gap={4} vAlign="start">
            <Text color="secondary" className={styles.rowLabel}>
              {row.label}
            </Text>
            <Text>{row.value}</Text>
          </HStack>
        ))}
        {place.opening_hours != null && (
          <HStack gap={4} vAlign="start">
            <Text color="secondary" className={styles.rowLabel}>
              Hours
            </Text>
            <VStack gap={1}>
              {DAYS.map(([day, label]) => {
                const ranges = place.opening_hours?.[String(day)] ?? [];
                return (
                  <Text key={day} hasTabularNumbers textWrap="nowrap">
                    {label} {ranges.length > 0 ? ranges.map(([from, to]) => `${from}–${to}`).join(', ') : 'Closed'}
                  </Text>
                );
              })}
            </VStack>
          </HStack>
        )}
      </VStack>
    </VStack>
  );
}

function PlaceReviewList({reviews}: {reviews: WebPlace | null}) {
  if (reviews == null) return <Text color="secondary">Loading reviews…</Text>;
  if (reviews.reviews.length === 0 && reviews.gallery.length === 0) {
    return <Text color="secondary">No one on Quiet Table has reviewed it yet.</Text>;
  }
  return (
    <VStack gap={5}>
      {reviews.reviews.map((review, index) => {
        const why = reviewWhy(review);
        return (
          <VStack key={index} gap={2} className={styles.review}>
            <HStack gap={3} vAlign="center">
              <Avatar name={review.initials.split('').join(' ')} size="small" />
              <Text color="secondary" type="supporting">
                Reviewed {visitedMonth(review.visited)}
              </Text>
              <Text weight="semibold" className={styles.reviewScore}>
                {review.score}
                <Text color="secondary" type="supporting">
                  /10
                </Text>
              </Text>
            </HStack>
            {why != null && <Text color="secondary">{why}</Text>}
            {review.body != null && <Text>{review.body}</Text>}
            {review.photos.length > 0 && <PhotoGrid paths={review.photos} />}
          </VStack>
        );
      })}
      {reviews.gallery.length > 0 && (
        <VStack gap={2}>
          <Text weight="semibold">Diners’ photos</Text>
          <PhotoGrid paths={reviews.gallery} />
        </VStack>
      )}
    </VStack>
  );
}

/** Thumbnails that open full screen; with several, step through them with the
 * arrows, the keyboard, or a swipe on a phone, as on iOS. */
function PhotoGrid({paths}: {paths: string[]}) {
  const [open, setOpen] = useState<number | null>(null);
  // The lightbox counts them ("2 / 3") itself.
  const media = paths.map((path) => ({src: photoUrl(path), alt: 'A diner’s photo'}));
  const step = useCallback(
    (by: 1 | -1) => setOpen((at) => (at == null ? at : Math.min(Math.max(at + by, 0), paths.length - 1))),
    [paths.length],
  );
  useSwipe(open != null, step);
  return (
    <>
      <HStack gap={2} className={styles.photos}>
        {paths.map((path, at) => (
          <button key={path} type="button" className={styles.photo} aria-label="Open photo" onClick={() => setOpen(at)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage, already sized on upload */}
            <img src={photoUrl(path)} alt="A diner’s photo" loading="lazy" />
          </button>
        ))}
      </HStack>
      <Lightbox
        className={styles.lightbox}
        media={media}
        isOpen={open != null}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        index={open ?? 0}
        onIndexChange={setOpen}
      />
    </>
  );
}

/** A horizontal swipe while `active`: left is the next photo (+1), right the previous (-1). */
function useSwipe(active: boolean, onSwipe: (step: 1 | -1) => void) {
  useEffect(() => {
    if (!active) return;
    let start: {x: number; y: number} | null = null;
    const down = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch != null ? {x: touch.clientX, y: touch.clientY} : null;
    };
    const up = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (start == null || touch == null) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      start = null;
      // A clear sideways swipe, not a scroll or a tap.
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    };
    window.addEventListener('touchstart', down, {passive: true});
    window.addEventListener('touchend', up, {passive: true});
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
    };
  }, [active, onSwipe]);
}
