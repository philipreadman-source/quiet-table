/** Date-night spend tier — captured after occasion, before date/time. No ranking yet. */
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
    subtitle: 'Roughly €40–60 per person',
    summaryPhrase: 'Keeping it easy on spend.',
  },
  {
    id: 'upscale',
    title: 'Worth dressing up for',
    subtitle: 'Roughly €80–120 per person',
    summaryPhrase: 'Worth dressing up for.',
  },
  {
    id: 'splurge',
    title: 'Special splurge',
    subtitle: 'Roughly €150+ per person',
    summaryPhrase: 'A special splurge.',
  },
];

export function formatSpendForSummary(spend: DateNightSpend): string {
  return DATE_NIGHT_SPEND_CARDS.find((card) => card.id === spend)?.summaryPhrase ?? '';
}

/** Future: skip spend step when userMemory signals high default spend — not wired yet. */
export function shouldAskSpendStep(): boolean {
  return true;
}
