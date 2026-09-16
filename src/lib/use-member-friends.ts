'use client';

import {useEffect, useState} from 'react';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';

export function useMemberFriends(clerkUserId: string | null | undefined): {
  members: FriendFoodProfile[];
  loading: boolean;
  error: string | null;
} {
  const [members, setMembers] = useState<FriendFoodProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = clerkUserId?.trim();
    if (userId == null || userId.length === 0) {
      setMembers([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetch('/api/members', {credentials: 'same-origin'})
      .then(async (res) => {
        const body = (await res.json()) as {members?: FriendFoodProfile[]; error?: string};
        if (res.status === 401) {
          throw new Error('Sign in to see members.');
        }
        if (!res.ok) {
          throw new Error(body.error ?? 'Could not load members.');
        }
        return body.members ?? [];
      })
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMembers([]);
          setError(err instanceof Error ? err.message : 'Could not load members.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clerkUserId]);

  return {members, loading, error};
}

/** Demo personas only for local UI work — never on production. */
export function shouldUseDemoFriendFallback(memberCount: number): boolean {
  return process.env.NODE_ENV === 'development' && memberCount === 0;
}
