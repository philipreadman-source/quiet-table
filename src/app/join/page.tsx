'use client';

import {Suspense, useEffect} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {createEmptyTasteProfile, loadTasteProfile, saveTasteProfile} from '@/lib/taste-profile';

function JoinRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  useEffect(() => {
    const profile = loadTasteProfile() ?? createEmptyTasteProfile();
    if (ref != null && ref.length > 0 && !profile.social.friendUserIds.includes(ref)) {
      saveTasteProfile({
        ...profile,
        social: {
          ...profile.social,
          friendUserIds: [...profile.social.friendUserIds, ref],
        },
      });
    }
    router.replace(ref != null ? `/onboarding?ref=${encodeURIComponent(ref)}` : '/onboarding');
  }, [ref, router]);

  return null;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinRedirect />
    </Suspense>
  );
}
