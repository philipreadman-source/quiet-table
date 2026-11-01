'use client';

import {useAuth, useUser} from '@clerk/nextjs';
import {mergeClerkUserIntoProfile} from '@/lib/clerk-profile';
import {useCallback, useEffect, useMemo, useState, type CSSProperties} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Share2} from 'lucide-react';
import {VStack, Layout, LayoutContent, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Avatar} from '@astryxdesign/core/Avatar';
import {findVenueOption} from '@/lib/venue-options';
import {createPlaceSearchSource, type PlaceItem} from '@/lib/place-search';
import {quizCityArea, type TasteQuizVenue} from '@/lib/taste-quiz';
import {
  applyVenueReaction,
  createEmptyTasteProfile,
  CUISINE_OPTIONS,
  finishOnboarding,
  hasOnboardingUsername,
  isOnboardingComplete,
  formatInviteSentSummary,
  inviteShareMessage,
  inviteShareUrl,
  recordProfileInviteSent,
  markStepSkipped,
  ONBOARDING_STEP_ORDER,
  refreshTasteConfidence,
  saveTasteProfile,
  validateHomeArea,
  validateUsername,
  type CuisineId,
  type OnboardingStepId,
  type TasteProfile,
  type VenueReaction,
} from '@/lib/taste-profile';
import {consumePendingInviteRef} from '@/lib/taste-profile-session';

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

/** Ratings needed to finish the quiz. "Never been" doesn't count: it moves on
 * to another place, fetching more when the list runs out. */
const QUIZ_REQUIRED_RATINGS = 3;
const QUIZ_FETCH_MORE = 5;

const REACTION_OPTIONS: {id: VenueReaction; label: string}[] = [
  {id: 'love', label: 'Love it'},
  {id: 'fine', label: 'Fine'},
  {id: 'not_for_me', label: 'Not for me'},
  {id: 'never_been', label: 'Never been'},
];

function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referrerId = searchParams.get('ref');
  const {userId: clerkUserId, isLoaded: isAuthLoaded} = useAuth();
  const {user: clerkUser} = useUser();

  const [profileReady, setProfileReady] = useState(false);
  const [step, setStep] = useState<OnboardingStepId>('basics');
  // Intro shown before step 1. Only applies on 'basics', so anyone resuming
  // partway through onboarding goes straight back to their step.
  const [showWelcome, setShowWelcome] = useState(true);
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [homeAreaInput, setHomeAreaInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [homeAreaError, setHomeAreaError] = useState<string | null>(null);
  // Location is the base for every search, so it's picked from real cities
  // as you type ("London, England", "Amsterdam, Netherlands"), not free text.
  const citySearchSource = useMemo(() => createPlaceSearchSource('city'), []);
  const selectedCity: PlaceItem | null =
    homeAreaInput.trim().length > 0
      ? {id: 'selected-city', label: homeAreaInput, auxiliaryData: {location: homeAreaInput}}
      : null;
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizVenues, setQuizVenues] = useState<TasteQuizVenue[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizRatedCount, setQuizRatedCount] = useState(0);
  const [quizFetchingMore, setQuizFetchingMore] = useState(false);
  // No more places to show: the quiz can't reach 3 ratings, so let them continue.
  const [quizExhausted, setQuizExhausted] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'vibe' || step === 'last_meal') setStep('cuisine');
  }, [step]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    if (clerkUserId == null) {
      router.replace('/sign-in');
      return;
    }

    if (searchParams.get('reset') === '1') {
      const fresh = createEmptyTasteProfile(clerkUserId);
      saveTasteProfile(fresh);
      setProfile(fresh);
      setUsernameInput('');
      setHomeAreaInput('');
      setHomeAreaError(null);
      setStep('basics');
      setShowWelcome(true);
      setQuizIndex(0);
      setQuizVenues([]);
      setQuizError(null);
      setProfileReady(true);
      window.history.replaceState(null, '', '/onboarding');
      return;
    }

    let cancelled = false;
    void import('@/lib/profile-sync').then(({hydrateTasteProfileWithServer}) =>
      hydrateTasteProfileWithServer(clerkUserId),
    ).then((hydrated) => {
      const inviteRef = referrerId?.trim() || consumePendingInviteRef();
      let next = hydrated;
      if (
        inviteRef != null &&
        inviteRef.length > 0 &&
        !hydrated.social.friendUserIds.includes(inviteRef)
      ) {
        next = {
          ...hydrated,
          social: {
            ...hydrated.social,
            friendUserIds: [...hydrated.social.friendUserIds, inviteRef],
          },
        };
        saveTasteProfile(next);
      }
      if (cancelled) return;
      if (isOnboardingComplete(next)) {
        router.replace('/');
        return;
      }
      setProfile(next);
      setUsernameInput(next.username);
      setHomeAreaInput(next.homeArea);
      setProfileReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, isAuthLoaded, clerkUserId, referrerId]);

  const quizHomeArea = profile?.homeArea.trim() ?? '';
  const quizCuisinesKey = (profile?.preferences.cuisineAffinities ?? []).join(',');

  useEffect(() => {
    if (step !== 'venue_quiz') return;

    let cancelled = false;
    const area = quizHomeArea;
    if (area.length < 2) {
      setQuizVenues([]);
      setQuizError('Add your location on the first step, then come back to the quiz.');
      setQuizLoading(false);
      return;
    }

    setQuizLoading(true);
    setQuizError(null);
    setQuizIndex(0);
    setQuizRatedCount(0);
    setQuizExhausted(false);

    const params = new URLSearchParams({area});
    if (quizCuisinesKey.length > 0) params.set('cuisines', quizCuisinesKey);

    void fetch(`/api/onboarding/quiz-venues?${params.toString()}`)
      .then(async (res) => {
        const payload = (await res.json()) as {venues?: TasteQuizVenue[]; error?: string};
        if (!res.ok) throw new Error(payload.error ?? 'Could not load quiz venues');
        return payload.venues ?? [];
      })
      .then((venues) => {
        if (cancelled) return;
        setQuizVenues(venues);
        if (venues.length === 0) {
          setQuizError(`No restaurants found in ${quizCityArea(area)}. You can skip this step.`);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setQuizVenues([]);
        setQuizError(error instanceof Error ? error.message : 'Could not load quiz venues');
      })
      .finally(() => {
        if (!cancelled) setQuizLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, quizHomeArea, quizCuisinesKey]);

  const persist = useCallback(
    (next: TasteProfile) => {
      const withClerk = mergeClerkUserIntoProfile(next, clerkUser);
      const refreshed = refreshTasteConfidence(withClerk);
      setProfile(refreshed);
      saveTasteProfile(refreshed);
      return refreshed;
    },
    [clerkUser],
  );

  useEffect(() => {
    if (profile == null || clerkUser == null) return;
    const merged = mergeClerkUserIntoProfile(profile, clerkUser);
    if (merged === profile) return;
    setProfile(merged);
    saveTasteProfile(merged);
  }, [clerkUser, profile]);

  const stepNumber = stepIndex(step) + 1;
  const inviteUrl = useMemo(
    () => (profile != null ? inviteShareUrl(profile.userId) : ''),
    [profile],
  );
  const invitesSent = profile?.social.invites.sent.length ?? 0;

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

  const skipStep = () => {
    if (profile == null) return;
    advanceFrom(step, markStepSkipped(profile, step));
  };

  const finish = (next: TasteProfile) => {
    persist(finishOnboarding(next));
    router.push('/');
  };

  const handleBasicsContinue = () => {
    if (profile == null) return;
    const validated = validateUsername(usernameInput);
    if (!validated.ok) {
      setUsernameError(validated.error);
      return;
    }
    const areaCheck = validateHomeArea(homeAreaInput);
    if (!areaCheck.ok) {
      setHomeAreaError(areaCheck.error);
      return;
    }
    setUsernameError(null);
    setHomeAreaError(null);
    advanceFrom('basics', {
      ...profile,
      username: validated.value,
      homeArea: areaCheck.value,
    });
  };

  const toggleCuisine = (id: CuisineId) => {
    if (profile == null) return;
    const current = profile.preferences.cuisineAffinities ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    persist({...profile, preferences: {...profile.preferences, cuisineAffinities: next}});
  };

  const handleQuizReaction = (reaction: VenueReaction) => {
    if (profile == null) return;
    const venue = quizVenues[quizIndex];
    if (venue == null) return;
    const next = applyVenueReaction(profile, venue.id, reaction, venue);
    persist(next);
    const rated = reaction === 'never_been' ? quizRatedCount : quizRatedCount + 1;
    setQuizRatedCount(rated);
    if (rated >= QUIZ_REQUIRED_RATINGS) {
      advanceFrom('venue_quiz', next);
      setQuizIndex(0);
      setQuizRatedCount(0);
      return;
    }
    if (quizIndex < quizVenues.length - 1) {
      setQuizIndex((i) => i + 1);
      return;
    }
    void loadMoreQuizVenues();
  };

  // Out of places before 3 ratings: fetch more, skipping ones already shown.
  const loadMoreQuizVenues = async () => {
    setQuizFetchingMore(true);
    const params = new URLSearchParams({
      area: quizHomeArea,
      limit: String(QUIZ_FETCH_MORE),
      exclude: quizVenues.map((v) => v.id).join(','),
    });
    if (quizCuisinesKey.length > 0) params.set('cuisines', quizCuisinesKey);
    try {
      const res = await fetch(`/api/onboarding/quiz-venues?${params.toString()}`);
      const payload = (await res.json()) as {venues?: TasteQuizVenue[]};
      const more = res.ok ? (payload.venues ?? []) : [];
      if (more.length === 0) {
        setQuizExhausted(true);
        return;
      }
      setQuizVenues((prev) => [...prev, ...more]);
      setQuizIndex((i) => i + 1);
    } catch {
      setQuizExhausted(true);
    } finally {
      setQuizFetchingMore(false);
    }
  };

  const recordInviteSent = (channel: 'share_sheet' | 'copy_link') => {
    if (profile == null) return;
    persist(recordProfileInviteSent(profile, channel));
  };

  const shareInvite = async () => {
    if (profile == null) return;
    const message = inviteShareMessage(profile.username || 'Someone', inviteUrl);
    if (typeof navigator !== 'undefined' && navigator.share != null) {
      try {
        await navigator.share({title: 'Quiet Table', text: message, url: inviteUrl});
        recordInviteSent('share_sheet');
        setCopyNote('Invite shared.');
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      recordInviteSent('copy_link');
      setCopyNote('Invite link copied.');
    } catch {
      setCopyNote('Could not share — copy the link from your browser bar.');
    }
  };

  const quizVenue = quizVenues[quizIndex];
  const quizKnown = quizVenue != null ? findVenueOption(quizVenue.id) : undefined;

  if (!isAuthLoaded || clerkUserId == null || !profileReady || profile == null) {
    return (
      <Layout
        height="fill"
        content={
          <LayoutContent>
            <VStack gap={2} style={shell}>
              <Text color="secondary">Setting up your taste profile…</Text>
            </VStack>
          </LayoutContent>
        }
      />
    );
  }

  const quizAreaLabel = quizCityArea(profile.homeArea.trim());

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent>
          <VStack gap={4} style={shell}>
            {step === 'basics' && showWelcome ? (
              <VStack gap={3}>
                <HStack gap={2} vAlign="center">
                  {Q_AVATAR}
                  <Text type="label" weight="semibold">
                    Welcome to Quiet Table
                  </Text>
                </HStack>
                <Text>
                  Quiet Table helps you find great places to eat, based on your taste and your friends&apos;
                  recommendations.
                </Text>
                <Text color="secondary">
                  Just tell us what you like and rate the restaurants you go to. It takes under a minute to get
                  started, and your results get better the more you feed it (hehe).
                </Text>
                <HStack gap={2} wrap="wrap">
                  <Button label="Get started" onClick={() => setShowWelcome(false)} />
                </HStack>
              </VStack>
            ) : (
            <HStack gap={2} vAlign="center">
              {Q_AVATAR}
              <Text type="supporting" color="secondary">
                Step {stepNumber} of {ONBOARDING_STEP_ORDER.length}
              </Text>
            </HStack>
            )}

            {step === 'basics' && !showWelcome && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  First, the basics
                </Text>
                <TextInput
                  label="Username"
                  value={usernameInput}
                  onChange={setUsernameInput}
                  placeholder="yourname"
                  status={
                    usernameError != null ? {type: 'error', message: usernameError} : undefined
                  }
                />
                <Typeahead
                  label="Location"
                  placeholder="Start typing a city"
                  searchSource={citySearchSource}
                  value={selectedCity}
                  onChange={(item) => {
                    setHomeAreaInput(item?.auxiliaryData?.location ?? '');
                    setHomeAreaError(null);
                  }}
                  debounceMs={300}
                  emptySearchResultsText="No cities found"
                  status={
                    homeAreaError != null ? {type: 'error', message: homeAreaError} : undefined
                  }
                />
                <Text type="supporting" color="secondary">
                  We&apos;ll use your location to base your initial taste profile on. You can still search anywhere.
                </Text>
                <HStack gap={2} wrap="wrap">
                  <Button label="Continue" onClick={handleBasicsContinue} />
                </HStack>
              </VStack>
            )}

            {step === 'cuisine' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  What do you crave?
                </Text>
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

            {step === 'venue_quiz' && quizLoading && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Have you eaten here?
                </Text>
                <Text color="secondary">Finding places in {quizAreaLabel}…</Text>
              </VStack>
            )}

            {step === 'venue_quiz' && !quizLoading && quizError != null && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Have you eaten here?
                </Text>
                <Text color="secondary">{quizError}</Text>
                <Button label="Skip quiz" variant="ghost" onClick={skipStep} />
              </VStack>
            )}

            {step === 'venue_quiz' && !quizLoading && quizVenue != null && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Have you eaten here?
                </Text>
                <Text color="secondary">
                  {quizRatedCount} of {QUIZ_REQUIRED_RATINGS} rated
                  {(profile.preferences.cuisineAffinities?.length ?? 0) > 0
                    ? ` · picked for your cravings`
                    : ` · popular in ${quizAreaLabel}`}
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
                    {(quizKnown?.subtitle ?? quizVenue.subtitle) != null && (
                      <Text type="supporting" color="secondary">
                        {quizKnown?.subtitle ?? quizVenue.subtitle}
                      </Text>
                    )}
                  </VStack>
                </SelectableCard>
                {quizExhausted ? (
                  <VStack gap={2}>
                    <Text color="secondary">
                      That&apos;s every place we could find near you for now. You can carry on.
                    </Text>
                    <HStack gap={2} wrap="wrap">
                      <Button label="Continue" onClick={() => advanceFrom('venue_quiz', profile)} />
                    </HStack>
                  </VStack>
                ) : (
                  <HStack gap={2} wrap="wrap">
                    {REACTION_OPTIONS.map((option) => (
                      <Button
                        key={option.id}
                        label={option.label}
                        variant="secondary"
                        size="sm"
                        isDisabled={quizFetchingMore}
                        onClick={() => handleQuizReaction(option.id)}
                      />
                    ))}
                  </HStack>
                )}
                {quizFetchingMore && <Text color="secondary">Finding another place…</Text>}
              </VStack>
            )}

            {step === 'invite_friends' && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Who has great taste?
                </Text>
                <Text color="secondary">
                  Share your link with people whose restaurant picks you&apos;d actually take. When
                  they&apos;re on Quiet Table, you&apos;ll see where they&apos;ve been — no reviews,
                  just taste.
                </Text>
                <Text type="supporting" color="secondary">
                  {formatInviteSentSummary(invitesSent)}
                </Text>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Button
                    label="Share invite"
                    icon={<Share2 size={18} />}
                    isIconOnly
                    variant="secondary"
                    onClick={() => void shareInvite()}
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
