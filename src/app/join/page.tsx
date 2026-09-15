'use client';

import {Suspense, useEffect} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {stashPendingInviteRef} from '@/lib/taste-profile-session';

function JoinRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  useEffect(() => {
    if (ref != null && ref.length > 0) {
      stashPendingInviteRef(ref);
    }
    router.replace('/sign-up');
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
