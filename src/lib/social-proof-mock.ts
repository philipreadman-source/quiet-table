import type {SocialProof, SocialProofSource} from '@/lib/venue-options';

/** Demo contacts for deterministic live-venue social proof (~45% of cards). */
const MOCK_PROOF_POOL: Pick<SocialProof, 'name' | 'action' | 'when'>[] = [
  {name: 'Emma', action: 'booked', when: 'last month'},
  {name: 'John', action: 'liked'},
  {name: 'Lisa', action: 'recommended', when: 'for a date night'},
  {name: 'Tom', action: 'booked', when: 'last week'},
  {name: 'Sophie', action: 'saved'},
  {name: 'Marco', action: 'booked', when: 'in March'},
  {name: 'Anna', action: 'liked'},
  {name: 'Chris', action: 'recommended'},
];

const MOCK_SOURCES: SocialProofSource[] = ['contact', 'instagram', 'tripadvisor'];

function seededRoll(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Stable mock social proof for web-discovered venues (skipped when catalog already has one). */
export function mockSocialProofForVenue(venueId: string): SocialProof | undefined {
  const hash = seededRoll(venueId.toLowerCase());
  if (hash % 100 > 55) return undefined;
  const pick = MOCK_PROOF_POOL[hash % MOCK_PROOF_POOL.length]!;
  return {
    ...pick,
    source: MOCK_SOURCES[(hash >> 4) % MOCK_SOURCES.length]!,
  };
}
