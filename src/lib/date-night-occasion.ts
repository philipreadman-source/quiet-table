/** Date-night occasion — captured after location, before date/time. */
export type DateNightOccasion = 'everyday' | 'anniversary' | 'first-date' | 'birthday';

export const DATE_NIGHT_OCCASION_CARDS: {
  id: DateNightOccasion;
  title: string;
  subtitle: string;
  summaryPhrase: string;
}[] = [
  {
    id: 'everyday',
    title: 'Nice night out',
    subtitle: 'Cosy and unfussy — just the two of you',
    summaryPhrase: 'A nice night out for two.',
  },
  {
    id: 'anniversary',
    title: 'Anniversary',
    subtitle: 'Worth a little extra ceremony',
    summaryPhrase: 'An anniversary dinner.',
  },
  {
    id: 'first-date',
    title: 'First date',
    subtitle: 'Relaxed, not too formal or loud',
    summaryPhrase: 'A first date.',
  },
  {
    id: 'birthday',
    title: 'Birthday',
    subtitle: 'Make it feel like a celebration',
    summaryPhrase: 'A birthday dinner.',
  },
];

export function isDateNightIntent(intent?: string): boolean {
  return intent?.toLowerCase().includes('date') ?? false;
}

export function formatOccasionForSummary(occasion: DateNightOccasion): string {
  return DATE_NIGHT_OCCASION_CARDS.find((card) => card.id === occasion)?.summaryPhrase ?? '';
}
