'use client';

import {ClerkFailed, ClerkLoaded, ClerkLoading} from '@clerk/nextjs';
import type {ReactNode} from 'react';

const shellStyle = {
  display: 'flex',
  minHeight: '100vh',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  gap: 12,
  fontFamily: 'inherit',
  color: '#6b6b6b',
  // #fafafa by request; no Astryx token has this value in light mode. Dark
  // mode keeps the Astryx page background.
  background: 'light-dark(#fafafa, var(--color-background-body))',
} as const;

export function ClerkAuthShell({children}: {children: ReactNode}) {
  return (
    <div style={shellStyle}>
      <ClerkLoading>
        <p>Loading sign in…</p>
      </ClerkLoading>
      <ClerkFailed>
        <p>Sign in could not load.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </ClerkFailed>
      <ClerkLoaded>{children}</ClerkLoaded>
    </div>
  );
}
