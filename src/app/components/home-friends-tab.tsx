'use client';

import {useUser} from '@clerk/nextjs';
import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Text} from '@astryxdesign/core/Text';
import {type FriendFoodProfile, type FriendPick} from '@/lib/friend-graph-mock';
import {mergeClerkUserIntoProfile} from '@/lib/clerk-profile';
import {tasteProfileToFriendFoodProfile} from '@/lib/member-friends';
import {fetchTasteProfileFromServer} from '@/lib/profile-sync';
import {hasOnboardingUsername} from '@/lib/taste-profile';
import {useMemberFriends} from '@/lib/use-member-friends';
import {VenueGoogleMapsPin} from '@/app/components/venue-google-maps-pin';
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

type RosterEntry = {
  friend: FriendFoodProfile;
  isSelf: boolean;
};

function FriendAvatarChip({
  entry,
  selected,
  onSelect,
}: {
  entry: RosterEntry;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}) {
  const {friend, isSelf} = entry;
  const caption = isSelf ? 'You' : friend.name;

  return (
    <SelectableCard
      label={isSelf ? 'You' : friend.fullName}
      width={72}
      padding={3}
      isSelected={selected}
      onChange={onSelect}>
      <VStack gap={1} hAlign="center">
        <Avatar
          src={friend.avatarSrc}
          name={friend.fullName}
          alt={friend.fullName}
        size={48}
      />
        <Text type="label" weight={selected ? 'semibold' : undefined} justify="center">
          {caption}
        </Text>
      </VStack>
    </SelectableCard>
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
    <Card padding={3} style={visitCardShell}>
      <VStack gap={0}>
          <HStack gap={1} vAlign="start" style={{width: '100%'}}>
            <Text type="label" weight="semibold" style={{flex: 1, minWidth: 0}}>
              {venue.title}
            </Text>
            <VenueGoogleMapsPin venue={venue} size={18} />
          </HStack>
          {venue.subtitle != null && (
            <Text type="supporting" color="secondary">
              {venue.subtitle}
            </Text>
          )}
          <Text type="supporting" color="secondary">
            {pick.note}
          </Text>
      </VStack>
    </Card>
  );
}

export function HomeFriendsTabPanel() {
  const {user} = useUser();
  const {members, loading} = useMemberFriends(user?.id);
  const [selfFriend, setSelfFriend] = useState<FriendFoodProfile | null>(null);

  useEffect(() => {
    const userId = user?.id?.trim();
    if (userId == null || userId.length === 0) {
      setSelfFriend(null);
      return;
    }

    let cancelled = false;
    void fetchTasteProfileFromServer().then((profile) => {
      if (cancelled || profile == null || !hasOnboardingUsername(profile)) {
        if (!cancelled) setSelfFriend(null);
        return;
      }
      const merged = mergeClerkUserIntoProfile(profile, user);
      if (!cancelled) setSelfFriend(tasteProfileToFriendFoodProfile(merged));
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const otherMembers = members;

  const roster = useMemo((): RosterEntry[] => {
    const list: RosterEntry[] = [];
    if (selfFriend != null) list.push({friend: selfFriend, isSelf: true});
    for (const friend of otherMembers) {
      if (selfFriend != null && friend.id === selfFriend.id) continue;
      list.push({friend, isSelf: false});
    }
    return list;
  }, [selfFriend, otherMembers]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEntry =
    selectedId != null ? roster.find((entry) => entry.friend.id === selectedId) : undefined;
  const selected = selectedEntry?.friend;
  const selectedIsSelf = selectedEntry?.isSelf ?? false;
  const lovedOrLiked = selected?.topPicks ?? [];
  const mayLike = selected?.suggestedPicks ?? [];

  return (
    <VStack style={panel} gap={4} align="stretch">
      <Text type="label" weight="semibold">
        See where everyone ate
      </Text>
      <Text type="supporting" color="secondary">
        In beta, every member shares taste.
      </Text>

      {loading && (
        <Text type="supporting" color="secondary">
          Loading members…
        </Text>
      )}

      {!loading && roster.length === 0 && (
        <Text type="supporting" color="secondary">
          No one else on the member list yet. Ask friends to sign up on this app, finish onboarding
          with a username, and save their profile — then reload this tab.
        </Text>
      )}

      {!loading && roster.length > 0 && otherMembers.length === 0 && selfFriend != null && (
        <Text type="supporting" color="secondary">
          You&apos;re on the list — invite others to sign up and save a profile to see them here.
        </Text>
      )}

      {roster.length > 0 && (
        <HStack gap={2} wrap="wrap" vAlign="start">
          {roster.map((entry) => (
            <FriendAvatarChip
              key={entry.friend.id}
              entry={entry}
              selected={selectedId === entry.friend.id}
              onSelect={(isSelected) => setSelectedId(isSelected ? entry.friend.id : null)}
            />
          ))}
        </HStack>
      )}

      {selectedId != null && selected != null && (
        <VStack
          gap={3}
          align="start"
          style={{
            width: '100%',
            marginTop: 'var(--spacing-8)',
          }}>
          <Text type="label" weight="semibold">
            {selectedIsSelf ? 'Restaurants you loved or liked' : 'Restaurants they loved or liked'}
          </Text>
          {lovedOrLiked.length === 0 ? (
            <Text type="supporting" color="secondary">
              {selectedIsSelf
                ? 'Nothing here yet — add places from Profile after a visit.'
                : 'Nothing from onboarding yet — they can add places from Profile after a visit.'}
            </Text>
          ) : (
            lovedOrLiked.map((pick) => <FriendVisitCard key={pick.venueId} pick={pick} />)
          )}

          {mayLike.length > 0 && (
            <>
              <Text type="label" weight="semibold" style={{marginTop: 'var(--spacing-6)'}}>
                {selectedIsSelf ? 'Restaurants you may like' : 'Restaurants they may like'}
              </Text>
              {mayLike.map((pick) => (
                <FriendVisitCard key={`suggest-${pick.venueId}`} pick={pick} />
              ))}
            </>
          )}
        </VStack>
      )}
    </VStack>
  );
}
