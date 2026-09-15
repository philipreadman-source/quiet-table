'use client';

import {useClerk, useUser} from '@clerk/nextjs';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {Settings} from 'lucide-react';

export function ProfileAccountMenu() {
  const {signOut} = useClerk();
  const {user} = useUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  return (
    <Popover
      label="Account"
      placement="below"
      alignment="end"
      content={
        <VStack gap={3} style={{padding: 'var(--spacing-3)', minWidth: 220}}>
          {email != null && (
            <Text type="supporting" color="secondary">
              {email}
            </Text>
          )}
          <Button
            label="Sign out"
            variant="ghost"
            onClick={() => void signOut({redirectUrl: '/sign-in'})}
          />
        </VStack>
      }>
      {(triggerProps) => (
        <IconButton
          {...triggerProps}
          label="Account settings"
          variant="ghost"
          icon={<Settings size={18} strokeWidth={1.75} />}
        />
      )}
    </Popover>
  );
}
