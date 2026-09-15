'use client';

import {useCallback, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Text} from '@astryxdesign/core/Text';
import {findVenueOption} from '@/lib/venue-options';
import {
  applyVenueReaction,
  refreshTasteConfidence,
  saveTasteProfile,
  type TasteProfile,
  type VenueReaction,
} from '@/lib/taste-profile';
import {PROFILE_TASTE_QUIZ_BATCH, type TasteQuizVenue} from '@/lib/taste-quiz';

const REACTION_OPTIONS: {id: VenueReaction; label: string}[] = [
  {id: 'love', label: 'Love it'},
  {id: 'fine', label: 'Fine'},
  {id: 'not_for_me', label: 'Not for me'},
  {id: 'never_been', label: 'Never been'},
];

export function ProfileTasteQuizSection({
  profile,
  onProfileSaved,
}: {
  profile: TasteProfile;
  onProfileSaved: (next: TasteProfile) => void;
}) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venues, setVenues] = useState<TasteQuizVenue[]>([]);
  const [index, setIndex] = useState(0);

  const reactedIds = Object.keys(profile.venueReactions);
  const area = profile.homeArea.trim() || 'Amsterdam';
  const cuisines = profile.preferences.cuisineAffinities ?? [];

  const persist = useCallback(
    (next: TasteProfile) => {
      const refreshed = refreshTasteConfidence(next);
      saveTasteProfile(refreshed);
      onProfileSaved(refreshed);
      return refreshed;
    },
    [onProfileSaved],
  );

  const loadBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIndex(0);
    const params = new URLSearchParams({
      area,
      limit: String(PROFILE_TASTE_QUIZ_BATCH),
      exclude: reactedIds.join(','),
    });
    if (cuisines.length > 0) params.set('cuisines', cuisines.join(','));

    try {
      const res = await fetch(`/api/onboarding/quiz-venues?${params.toString()}`);
      const payload = (await res.json()) as {venues?: TasteQuizVenue[]; error?: string};
      if (!res.ok) throw new Error(payload.error ?? 'Could not load restaurants');
      const nextVenues = payload.venues ?? [];
      setVenues(nextVenues);
      if (nextVenues.length === 0) {
        setError(`No new places left near ${area} — you've seen the current set.`);
      }
    } catch (err) {
      setVenues([]);
      setError(err instanceof Error ? err.message : 'Could not load restaurants');
    } finally {
      setLoading(false);
    }
  }, [area, cuisines, reactedIds]);

  const startQuiz = () => {
    setActive(true);
    void loadBatch();
  };

  const handleReaction = (reaction: VenueReaction) => {
    const venue = venues[index];
    if (venue == null) return;
    persist(applyVenueReaction(profile, venue.id, reaction));
    if (index >= venues.length - 1) {
      setActive(false);
      setVenues([]);
      setIndex(0);
      return;
    }
    setIndex((i) => i + 1);
  };

  const venue = venues[index];
  const known = venue != null ? findVenueOption(venue.id) : undefined;

  return (
    <VStack gap={2} align="stretch">
      <Text type="label" weight="semibold">
        Quiz
      </Text>
      <Text type="supporting" color="secondary">
        Keep training your taste — new restaurants tailored to you.
      </Text>

      {!active && (
        <HStack hAlign="start">
          <Button label="Start another round" variant="secondary" onClick={startQuiz} />
        </HStack>
      )}

      {active && loading && (
        <Text type="supporting" color="secondary">
          Finding places near {area}…
        </Text>
      )}

      {active && !loading && error != null && (
        <VStack gap={2} align="stretch">
          <Text type="supporting" color="secondary">
            {error}
          </Text>
          <HStack hAlign="start" gap={2}>
            <Button label="Try again" variant="ghost" size="sm" onClick={() => void loadBatch()} />
            <Button label="Close" variant="ghost" size="sm" onClick={() => setActive(false)} />
          </HStack>
        </VStack>
      )}

      {active && !loading && error == null && venue != null && (
        <VStack gap={3} align="stretch">
          <Text type="supporting" color="secondary">
            {index + 1} of {venues.length}
            {cuisines.length > 0 ? ' · picked for your cravings' : ` · popular in ${area}`}
          </Text>
          <SelectableCard
            label={venue.title}
            isSelected={false}
            onChange={() => {}}
            style={{padding: 'var(--spacing-4)'}}>
            <VStack gap={2}>
              <Text type="label" weight="semibold">
                {known?.title ?? venue.title}
              </Text>
              {(known?.subtitle ?? venue.subtitle) != null && (
                <Text type="supporting" color="secondary">
                  {known?.subtitle ?? venue.subtitle}
                </Text>
              )}
            </VStack>
          </SelectableCard>
          <HStack gap={2} wrap="wrap">
            {REACTION_OPTIONS.map((option) => (
              <Button
                key={option.id}
                label={option.label}
                variant="secondary"
                size="sm"
                onClick={() => handleReaction(option.id)}
              />
            ))}
          </HStack>
          <Button label="Stop for now" variant="ghost" size="sm" onClick={() => setActive(false)} />
        </VStack>
      )}
    </VStack>
  );
}
