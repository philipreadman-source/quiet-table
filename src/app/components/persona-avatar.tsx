'use client';

import {Avatar, type AvatarSize} from '@astryxdesign/core/Avatar';

type PersonaAvatarProps = {
  name: string;
  friendId?: string;
  avatarSrc?: string;
  displayName?: string;
  size?: AvatarSize;
  alt?: string;
};

export function PersonaAvatar({
  name,
  avatarSrc,
  displayName,
  size = 20,
  alt,
}: PersonaAvatarProps) {
  const label = displayName ?? name.trim();
  if (label.length === 0) return null;

  return (
    <Avatar
      src={avatarSrc}
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
