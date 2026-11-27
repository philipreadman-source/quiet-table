/** Date-night budget, asked after the occasion. Two choices, as on iOS:
 * within reach, or a treat. Find puts places in budget first (price bands
 * 1–2 or 3–4). 'splurge' is the old third choice; it counts as 'upscale'. */
export type DateNightSpend = 'moderate' | 'upscale' | 'splurge';

export const DATE_NIGHT_SPEND_CARDS: {
  id: DateNightSpend;
  title: string;
  subtitle: string;
  summaryPhrase: string;
}[] = [
  {
    id: 'moderate',
    title: 'Keep it easy',
    subtitle: 'Roughly €40–70 per person',
    summaryPhrase: 'Keeping it easy on spend.',
  },
  {
    id: 'upscale',
    title: 'Treat ourselves',
    subtitle: 'Roughly €70+ per person',
    summaryPhrase: 'Treating ourselves.',
  },
];

export function formatSpendForSummary(spend: DateNightSpend): string {
  return DATE_NIGHT_SPEND_CARDS.find((card) => card.id === spend)?.summaryPhrase ?? '';
}

/** Future: skip spend step when userMemory signals high default spend — not wired yet. */
export function shouldAskSpendStep(): boolean {
  return true;
}
