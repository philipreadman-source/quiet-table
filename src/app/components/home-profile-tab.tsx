'use client';

import {useUser} from '@clerk/nextjs';
import {ProfileAccountMenu} from '@/app/components/profile-account-menu';
import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {PrincipalAvatar} from '@/app/components/persona-avatar';
import {ProfileMyPlacesSection} from '@/app/components/profile-my-places';
import {
  ProfileTasteQuizSection,
  type ProfileTasteQuizHandle,
} from '@/app/components/profile-taste-quiz';
import {clerkDisplayName, mergeClerkUserIntoProfile} from '@/lib/clerk-profile';
import {
  buildOnboardingSummaryRows,
  inviteShareMessage,
  inviteShareUrl,
  recordProfileInviteSent,
  refreshTasteConfidence,
  saveTasteProfile,
  validateUsername,
  type TasteProfile,
} from '@/lib/taste-profile';

const panel: CSSProperties = {
  flex: 1,
  width: '100%',
  maxWidth: 800,
  minHeight: 0,
  overflow: 'auto',
  paddingBottom: 64,
};

export function HomeProfileTabPanel({
  profile,
  onProfileSaved,
}: {
  profile: TasteProfile;
  onProfileSaved: (next: TasteProfile) => void;
}) {
  const {user} = useUser();
  const summaryRows = useMemo(() => buildOnboardingSummaryRows(profile), [profile]);
  const emailLabel =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;
  const [usernameInput, setUsernameInput] = useState(profile.username);
  const [homeAreaInput, setHomeAreaInput] = useState(profile.homeArea);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [inviteShareNote, setInviteShareNote] = useState<string | null>(null);
  const [quizActive, setQuizActive] = useState(false);
  const quizRef = useRef<ProfileTasteQuizHandle>(null);

  const lovedQuizRowLabel = 'Loved in the quiz';
  const friendInvitesRowLabel = 'Friend invites';

  useEffect(() => {
    setUsernameInput(profile.username);
    setHomeAreaInput(profile.homeArea);
  }, [profile.username, profile.homeArea]);

  const handleSave = () => {
    setSaveNote(null);
    const validated = validateUsername(usernameInput);
    if (!validated.ok) {
      setUsernameError(validated.error);
      return;
    }
    setUsernameError(null);
    const homeArea = homeAreaInput.trim() || 'Amsterdam';
    const next = refreshTasteConfidence(
      mergeClerkUserIntoProfile(
        {
          ...profile,
          username: validated.value,
          homeArea,
          updatedAt: new Date().toISOString(),
        },
        user,
      ),
    );
    saveTasteProfile(next);
    onProfileSaved(next);
    setSaveNote('Profile saved.');
  };

  const dirty =
    usernameInput.trim().toLowerCase() !== profile.username ||
    (homeAreaInput.trim() || 'Amsterdam') !== profile.homeArea;

  const shareInviteLink = async () => {
    setInviteShareNote(null);
    const url = inviteShareUrl(profile.userId);
    const message = inviteShareMessage(profile.username || clerkDisplayName(profile) || 'Someone', url);
    if (typeof navigator !== 'undefined' && navigator.share != null) {
      try {
        await navigator.share({title: 'Quiet Table', text: message, url});
        const next = recordProfileInviteSent(profile, 'share_sheet');
        saveTasteProfile(next);
        onProfileSaved(next);
        setInviteShareNote('Invite shared.');
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      const next = recordProfileInviteSent(profile, 'copy_link');
      saveTasteProfile(next);
      onProfileSaved(next);
      setInviteShareNote('Invite link copied.');
    } catch {
      setInviteShareNote('Could not copy — try again.');
    }
  };

  return (
    <VStack style={panel} gap={4} align="stretch">
      <HStack gap={3} vAlign="center" hAlign="between" style={{width: '100%'}}>
        <HStack gap={3} vAlign="center">
          <PrincipalAvatar
            username={clerkDisplayName(profile) || profile.username}
            avatarSrc={profile.clerk?.imageUrl ?? profile.avatarSrc}
            size={48}
          />
          <VStack gap={0}>
            <Text type="label" weight="semibold">
              Your profile
            </Text>
            <Text type="supporting" color="secondary">
              {emailLabel != null ? emailLabel : 'From onboarding — edit anytime.'}
            </Text>
          </VStack>
        </HStack>
        <ProfileAccountMenu />
      </HStack>

      <VStack gap={0} align="stretch">
        <VStack gap={3} align="stretch">
          <TextInput
            label="Username"
            value={usernameInput}
            onChange={setUsernameInput}
            placeholder="philip"
            status={usernameError != null ? {type: 'error', message: usernameError} : undefined}
          />
          <TextInput
            label="Location"
            value={homeAreaInput}
            onChange={setHomeAreaInput}
            placeholder="Amsterdam"
          />
          <HStack hAlign="start">
            <Button label="Save" onClick={handleSave} isDisabled={!dirty} />
          </HStack>
          {saveNote != null && (
            <Banner status="success" title={saveNote} />
          )}
        </VStack>

        <VStack gap={2} align="stretch" style={{marginTop: 'var(--spacing-8)'}}>
          <Text type="label" weight="semibold">
            Onboarding summary
          </Text>
        <Card padding={4}>
          <VStack gap={2} align="stretch">
            {summaryRows.map((row) => {
              const isLovedQuiz = row.label === lovedQuizRowLabel;
              const isFriendInvites = row.label === friendInvitesRowLabel;
              return (
                <VStack key={row.label} gap={0}>
                  <Text type="supporting" color="secondary">
                    {row.label}
                  </Text>
                  <HStack
                    hAlign="between"
                    vAlign="center"
                    gap={3}
                    style={{width: '100%'}}>
                    <Text type="label" style={{flex: 1, minWidth: 0}}>
                      {row.value}
                    </Text>
                    {isLovedQuiz && !quizActive && (
                      <Button
                        label="Start another round"
                        variant="secondary"
                        size="sm"
                        onClick={() => quizRef.current?.startQuiz()}
                      />
                    )}
                    {isFriendInvites && (
                      <Button
                        label="Share link"
                        variant="secondary"
                        size="sm"
                        onClick={() => void shareInviteLink()}
                      />
                    )}
                  </HStack>
                  {isFriendInvites && inviteShareNote != null && (
                    <Text type="supporting" color="secondary">
                      {inviteShareNote}
                    </Text>
                  )}
                </VStack>
              );
            })}
            {!summaryRows.some((row) => row.label === lovedQuizRowLabel) && !quizActive && (
              <HStack hAlign="between" vAlign="center" style={{width: '100%'}}>
                <VStack gap={0}>
                  <Text type="supporting" color="secondary">
                    Venue quiz
                  </Text>
                  <Text type="label">Train your taste with new places</Text>
                </VStack>
                <Button
                  label="Start another round"
                  variant="secondary"
                  size="sm"
                  onClick={() => quizRef.current?.startQuiz()}
                />
              </HStack>
            )}
          </VStack>
        </Card>
        <ProfileTasteQuizSection
          ref={quizRef}
          profile={profile}
          onProfileSaved={onProfileSaved}
          onActiveChange={setQuizActive}
        />
        </VStack>
      </VStack>

      <VStack gap={0} align="stretch">
        <ProfileMyPlacesSection profile={profile} onProfileSaved={onProfileSaved} />
      </VStack>
    </VStack>
  );
}
