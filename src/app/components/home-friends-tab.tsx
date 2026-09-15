'use client';

import {useMemo, useState, type CSSProperties} from 'react';
import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  friendShowsOnlineInDemo,
  listFriendsForFriendsTab,
  recentFriendVisits,
  type FriendFoodProfile,
  type FriendPick,
} from '@/lib/friend-graph-mock';
import {useMemberFriends} from '@/lib/use-member-friends';
import {enrichVenueOption, findVenueOption} from '@/lib/venue-options';

const panel: CSSProperties = {
  flex: 1,
  width: '100%',
  maxWidth: 800,
  minHeight: 0,
  overflow: 'auto',
};

const visitCardShell: CSSProperties = {
  width: '50%',
  maxWidth: 400,
  alignSelf: 'flex-start',
};

const visitImage: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'cover',
  borderRadius: 'var(--radius-md)',
  display: 'block',
  backgroundColor: 'var(--color-bg-secondary)',
};

function FriendAvatarChip({
  friend,
  selected,
  onSelect,
}: {
  friend: FriendFoodProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  const online = friendShowsOnlineInDemo(friend.id);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${friend.name}${online ? ', online' : ''}`}
      aria-pressed={selected}
      style={{
        background: 'none',
        border: 'none',
        padding: 4,
        cursor: 'pointer',
        borderRadius: '9999px',
        outline: selected ? '2px solid var(--color-border-emphasis)' : '2px solid transparent',
      }}>
      <Avatar
        src={friend.avatarSrc}
        name={friend.fullName}
        alt={friend.fullName}
        size={48}
        status={
          online ? (
            <AvatarStatusDot
              variant="success"
              label="Online"
              style={{width: 10, height: 10, borderWidth: 1}}
            />
          ) : undefined
        }
      />
    </button>
  );
}

function FriendVisitCard({pick}: {pick: FriendPick}) {
  const catalog = findVenueOption(pick.venueId);
  const venue = enrichVenueOption(
    catalog ?? {
      id: pick.venueId,
      title: pick.title,
      subtitle: pick.vibe,
      description: pick.note,
    },
  );

  return (
    <Card padding={0} style={visitCardShell}>
      <VStack gap={2}>
        {venue.image_url != null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venue.image_url} alt="" style={visitImage} />
        ) : (
          <div style={visitImage} aria-hidden />
        )}
        <VStack gap={0} style={{padding: 'var(--spacing-3)'}}>
          <Text type="label" weight="semibold">
            {venue.title}
          </Text>
          {venue.subtitle != null && (
            <Text type="supporting" color="secondary">
              {venue.subtitle}
            </Text>
          )}
          <Text type="supporting" color="secondary">
            {pick.note}
          </Text>
        </VStack>
      </VStack>
    </Card>
  );
}

export function HomeFriendsTabPanel() {
  const {members} = useMemberFriends();
  const friends = useMemo(
    () => (members.length > 0 ? members : listFriendsForFriendsTab()),
    [members],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    selectedId != null ? friends.find((friend) => friend.id === selectedId) : undefined;
  const visits = selected != null ? recentFriendVisits(selected, 2) : [];

  return (
    <VStack style={panel} gap={4} align="stretch">
      <Text type="label" weight="semibold">
        See where your friends ate
      </Text>

      <HStack gap={3} vAlign="center">
        {friends.map((friend) => (
          <FriendAvatarChip
            key={friend.id}
            friend={friend}
            selected={selectedId === friend.id}
            onSelect={() => setSelectedId(friend.id)}
          />
        ))}
      </HStack>

      {selectedId != null && selected != null && (
        <VStack
          gap={3}
          align="start"
          style={{
            width: '100%',
            marginTop: 'var(--spacing-8)',
          }}>
          <Text type="label" weight="semibold">
            {selected.name} recently enjoyed
          </Text>
          {visits.length === 0 ? (
            <Text type="supporting" color="secondary">
              No visits logged yet.
            </Text>
          ) : (
            visits.map((pick) => <FriendVisitCard key={pick.venueId} pick={pick} />)
          )}
        </VStack>
      )}
    </VStack>
  );
}
