import {useEffect, useState} from 'react';

// Quiet Table members' reviews, anonymous, from Supabase (supabase/web_public.sql).
// The site calls two read-only functions with the public key; it can't read
// the tables, so no names or ids ever reach the browser.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type WebReview = {
  /** "MJ": the reviewer's initials, nothing more. */
  initials: string;
  score: number;
  /** REVIEW_REASONS ids: what they enjoyed, or under 7 what they didn't. */
  reasons: string[];
  /** The one-line reason from before the tick boxes. */
  reason: string | null;
  body: string | null;
  /** "2026-11": the month they went. */
  visited: string;
  /** Storage paths in the public review-photos bucket. */
  photos: string[];
};

export type WebPlace = {reviews: WebReview[]; gallery: string[]};
export type PlaceScore = {score: number; reviews: number};

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  if (URL_BASE == null || PUBLIC_KEY == null) return null;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {apikey: PUBLIC_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

let scoresPromise: Promise<Map<string, PlaceScore>> | null = null;

/** Every reviewed place's average and count, fetched once per visit. */
export function placeScores(): Promise<Map<string, PlaceScore>> {
  scoresPromise ??= rpc<{place_id: string; score: number; reviews: number}[]>('web_place_scores', {}).then(
    (rows) => new Map((rows ?? []).map((row) => [row.place_id, {score: Number(row.score), reviews: row.reviews}])),
  );
  return scoresPromise;
}

/** A place's score once the scores have loaded; null when it has none. */
export function usePlaceScore(placeId: string): PlaceScore | null {
  const [score, setScore] = useState<PlaceScore | null>(null);
  useEffect(() => {
    let cancelled = false;
    void placeScores().then((scores) => !cancelled && setScore(scores.get(placeId) ?? null));
    return () => {
      cancelled = true;
    };
  }, [placeId]);
  return score;
}

/** "9 · 2 reviews on Quiet Table". */
export function scoreLine(score: PlaceScore): string {
  return `${formatScore(score.score)} · ${score.reviews === 1 ? '1 review' : `${score.reviews} reviews`} on Quiet Table`;
}

/** One place's anonymous reviews, newest first, and its gallery photos. */
export async function placeReviews(placeId: string): Promise<WebPlace> {
  const place = await rpc<WebPlace>('web_place', {p_place_id: placeId});
  return place ?? {reviews: [], gallery: []};
}

export function photoUrl(path: string): string {
  return `${URL_BASE}/storage/v1/object/public/review-photos/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/** "8.5" or "9": one decimal only when it isn't whole. */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** "November 2026". */
export function visitedMonth(visited: string): string {
  const date = new Date(`${visited}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return visited;
  return date.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});
}

/** As on iOS: 6 or less is a thumbs down. */
export const LOW_SCORE_BELOW = 7;

/** The review tick boxes, as on iOS (quiet-table-ios src/shared/taste.ts). */
const REVIEW_REASONS = [
  {id: 'service', label: 'Service', phrase: 'the service', downPhrase: 'the service'},
  {id: 'starters', label: 'Starters', phrase: 'the starters', downPhrase: 'the starters'},
  {id: 'mains', label: 'Mains', phrase: 'the mains', downPhrase: 'the mains'},
  {id: 'desserts', label: 'Desserts', phrase: 'the desserts', downPhrase: 'the desserts'},
  {id: 'wine', label: 'Wine', phrase: 'the wine', downPhrase: 'the wine'},
  {id: 'cocktails', label: 'Cocktails', phrase: 'the cocktails', downPhrase: 'the cocktails'},
  {id: 'ambiance', label: 'Ambiance', phrase: 'the ambiance', downPhrase: 'the ambiance'},
  {id: 'value', label: 'Value for money', phrase: 'the value', downPhrase: 'the prices'},
  {id: 'quiet', label: 'Quiet, can talk', phrase: 'a quiet table', downPhrase: 'the noise'},
  {id: 'date-worthy', label: 'Date-worthy', phrase: 'it as a date spot', downPhrase: 'it as a date spot'},
  {id: 'groups', label: 'Good for groups', phrase: 'it with a group', downPhrase: 'it with a group'},
  {id: 'veggie', label: 'Veggie options', phrase: 'the veggie options', downPhrase: 'the veggie options'},
] as const;

/** "Enjoyed the service and the wine", or for 6 or less "Didn't enjoy the
 * service and the noise"; their old one-line reason when nothing's ticked. */
export function reviewWhy(review: WebReview): string | null {
  const low = review.score < LOW_SCORE_BELOW;
  const phrases: string[] = REVIEW_REASONS.filter((reason) => review.reasons.includes(reason.id)).map((reason) =>
    low ? reason.downPhrase : reason.phrase,
  );
  if (phrases.length === 0) return review.reason != null ? `“${review.reason}”` : null;
  const last = phrases.pop();
  const list = phrases.length > 0 ? `${phrases.join(', ')} and ${last}` : last;
  return `${low ? 'Didn’t enjoy' : 'Enjoyed'} ${list}`;
}
