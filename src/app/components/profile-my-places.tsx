'use client';

import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {positivePicksFromTasteProfile} from '@/lib/member-friend-picks';
import {
  addPositiveRestaurantToProfile,
  removePositiveRestaurantFromProfile,
  saveTasteProfile,
  type TasteProfile,
} from '@/lib/taste-profile';
import type {VenueOptionCard} from '@/lib/venue-options';

const row: CSSProperties = {
  width: '100%',
  padding: 'calc(var(--spacing-3) - 4px) 0',
  borderBottom: '1px solid var(--color-border-subtle)',
};

function ratingLabel(rating: 'loved' | 'liked' | 'fine'): string {
  if (rating === 'loved') return 'Loved';
  if (rating === 'fine') return 'Fine';
  return 'Liked';
}

function PlaceRatingMenu({
  rating,
  venueTitle,
  onLoved,
  onLiked,
  onFine,
  onRemove,
}: {
  rating: 'loved' | 'liked' | 'fine';
  venueTitle: string;
  onLoved: () => void;
  onLiked: () => void;
  onFine: () => void;
  onRemove: () => void;
}) {
  const label = ratingLabel(rating);

  return (
    <Popover
      label={`${venueTitle} — change rating`}
      placement="below"
      alignment="end"
      content={
        <VStack gap={1} align="stretch" style={{padding: 'var(--spacing-2)', minWidth: 168}}>
          <Button
            label="Loved"
            variant="ghost"
            size="sm"
            onClick={onLoved}
            isDisabled={rating === 'loved'}
          />
          <Button
            label="Liked"
            variant="ghost"
            size="sm"
            onClick={onLiked}
            isDisabled={rating === 'liked'}
          />
          <Button
            label="Fine"
            variant="ghost"
            size="sm"
            onClick={onFine}
            isDisabled={rating === 'fine'}
          />
          <Button label="Remove" variant="ghost" size="sm" onClick={onRemove} />
        </VStack>
      }>
      {(triggerProps) => (
        <Button {...triggerProps} label={`${label} ▾`} variant="secondary" size="sm" />
      )}
    </Popover>
  );
}

export function ProfileMyPlacesSection({
  profile,
  onProfileSaved,
}: {
  profile: TasteProfile;
  onProfileSaved: (next: TasteProfile) => void;
}) {
  const places = useMemo(() => positivePicksFromTasteProfile(profile), [profile]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<VenueOptionCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const queryTrimmed = query.trim();
  const canSearch = queryTrimmed.length >= 2;
  const area = profile.homeArea.trim() || 'Amsterdam';

  useEffect(() => {
    if (!adding || !canSearch) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      const params = new URLSearchParams({q: queryTrimmed, area});
      void fetch(`/api/onboarding/search?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('search failed');
          return res.json() as Promise<{results?: VenueOptionCard[]}>;
        })
        .then((body) => {
          if (cancelled) return;
          const already = new Set(places.map((place) => place.venueId));
          const results = body.results ?? [];
          setSearchResults(results.filter((venue) => !already.has(venue.id)));
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
            setSearchError('Search failed — try again.');
          }
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [adding, canSearch, queryTrimmed, area, places]);

  const saveProfile = (next: TasteProfile) => {
    saveTasteProfile(next);
    onProfileSaved(next);
  };

  const exitAddMode = () => {
    setAdding(false);
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
  };

  const persistNewPlace = (next: TasteProfile) => {
    saveProfile(next);
    exitAddMode();
  };

  return (
    <VStack gap={3} align="stretch" style={{marginTop: 'var(--spacing-8)'}}>
      <HStack hAlign="between" vAlign="center" style={{width: '100%'}}>
        <VStack gap={0}>
          <Text type="label" weight="semibold">
            Places you enjoy
          </Text>
          <Text type="supporting" color="secondary">
            Only positive picks — if it is on Quiet Table, it is part of your taste profile.
          </Text>
        </VStack>
        {!adding && (
          <Button label="Add a place" variant="secondary" onClick={() => setAdding(true)} />
        )}
      </HStack>

      <Card padding={4}>
        {adding ? (
          <VStack gap={3} align="stretch">
            <HStack gap={2} vAlign="end" style={{width: '100%'}} wrap="wrap">
              <div style={{flex: 1, minWidth: 200}}>
                <TextInput
                  label="Search restaurants"
                  value={query}
                  onChange={setQuery}
                  placeholder="e.g. De Kas"
                />
              </div>
              <HStack gap={2} vAlign="center">
                <Button
                  label="Clear"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuery('')}
                  isDisabled={query.trim().length === 0}
                />
                <Button label="Done" variant="secondary" size="sm" onClick={exitAddMode} />
              </HStack>
            </HStack>

            {searchLoading ? (
              <Text type="supporting" color="secondary">
                Searching near {area}…
              </Text>
            ) : searchError != null ? (
              <Text type="supporting" color="secondary">
                {searchError}
              </Text>
            ) : !canSearch ? (
              <Text type="supporting" color="secondary">
                Start typing a restaurant name — results appear after two characters.
              </Text>
            ) : searchResults.length === 0 ? (
              <Text type="supporting" color="secondary">
                No matches yet — try another spelling or neighborhood.
              </Text>
            ) : (
              <VStack gap={0} align="stretch">
                {searchResults.map((venue, index) => (
                  <HStack
                    key={venue.id}
                    hAlign="between"
                    vAlign="center"
                    style={{
                      width: '100%',
                      ...row,
                      borderBottom:
                        index === searchResults.length - 1 ? 'none' : row.borderBottom,
                    }}>
                    <VStack gap={0}>
                      <Text type="label">{venue.title}</Text>
                      {venue.subtitle != null && (
                        <Text type="supporting" color="secondary">
                          {venue.subtitle}
                        </Text>
                      )}
                    </VStack>
                    <HStack gap={2}>
                      <Button
                        label="Fine"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          persistNewPlace(
                            addPositiveRestaurantToProfile(profile, venue.id, 'fine'),
                          )
                        }
                      />
                      <Button
                        label="Liked"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          persistNewPlace(
                            addPositiveRestaurantToProfile(profile, venue.id, 'liked'),
                          )
                        }
                      />
                      <Button
                        label="Loved"
                        size="sm"
                        onClick={() =>
                          persistNewPlace(
                            addPositiveRestaurantToProfile(profile, venue.id, 'loved'),
                          )
                        }
                      />
                    </HStack>
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>
        ) : places.length === 0 ? (
          <Text type="supporting" color="secondary">
            Finish the venue quiz or tap Add a place to search somewhere you have been.
          </Text>
        ) : (
          <VStack gap={0} align="stretch">
            {places.map((place, index) => (
              <VStack
                key={place.venueId}
                gap={0}
                style={{
                  ...row,
                  borderBottom: index === places.length - 1 ? 'none' : row.borderBottom,
                }}>
                <HStack hAlign="between" vAlign="center" style={{width: '100%'}}>
                  <Text type="label" weight="semibold">
                    {place.title}
                  </Text>
                  <PlaceRatingMenu
                    rating={place.rating}
                    venueTitle={place.title}
                    onLoved={() =>
                      saveProfile(addPositiveRestaurantToProfile(profile, place.venueId, 'loved'))
                    }
                    onLiked={() =>
                      saveProfile(addPositiveRestaurantToProfile(profile, place.venueId, 'liked'))
                    }
                    onFine={() =>
                      saveProfile(addPositiveRestaurantToProfile(profile, place.venueId, 'fine'))
                    }
                    onRemove={() =>
                      saveProfile(removePositiveRestaurantFromProfile(profile, place.venueId))
                    }
                  />
                </HStack>
                {place.vibe.length > 0 && (
                  <Text type="supporting" color="secondary">
                    {place.vibe}
                  </Text>
                )}
              </VStack>
            ))}
          </VStack>
        )}
      </Card>
    </VStack>
  );
}
