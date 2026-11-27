// What Find has shown this browser and which places it opened, as on iOS
// (quiet-table-ios/src/lib/seen-places.ts). Places shown but not opened step
// back next time so others get a turn: each showing adds one, fading by half
// every four days. Opened places are no longer "unseen", so Find stops keeping
// a slot for them. Kept in localStorage only; sent with Find's own steps.

const SEEN_KEY = 'qt-find-seen';
const OPENED_KEY = 'qt-find-opened';
const HALF_LIFE_DAYS = 4;
/** Points a place loses per (fresh) showing, and the most it can lose. */
const POINTS_PER_SHOWING = 1.5;
const MAX_POINTS = 4.5;
const FORGET_BELOW = 0.1;
const MAX_SEEN = 60;
const MAX_OPENED = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/** placeId → [showings, when that count was taken (ms)]. */
type Seen = Record<string, [number, number]>;

export type FindHistory = {
  /** Points off places shown lately and not opened. */
  seen: Record<string, number>;
  /** Places opened in this browser, newest first. */
  opened: string[];
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: Find just doesn't remember this time.
  }
}

function faded([count, at]: [number, number], now: number): number {
  return count * 0.5 ** ((now - at) / (HALF_LIFE_DAYS * DAY_MS));
}

function saveSeen(seen: Seen): void {
  const now = Date.now();
  const kept = Object.entries(seen)
    .map(([id, entry]) => [id, faded(entry, now)] as const)
    .filter(([, count]) => count >= FORGET_BELOW)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SEEN);
  write(SEEN_KEY, Object.fromEntries(kept.map(([id, count]) => [id, [Math.round(count * 100) / 100, now]])));
}

/** What to send with a Find step. */
export function findHistory(): FindHistory {
  if (typeof window === 'undefined') return {seen: {}, opened: []};
  const now = Date.now();
  const seen = read<Seen>(SEEN_KEY, {});
  return {
    seen: Object.fromEntries(
      Object.entries(seen).map(([id, entry]) => [id, Math.min(MAX_POINTS, faded(entry, now) * POINTS_PER_SHOWING)]),
    ),
    opened: read<string[]>(OPENED_KEY, []),
  };
}

/** Find showed these places. */
export function markShown(placeIds: string[]): void {
  if (typeof window === 'undefined' || placeIds.length === 0) return;
  const seen = read<Seen>(SEEN_KEY, {});
  const now = Date.now();
  for (const id of placeIds) {
    const entry = seen[id];
    seen[id] = [(entry != null ? faded(entry, now) : 0) + 1, now];
  }
  saveSeen(seen);
}

/** A place's panel was opened: not one you scroll past, and not unseen. */
export function markOpened(placeId: string): void {
  if (typeof window === 'undefined') return;
  const opened = read<string[]>(OPENED_KEY, []);
  if (opened[0] !== placeId) write(OPENED_KEY, [placeId, ...opened.filter((id) => id !== placeId)].slice(0, MAX_OPENED));
  const seen = read<Seen>(SEEN_KEY, {});
  if (placeId in seen) {
    delete seen[placeId];
    saveSeen(seen);
  }
}
