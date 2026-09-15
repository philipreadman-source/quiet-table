'use client';

import {useUser} from '@clerk/nextjs';
import {ProfileAccountMenu} from '@/app/components/profile-account-menu';
import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {PrincipalAvatar} from '@/app/components/persona-avatar';
import {ProfileTasteQuizSection} from '@/app/components/profile-taste-quiz';
import {
  buildOnboardingSummaryRows,
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
    const next = refreshTasteConfidence({
      ...profile,
      username: validated.value,
      homeArea,
      updatedAt: new Date().toISOString(),
    });
    saveTasteProfile(next);
    onProfileSaved(next);
    setSaveNote('Profile saved.');
  };

  const dirty =
    usernameInput.trim().toLowerCase() !== profile.username ||
    (homeAreaInput.trim() || 'Amsterdam') !== profile.homeArea;

  return (
    <VStack style={panel} gap={4} align="stretch">
      <HStack gap={3} vAlign="center" hAlign="between" style={{width: '100%'}}>
        <HStack gap={3} vAlign="center">
          <PrincipalAvatar username={profile.username} avatarSrc={profile.avatarSrc} size={48} />
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
            {summaryRows.map((row) => (
              <VStack key={row.label} gap={0}>
                <Text type="supporting" color="secondary">
                  {row.label}
                </Text>
                <Text type="label">{row.value}</Text>
              </VStack>
            ))}
          </VStack>
        </Card>
        </VStack>
      </VStack>

      <ProfileTasteQuizSection profile={profile} onProfileSaved={onProfileSaved} />
    </VStack>
  );
}
