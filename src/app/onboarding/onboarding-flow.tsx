'use client';

import {useCallback, useEffect, useMemo, useState, type CSSProperties} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Share2} from 'lucide-react';
import {VStack, Layout, LayoutContent, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Avatar} from '@astryxdesign/core/Avatar';
import tasteQuizVenues from '@/data/taste-quiz-venues.json';
import {findVenueOption} from '@/lib/venue-options';
import {
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

  const [step, setStep] = useState<OnboardingStepId>('basics');
  const [profile, setProfile] = useState<TasteProfile>(() => loadTasteProfile() ?? createEmptyTasteProfile());
  const [usernameInput, setUsernameInput] = useState(profile.username);
  const [homeAreaInput, setHomeAreaInput] = useState(profile.homeArea);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'vibe' || step === 'last_meal') setStep('cuisine');
  }, [step]);

  useEffect(() => {
    if (searchParams.get('reset') === '1') {
      const fresh = createEmptyTasteProfile();
      saveTasteProfile(fresh);
      setProfile(fresh);
      setUsernameInput('');
      setHomeAreaInput('Amsterdam');
      setStep('basics');
      setQuizIndex(0);
      window.history.replaceState(null, '', '/onboarding');
      return;
    }

    const existing = loadTasteProfile();
    if (existing != null && hasOnboardingUsername(existing) && existing.onboarding.completedAt != null) {
      router.replace('/');
    }
  }, [router, searchParams]);

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

  const recordInviteSent = (channel: 'share_sheet' | 'copy_link') => {
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
                  label="Location"
                  value={homeAreaInput}
                  onChange={setHomeAreaInput}
                  placeholder="Amsterdam"
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
