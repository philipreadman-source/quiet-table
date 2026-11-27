import type {PlaceScore} from '@/lib/web-reviews';

// Every reviewed place's average and count, for Find's ranking on the server:
// which places nobody has reviewed yet (Find keeps a slot for one per page)
// and which is best reviewed. Read through the same public, anonymous
// function as the site (web_place_scores) and kept for ten minutes.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const KEEP_MS = 10 * 60 * 1000;

let cached: {at: number; scores: Map<string, PlaceScore>} | null = null;

/** Scores by place id; empty when Supabase can't be reached (then every
 * place counts as unreviewed, which only affects the unseen slot). */
export async function reviewScores(): Promise<Map<string, PlaceScore>> {
  if (cached != null && Date.now() - cached.at < KEEP_MS) return cached.scores;
  if (URL_BASE == null || PUBLIC_KEY == null) return new Map();
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/web_place_scores`, {
      method: 'POST',
      headers: {apikey: PUBLIC_KEY, 'Content-Type': 'application/json'},
      body: '{}',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return cached?.scores ?? new Map();
    const rows = (await res.json()) as {place_id: string; score: number; reviews: number}[];
    const scores = new Map(rows.map((row) => [row.place_id, {score: Number(row.score), reviews: row.reviews}]));
    cached = {at: Date.now(), scores};
    return scores;
  } catch {
    return cached?.scores ?? new Map();
  }
}
