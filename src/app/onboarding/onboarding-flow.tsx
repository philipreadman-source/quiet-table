'use client';

import {useCallback, useEffect, useMemo, useState, type CSSProperties} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {VStack, Layout, LayoutContent, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Avatar} from '@astryxdesign/core/Avatar';
import tasteQuizVenues from '@/data/taste-quiz-venues.json';
import {reverseGeocode} from '@/lib/reverse-geocode';
import {
  findVenueOption,
  searchCatalogVenues,
  suggestVenuesForArea,
  type VenueOptionCard,
} from '@/lib/venue-options';
import {
  applyLovedVenues,
  applyVenueReaction,
  createEmptyTasteProfile,
  CUISINE_OPTIONS,
  finishOnboarding,
  hasOnboardingUsername,
  inviteShareMessage,
  inviteShareUrl,
  loadTasteProfile,
  markStepSkipped,
  ONBOARDING_STEP_ORDER,
  refreshTasteConfidence,
  saveTasteProfile,
  validateUsername,
  type CuisineId,
  type NoisePreference,
  type OnboardingStepId,
  type TasteProfile,
  type VenueReaction,
} from '@/lib/taste-profile';

const shell: CSSProperties = {
  minHeight: '100dvh',
  width: '100%',
  maxWidth: 480,
  margin: '0 auto',
  padding: 'var(--spacing-6) var(--spacing-4)',
  boxSizing: 'border-box',
};

const Q_AVATAR = (
  <Avatar src="/brand/quiet-table-mark.svg" name="Quiet Table" alt="Quiet Table" size="xsmall" />
);

const VIBE_OPTIONS: {id: NoisePreference; title: string; subtitle: string}[] = [
  {id: 'quiet', title: 'Quiet', subtitle: 'Calm rooms, easy conversation'},
  {id: 'any', title: 'Either', subtitle: 'No strong preference'},
  {id: 'lively', title: 'Buzzing', subtitle: 'Energy and a bit of noise'},
];

const REACTION_OPTIONS: {id: VenueReaction; label: string}[] = [
  {id: 'love', label: 'Love it'},
  {id: 'fine', label: 'Fine'},
  {id: 'not_for_me', label: 'Not for me'},
  {id: 'never_been', label: 'Never been'},
];

function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

function LovedVenueCard({
  venue,
  isSelected,
  onToggle,
}: {
  venue: VenueOptionCard;
  isSelected: boolean;
  onToggle: (venueId: string, selected: boolean) => void;
}) {
  return (
    <SelectableCard
      label={venue.title}
      isSelected={isSelected}
      onChange={(selected) => onToggle(venue.id, selected)}
      style={{padding: 'var(--spacing-4)', width: '100%'}}>
      <VStack gap={0} align="start">
        <Text type="label" weight="semibold">
          {venue.title}
        </Text>
        {venue.subtitle != null && (
          <Text type="supporting" color="secondary">
            {venue.subtitle}
          </Text>
        )}
      </VStack>
    </SelectableCard>
  );
}

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referrerId = searchParams.get('ref');

  const [step, setStep] = useState<OnboardingStepId>('basics');
  const [profile, setProfile] = useState<TasteProfile>(() => loadTasteProfile() ?? createEmptyTasteProfile());
  const [usernameInput, setUsernameInput] = useState(profile.username);
  const [homeAreaInput, setHomeAreaInput] = useState(profile.homeArea);
  const [lastMealInput, setLastMealInput] = useState(profile.lastMeal?.rawText ?? '');
  const [selectedLovedVenueIds, setSelectedLovedVenueIds] = useState<string[]>(() => [
    ...profile.anchorVenueIds,
  ]);
  const [suggestionArea, setSuggestionArea] = useState(profile.homeArea || 'Amsterdam');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [inviteLabel, setInviteLabel] = useState('');
  const [copyNote, setCopyNote] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadTasteProfile();
    if (existing != null && hasOnboardingUsername(existing) && existing.onboarding.completedAt != null) {
      router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    if (referrerId != null && referrerId.length > 0) {
      setProfile((prev) => {
        if (prev.social.friendUserIds.includes(referrerId)) return prev;
        return {
          ...prev,
          social: {
            ...prev.social,
            friendUserIds: [...prev.social.friendUserIds, referrerId],
          },
        };
      });
    }
  }, [referrerId]);

  useEffect(() => {
    if (step !== 'last_meal') return;
    setSuggestionArea(profile.homeArea || 'Amsterdam');
    setSelectedLovedVenueIds([...profile.anchorVenueIds]);
    if (typeof navigator === 'undefined' || navigator.geolocation == null) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void reverseGeocode(position.coords.latitude, position.coords.longitude).then((place) => {
          if (place != null && place.trim().length > 0) {
            setSuggestionArea(place);
          }
        });
      },
      () => {},
      {timeout: 5000},
    );
  }, [step, profile.homeArea, profile.anchorVenueIds]);

  const searchQuery = lastMealInput.trim();
  const isSearching = searchQuery.length >= 2;
  const searchResults = useMemo(
    () => (isSearching ? searchCatalogVenues(searchQuery) : []),
    [isSearching, searchQuery],
  );
  const suggestedVenues = useMemo(
    () => suggestVenuesForArea(suggestionArea),
    [suggestionArea],
  );
  const displayVenues = isSearching ? searchResults : suggestedVenues;

  const toggleLovedVenue = (venueId: string, selected: boolean) => {
    setSelectedLovedVenueIds((prev) => {
      if (selected) return prev.includes(venueId) ? prev : [...prev, venueId];
      return prev.filter((id) => id !== venueId);
    });
  };

  const persist = useCallback((next: TasteProfile) => {
    const refreshed = refreshTasteConfidence(next);
    setProfile(refreshed);
    saveTasteProfile(refreshed);
    return refreshed;
  }, []);

  const stepNumber = stepIndex(step) + 1;
  const inviteUrl = useMemo(() => inviteShareUrl(profile.userId), [profile.userId]);
  const invitesSent = profile.social.invites.sent.length;

  const advanceFrom = (currentStep: OnboardingStepId, nextProfile: TasteProfile) => {
    const saved = persist(nextProfile);
    const idx = stepIndex(currentStep);
    if (idx >= ONBOARDING_STEP_ORDER.length - 1) {
      persist(finishOnboarding(saved));
      router.push('/');
      return;
    }
    setStep(ONBOARDING_STEP_ORDER[idx + 1]!);
  };

  const skipStep = () => advanceFrom(step, markStepSkipped(profile, step));

  const finish = (next: TasteProfile) => {
    persist(finishOnboarding(next));
    router.push('/');
  };

  const handleBasicsContinue = () => {
    const validated = validateUsername(usernameInput);
    if (!validated.ok) {
      setUsernameError(validated.error);
      return;
    }
    setUsernameError(null);
    advanceFrom('basics', {
      ...profile,
      username: validated.value,
      homeArea: homeAreaInput.trim() || 'Amsterdam',
    });
  };

  const handleLastMealContinue = () => {
    const hasSelection = selectedLovedVenueIds.length > 0;
    const hasText = lastMealInput.trim().length > 0;
    if (!hasSelection && !hasText) {
      advanceFrom('last_meal', profile);
      return;
    }
    advanceFrom('last_meal', applyLovedVenues(profile, selectedLovedVenueIds, lastMealInput));
  };

  const lovedSelectionCount = selectedLovedVenueIds.length;
  const continueLabel =
    lovedSelectionCount > 0
      ? `Continue (${lovedSelectionCount} selected)`
      : 'Continue';

  const toggleCuisine = (id: CuisineId) => {
    const current = profile.preferences.cuisineAffinities ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    persist({...profile, preferences: {...profile.preferences, cuisineAffinities: next}});
  };

  const handleQuizReaction = (reaction: VenueReaction) => {
    const venue = tasteQuizVenues[quizIndex];
    if (venue == null) return;
    const next = applyVenueReaction(profile, venue.id, reaction);
    persist(next);
    if (quizIndex >= tasteQuizVenues.length - 1) {
      advanceFrom('venue_quiz', next);
      setQuizIndex(0);
      return;
    }
    setQuizIndex((i) => i + 1);
  };

  const copyInvite = async (label?: string) => {
    const message = inviteShareMessage(profile.username || 'Someone', inviteUrl);
    try {
      await navigator.clipboard.writeText(message);
      const sent = {
        label: label?.trim() || undefined,
        sentAt: new Date().toISOString(),
        channel: 'copy_link' as const,
      };
      persist({
        ...profile,
        social: {
          ...profile.social,
          invites: {
            ...profile.social.invites,
            sent: [...profile.social.invites.sent, sent],
          },
        },
      });
      setCopyNote('Invite link copied.');
    } catch {
      setCopyNote('Could not copy — select and copy manually.');
    }
  };

  const quizVenue = tasteQuizVenues[quizIndex];
  const quizKnown = quizVenue != null ? findVenueOption(quizVenue.id) : undefined;

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent>
          <VStack gap={4} style={shell}>
            <HStack gap={2} vAlign="center">
              {Q_AVATAR}
              <Text type="supporting" color="secondary">
                Step {stepNumber} of {ONBOARDING_STEP_ORDER.length}
              </Text>
            </HStack>

            {step === 'basics' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Welcome to Quiet Table
                </Text>
                <Text color="secondary">Pick a username — how friends will see your picks.</Text>
                <TextInput
                  label="Username"
                  value={usernameInput}
                  onChange={setUsernameInput}
                  placeholder="philip"
                  status={
                    usernameError != null ? {type: 'error', message: usernameError} : undefined
                  }
                />
                <TextInput
                  label="Home area"
                  value={homeAreaInput}
                  onChange={setHomeAreaInput}
                  placeholder="Amsterdam"
                />
                <HStack gap={2} wrap="wrap">
                  <Button label="Continue" onClick={handleBasicsContinue} />
                </HStack>
              </VStack>
            )}

            {step === 'last_meal' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Places you&apos;ve loved?
                </Text>
                <Text color="secondary">
                  Pick a few near {suggestionArea}, or search for others — optional.
                </Text>

                {!isSearching && (
                  <Text type="supporting" color="secondary">
                    Suggested near you
                  </Text>
                )}
                {isSearching && (
                  <Text type="supporting" color="secondary">
                    Matches for &ldquo;{searchQuery}&rdquo;
                  </Text>
                )}

                <VStack gap={2} align="start" style={{width: '100%'}}>
                  {displayVenues.map((venue) => (
                    <LovedVenueCard
                      key={venue.id}
                      venue={venue}
                      isSelected={selectedLovedVenueIds.includes(venue.id)}
                      onToggle={toggleLovedVenue}
                    />
                  ))}
                  {isSearching && displayVenues.length === 0 && (
                    <Text type="supporting" color="secondary">
                      No matches in our list — try another name, or Continue with your text.
                    </Text>
                  )}
                </VStack>

                <TextInput
                  label="Search or type a name"
                  value={lastMealInput}
                  onChange={setLastMealInput}
                  placeholder="De Kas, Bar Fisk…"
                />

                <HStack gap={2} wrap="wrap">
                  <Button label={continueLabel} onClick={handleLastMealContinue} />
                  <Button label="Skip" variant="ghost" onClick={skipStep} />
                </HStack>
              </VStack>
            )}

            {step === 'vibe' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  What vibe do you want most nights?
                </Text>
                <VStack gap={2} align="start">
                  {VIBE_OPTIONS.map((option) => (
                    <SelectableCard
                      key={option.id}
                      label={option.title}
                      isSelected={profile.preferences.noise === option.id}
                      onChange={(selected) => {
                        if (!selected) return;
                        advanceFrom('vibe', {
                          ...profile,
                          preferences: {...profile.preferences, noise: option.id},
                        });
                      }}
                      style={{padding: 'var(--spacing-4)'}}>
                      <VStack gap={0}>
                        <Text type="label" weight="semibold">
                          {option.title}
                        </Text>
                        <Text type="supporting" color="secondary">
                          {option.subtitle}
                        </Text>
                      </VStack>
                    </SelectableCard>
                  ))}
                </VStack>
                <Button label="Skip" variant="ghost" onClick={skipStep} />
              </VStack>
            )}

            {step === 'cuisine' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  What do you crave?
                </Text>
                <Text color="secondary">Pick any that fit — optional.</Text>
                <HStack gap={2} wrap="wrap">
                  {CUISINE_OPTIONS.map((option) => {
                    const selected = profile.preferences.cuisineAffinities?.includes(option.id) ?? false;
                    return (
                      <SelectableCard
                        key={option.id}
                        label={option.label}
                        isSelected={selected}
                        onChange={() => toggleCuisine(option.id)}
                        style={{padding: 'var(--spacing-3)'}}>
                        <Text type="label" weight="semibold">
                          {option.label}
                        </Text>
                      </SelectableCard>
                    );
                  })}
                </HStack>
                <HStack gap={2}>
                  <Button label="Continue" onClick={() => advanceFrom('cuisine', profile)} />
                  <Button label="Skip" variant="ghost" onClick={skipStep} />
                </HStack>
              </VStack>
            )}

            {step === 'venue_quiz' && quizVenue != null && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Have you eaten here?
                </Text>
                <Text color="secondary">
                  {quizIndex + 1} of {tasteQuizVenues.length}
                </Text>
                <SelectableCard
                  label={quizVenue.title}
                  isSelected={false}
                  onChange={() => {}}
                  style={{padding: 'var(--spacing-4)'}}>
                  <VStack gap={2}>
                    <Text type="label" weight="semibold">
                      {quizKnown?.title ?? quizVenue.title}
                    </Text>
                    {quizKnown?.subtitle != null && (
                      <Text type="supporting" color="secondary">
                        {quizKnown.subtitle}
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
                      onClick={() => handleQuizReaction(option.id)}
                    />
                  ))}
                </HStack>
                <Button label="Skip quiz" variant="ghost" onClick={skipStep} />
              </VStack>
            )}

            {step === 'invite_friends' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Who has great taste?
                </Text>
                <Text color="secondary">
                  Invite up to three people whose restaurant picks you&apos;d actually take. When
                  they&apos;re on Quiet Table, you&apos;ll see where they&apos;ve booked — no reviews,
                  just where they went.
                </Text>
                <Text type="supporting" color="secondary">
                  {invitesSent} of {profile.social.invites.targetCount} invited
                </Text>
                <TextInput
                  label="Nickname (optional)"
                  value={inviteLabel}
                  onChange={setInviteLabel}
                  placeholder="Maya"
                />
                <HStack gap={2} wrap="wrap">
                  <Button
                    label="Copy invite link"
                    onClick={() => void copyInvite(inviteLabel)}
                    isDisabled={!hasOnboardingUsername(profile)}
                  />
                  <Button label="Done" onClick={() => finish(profile)} />
                  <Button label="Maybe later" variant="ghost" onClick={skipStep} />
                </HStack>
                {copyNote != null && (
                  <Text type="supporting" color="secondary">
                    {copyNote}
                  </Text>
                )}
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
