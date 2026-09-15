'use client';

import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {PersonaAvatar} from '@/app/components/persona-avatar';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';

type WizardGoingWithStepProps = {
  intentLead?: string | null;
  friends: readonly FriendFoodProfile[];
  selectedFriendIds: string[];
  onToggleFriend: (friendId: string, selected: boolean) => void;
  onSkip: () => void;
  onContinue: () => void;
};

export function WizardGoingWithStep({
  intentLead,
  friends,
  selectedFriendIds,
  onToggleFriend,
  onSkip,
  onContinue,
}: WizardGoingWithStepProps) {
  const question =
    intentLead != null && intentLead.length > 0
      ? `${intentLead} Who are you going with?`
      : 'Who are you going with?';

  return (
    <VStack gap={3}>
      <Text>{question}</Text>
      <HStack gap={2} wrap="wrap" vAlign="start">
        {friends.map((friend) => {
          const selected = selectedFriendIds.includes(friend.id);
          return (
            <SelectableCard
              key={friend.id}
              label={friend.fullName}
              width={72}
              style={{padding: 'var(--spacing-3)'}}
              isSelected={selected}
              onChange={(isSelected) => onToggleFriend(friend.id, isSelected)}>
              <VStack gap={1} hAlign="center">
                <PersonaAvatar
                  name={friend.name}
                  friendId={friend.id}
                  avatarSrc={friend.avatarSrc}
                  displayName={friend.fullName}
                  size={40}
                />
                <Text type="label" weight="semibold" justify="center">
                  {friend.name}
                </Text>
              </VStack>
            </SelectableCard>
          );
        })}
      </HStack>
      <HStack hAlign="start">
        <Button label="Skip this step" variant="ghost" size="sm" onClick={onSkip} />
      </HStack>
      {selectedFriendIds.length > 0 && (
        <HStack hAlign="start">
          <Button label="Continue" variant="primary" onClick={onContinue} />
        </HStack>
      )}
    </VStack>
  );
}
