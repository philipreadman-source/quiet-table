// The website's daily AI budget ("community credits"), kept in Supabase by
// supabase/web_ai_budget.sql. Server only: it holds WEB_AI_BUDGET_SECRET.
//
// Before a live answer: allowAnswer() (budget left, and this device and
// network have answers left today). After it: chargeAnswer() with what it
// actually cost, worked out from the API's usage counts.

import {createHash} from 'node:crypto';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.WEB_AI_BUDGET_SECRET;

/** Dollars to euros, for the budget. Rounded up a little on purpose. */
const EUR_PER_USD = 0.95;
/** Web search: $10 per 1,000 searches. */
const USD_PER_SEARCH = 0.01;

/** USD per million tokens: input, output, 5-minute cache write, cache read.
 * From Anthropic's pricing page, November 2026. */
const PRICES: {match: RegExp; input: number; output: number; cacheWrite: number; cacheRead: number}[] = [
  {match: /haiku-5/, input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01},
  {match: /haiku-4/, input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1},
  {match: /sonnet-5/, input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1},
  {match: /sonnet-4/, input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3},
  {match: /opus-5-5/, input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2},
];
/** Unknown model: price it like the dearest Sonnet, so the cap errs on the safe side. */
const FALLBACK_PRICE = {input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3};

export type Usage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  web_search_requests: number;
};

/** What one API call cost, in euro cents. */
export function usageCents(usage: Usage): number {
  const price = PRICES.find((row) => row.match.test(usage.model)) ?? FALLBACK_PRICE;
  // Haiku 5.5 charges 5x for prompts over 100,000 tokens.
  const longPrompt =
    /haiku-5/.test(usage.model) &&
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens > 100_000;
  const scale = longPrompt ? 5 : 1;
  const usd =
    ((usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      usage.cache_creation_input_tokens * price.cacheWrite +
      usage.cache_read_input_tokens * price.cacheRead) *
      scale) /
      1_000_000 +
    usage.web_search_requests * USD_PER_SEARCH;
  return usd * EUR_PER_USD * 100;
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  if (URL_BASE == null || PUBLIC_KEY == null) return null;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {apikey: PUBLIC_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The budget can only work with Supabase and the secret configured. */
export function isBudgetConfigured(): boolean {
  return URL_BASE != null && PUBLIC_KEY != null && SECRET != null && SECRET.length > 0;
}

/** Share of today's budget left, 0 to 1; null when it can't be read. */
export async function creditsRemaining(): Promise<number | null> {
  const value = await rpc<number>('web_ai_remaining', {});
  return value != null ? Number(value) : null;
}

export type Allowance = {allowed: boolean; reason: 'budget' | 'device' | 'secret' | 'unavailable' | null; remaining: number | null};

/** A hash of the caller's network address, so the address itself is never stored. */
export function networkKey(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return createHash('sha256').update(`${SECRET ?? ''}:${ip}`).digest('hex').slice(0, 32);
}

/** Ask for one live answer (and count it) before calling the model. */
export async function allowAnswer(device: string, network: string): Promise<Allowance> {
  if (!isBudgetConfigured()) return {allowed: false, reason: 'unavailable', remaining: null};
  const result = await rpc<{allowed: boolean; reason: Allowance['reason']; remaining: number}>('web_ai_allow', {
    p_secret: SECRET,
    p_device: device,
    p_network: network,
  });
  if (result == null) return {allowed: false, reason: 'unavailable', remaining: null};
  return {allowed: result.allowed, reason: result.reason, remaining: Number(result.remaining)};
}

/** Record what an answer cost; returns the share of the budget left. */
export async function chargeAnswer(cents: number): Promise<number | null> {
  if (!isBudgetConfigured() || cents <= 0) return creditsRemaining();
  const value = await rpc<number>('web_ai_charge', {p_secret: SECRET, p_cents: Math.round(cents * 1000) / 1000});
  return value != null ? Number(value) : null;
}
