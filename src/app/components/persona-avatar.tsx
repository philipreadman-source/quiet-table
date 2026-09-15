'use client';

import {Avatar, type AvatarSize} from '@astryxdesign/core/Avatar';
import {getFriendFoodProfile} from '@/lib/friend-graph-mock';

type PersonaAvatarProps = {
  name: string;
  friendId?: string;
  /** When set, skips demo friend graph (real Clerk members). */
  avatarSrc?: string;
  displayName?: string;
  size?: AvatarSize;
  alt?: string;
};

export function PersonaAvatar({
  name,
  friendId,
  avatarSrc,
  displayName,
  size = 20,
  alt,
}: PersonaAvatarProps) {
  const friend =
    avatarSrc == null && displayName == null
      ? ((friendId != null ? getFriendFoodProfile(friendId) : undefined) ??
        getFriendFoodProfile(name))
      : undefined;
  const label = displayName ?? friend?.fullName ?? name.trim();
  if (label.length === 0) return null;

  return (
    <Avatar
      src={avatarSrc ?? friend?.avatarSrc}
      name={label}
      alt={alt ?? label}
      size={size}
    />
  );
}

/** Signed-in principal (taste profile) — not in the friend graph. */
export function PrincipalAvatar({
  username,
  avatarSrc,
  size = 24,
}: {
  username: string;
  avatarSrc?: string;
  size?: AvatarSize;
}) {
  const label = username.trim();
  if (label.length === 0) return null;
  return <Avatar src={avatarSrc} name={label} alt={label} size={size} />;
}
