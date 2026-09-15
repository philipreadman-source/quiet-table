'use client';

import {useAuth} from '@clerk/nextjs';
import {useCallback, useEffect, useMemo, useState, type CSSProperties} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Share2} from 'lucide-react';
import {VStack, Layout, LayoutContent, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Avatar} from '@astryxdesign/core/Avatar';
import {findVenueOption} from '@/lib/venue-options';
import type {TasteQuizVenue} from '@/lib/taste-quiz';
import {
  applyVenueReaction,
  createEmptyTasteProfile,
  CUISINE_OPTIONS,
  finishOnboarding,
  hasOnboardingUsername,
  isOnboardingComplete,
  inviteShareMessage,
  inviteShareUrl,
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
import {consumePendingInviteRef, localTasteProfileForUser} from '@/lib/taste-profile-session';

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

  const [profileReady, setProfileReady] = useState(false);
  const [step, setStep] = useState<OnboardingStepId>('basics');
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [homeAreaInput, setHomeAreaInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [homeAreaError, setHomeAreaError] = useState<string | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizVenues, setQuizVenues] = useState<TasteQuizVenue[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'vibe' || step === 'last_meal') setStep('cuisine');
  }, [step]);

  useEffect(() => {
    if (!isAuthLoaded || clerkUserId == null) return;

    if (searchParams.get('reset') === '1') {
      const fresh = createEmptyTasteProfile(clerkUserId);
      saveTasteProfile(fresh);
      setProfile(fresh);
      setUsernameInput('');
      setHomeAreaInput('');
      setHomeAreaError(null);
      setStep('basics');
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

  useEffect(() => {
    if (step !== 'venue_quiz' || profile == null) return;

    let cancelled = false;
    const cuisines = profile.preferences.cuisineAffinities ?? [];
    const area = profile.homeArea.trim();
    if (area.length < 2) {
      setQuizVenues([]);
      setQuizError('Add your location on the first step, then come back to the quiz.');
      setQuizLoading(false);
      return;
    }

    setQuizLoading(true);
    setQuizError(null);
    setQuizIndex(0);

    const params = new URLSearchParams({area});
    if (cuisines.length > 0) params.set('cuisines', cuisines.join(','));

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
          setQuizError(`No restaurants found near ${area}. You can skip this step.`);
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
  }, [step, profile]);

  const persist = useCallback((next: TasteProfile) => {
    const refreshed = refreshTasteConfidence(next);
    setProfile(refreshed);
    saveTasteProfile(refreshed);
    return refreshed;
  }, []);

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
    const next = applyVenueReaction(profile, venue.id, reaction);
    persist(next);
    if (quizIndex >= quizVenues.length - 1) {
      advanceFrom('venue_quiz', next);
      setQuizIndex(0);
      return;
    }
    setQuizIndex((i) => i + 1);
  };

  const recordInviteSent = (channel: 'share_sheet' | 'copy_link') => {
    if (profile == null) return;
    persist({
      ...profile,
      social: {
        ...profile.social,
        invites: {
          ...profile.social.invites,
          sent: [
            ...profile.social.invites.sent,
            {sentAt: new Date().toISOString(), channel},
          ],
        },
      },
    });
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

  const quizAreaLabel = profile.homeArea.trim();

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
                  placeholder="maya"
                  status={
                    usernameError != null ? {type: 'error', message: usernameError} : undefined
                  }
                />
                <TextInput
                  label="Location"
                  value={homeAreaInput}
                  onChange={setHomeAreaInput}
                  placeholder="City or neighborhood"
                  status={
                    homeAreaError != null ? {type: 'error', message: homeAreaError} : undefined
                  }
                />
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

            {step === 'venue_quiz' && quizLoading && (
              <VStack gap={3}>
                <Text type="label" weight="semibold">
                  Have you eaten here?
                </Text>
                <Text color="secondary">Finding places near {quizAreaLabel}…</Text>
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
                  {quizIndex + 1} of {quizVenues.length}
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
