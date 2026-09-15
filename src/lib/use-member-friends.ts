'use client';

import {useEffect, useState} from 'react';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';

export function useMemberFriends(): {members: FriendFoodProfile[]; loading: boolean} {
  const [members, setMembers] = useState<FriendFoodProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/members')
      .then(async (res) => {
        if (!res.ok) return [] as FriendFoodProfile[];
        const body = (await res.json()) as {members?: FriendFoodProfile[]};
        return body.members ?? [];
      })
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {members, loading};
}
