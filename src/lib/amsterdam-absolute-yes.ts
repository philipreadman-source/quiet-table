import type {VenueOptionCard} from '@/lib/venue-options';

/** Shared badge for Amsterdam editorial picks (dummy press list). */
export const AMSTERDAM_ABSOLUTE_YES_META = 'Absolute yes · past 6 months';

export const AMSTERDAM_ABSOLUTE_YES_EDITORIAL =
  'Newcomers we waited months for, and spots we returned to two or three times in a single month — our definite yes addresses in Amsterdam.';

/**
 * Dummy catalog entries from the editorial shortlist — newcomers and repeat favourites.
 */
export const AMSTERDAM_ABSOLUTE_YES_VENUES: VenueOptionCard[] = [
  {
    id: 'the-lemmeke',
    title: 'The Lemmeke',
    subtitle: 'Oud-Zuid · neighbourhood dining',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description:
      'Excessively good food — the new go-to in Oud-Zuid we keep booking again.',
    cta_label: 'Book your table',
    google_rating: 4.7,
    tripadvisor_rating: 4.6,
    review_count: 420,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'vermouth-amsterdam',
    title: 'Vermouth',
    subtitle: 'West · drinks bar',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description:
      'Hot spot for drinks in Amsterdam-West — also on JP Heijestraat (see Vermouth JP Heijestraat in new openings).',
    cta_label: 'Book your table',
    google_rating: 4.5,
    review_count: 310,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'friend-amsterdam',
    title: 'Friend',
    subtitle: 'Center · unpretentious French',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description:
      'Unpretentious French cuisine in the heart of the city — confident cooking without the ceremony.',
    cta_label: 'Book your table',
    google_rating: 4.6,
    review_count: 580,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'weinlokal-stern',
    title: 'Weinlokal Stern',
    subtitle: 'Center · German classics',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description:
      'German classics steal the show — Mara Grimm scored it a 9, and the room feels like a proper Weinlokal.',
    cta_label: 'Book your table',
    google_rating: 4.8,
    review_count: 290,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'vita-lente',
    title: 'Vita Lente',
    subtitle: 'Center · Italian',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'Back on the radar — relaxed Italian that rewards a slow evening.',
    cta_label: 'Book your table',
    google_rating: 4.4,
    review_count: 720,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'cafe-susy',
    title: 'Café Susy',
    subtitle: 'West · café all-day',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'Worth putting on the list again — easy café energy, good people-watching.',
    cta_label: 'Book your table',
    google_rating: 4.3,
    review_count: 640,
    dietary_tags: ['vegetarian-friendly', 'vegan-friendly'],
  },
  {
    id: 'the-blue-tit',
    title: 'The Blue Tit',
    subtitle: 'De Pijp · neighbourhood bar',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'Neighbourhood favourite that keeps earning repeat visits.',
    cta_label: 'Book your table',
    google_rating: 4.5,
    review_count: 510,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'cafe-kompleet',
    title: 'Café Kompleet',
    subtitle: 'East · coffee and lunch',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'Kompleet again on the shortlist — dependable lunch and excellent coffee.',
    cta_label: 'Book your table',
    google_rating: 4.4,
    review_count: 380,
    dietary_tags: ['vegetarian-friendly', 'vegan-friendly'],
  },
  {
    id: 'cafe-publiek',
    title: 'Café Publiek',
    subtitle: 'East · wine and small plates',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'Casual wine bar energy — small plates worth sharing.',
    cta_label: 'Book your table',
    google_rating: 4.5,
    review_count: 450,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'bon-burgerbar-north',
    title: 'Bon Burgerbar North',
    subtitle: 'Noord · burgers',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'North-side burger run that still hits when you want something unfussy and loud.',
    cta_label: 'Book your table',
    google_rating: 4.2,
    review_count: 890,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'van-beeren',
    title: 'Eatery Van Beeren',
    subtitle: 'Center · courtyard dining',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'Great value for money with a lovely courtyard — book outside when the weather cooperates.',
    cta_label: 'Book your table',
    google_rating: 4.4,
    review_count: 670,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'tacit',
    title: 'Tacit',
    subtitle: 'Oud-Zuid · high-end dining',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description: 'High-end dining in Oud-Zuid — special-occasion pacing and a serious wine list.',
    cta_label: 'Book your table',
    google_rating: 4.7,
    review_count: 240,
    dietary_tags: ['vegetarian-friendly'],
  },
  {
    id: 'amsterdam-bouillon-2',
    title: 'Amsterdam Bouillon No. 2',
    subtitle: 'De Pijp · French brasserie',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description:
      'Oeufs mayo, steak frites, and a bottle of wine for a low price — smaller than Magna Plaza No. 1, but this time with a terrace.',
    cta_label: 'Book your table',
    google_rating: 4.3,
    review_count: 1100,
    dietary_tags: ['limited-veg'],
  },
  {
    id: 'the-broeker-house',
    title: 'The Broeker House',
    subtitle: 'Center · old-school dining',
    meta: AMSTERDAM_ABSOLUTE_YES_META,
    description:
      'Not new, but firmly on the radar — nice and old-school, great value for a bargain night out.',
    cta_label: 'Book your table',
    google_rating: 4.2,
    review_count: 520,
    dietary_tags: ['limited-veg'],
  },
];

export const AMSTERDAM_ABSOLUTE_YES_POPULAR_IDS = new Set([
  'the-lemmeke',
  'tacit',
  'amsterdam-bouillon-2',
  'friend-amsterdam',
  'weinlokal-stern',
  'vermouth-amsterdam',
]);
