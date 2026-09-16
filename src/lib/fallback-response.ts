import {applyMichelinModeToUi} from '@/lib/michelin-mode';
import {friendRankScoreForCompanions} from '@/lib/friend-graph-mock';
import {
  assignOfferedAvailabilityForResults,
  buildVenueOptionsTitle,
  filterVenuesByAimedTime,
  findVenueOption,
  formatOfferedAvailabilityLine,
  getVenueOptionsForIntent,
  nearestAvailableTimesAcrossVenues,
  paginateVenueOptions,
  rankVenueOptions,
  TIME_SLOTS,
  type VenueOptionCard,
} from '@/lib/venue-options';
import {
  buildVenueListPersonalizationNote,
  dietaryQuestionForMemory,
  excludedVenueTitles,
  filterExcludedVenues,
  getUserMemory,
  memoryRankScore,
  type UserMemory,
} from '@/lib/user-memory';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';
import {
  createCommunityFriendLookup,
  effectiveCommunityCompanionIds,
  memberSocialProofForVenue,
} from '@/lib/member-taste-discovery';
import type {TasteProfile} from '@/lib/taste-profile';
import {createBooking} from '@/lib/booking-data';
import {parseLocationFromMessage} from '@/lib/parse-location';

export const FALLBACK_ASLEEP_MESSAGE =
  'The agent is currently asleep, you can browse the UX in fallback mode.';

type BookingDraft = {
  intent?: string;
  partySize?: string;
  location?: string;
  date?: string;
  time?: string;
  venue?: string;
  dietaryNeeds?: 'none' | 'vegetarian' | 'vegan' | 'mixed' | 'pescatarian';
  venueResultsPage?: number;
  personalizationNoteShown?: boolean;
  goingWithFriendIds?: string[];
  goingWithSkipped?: boolean;
  partyDietarySummary?: string;
};

export type ClarifyOption = {id: string; label: string};

export type FallbackUi = {
  tool_status?: {name: string; target: string; status: 'complete'}[];
  interactive: Record<string, unknown>;
};

function isDraftReadyForVenues(draft?: BookingDraft): boolean {
  return draft?.intent != null && draft.partySize != null && draft.location != null && draft.time != null;
}

function fallbackIntentLabel(intent: string): string {
  const lower = intent.toLowerCase();
  if (lower.includes('date')) return 'date-night';
  if (lower.includes('michelin')) return 'Michelin-style';
  if (lower.includes('business')) return 'business dinner';
  if (lower.includes('group')) return 'group-friendly';
  return 'casual';
}

function isLocationChangeMessage(message: string): boolean {
  return parseLocationFromMessage(message) != null;
}

function mentionedCommunityMember(
  message: string,
  members: FriendFoodProfile[],
): FriendFoodProfile | undefined {
  const lower = message.toLowerCase();
  return members.find(
    (member) =>
      lower.includes(member.name.toLowerCase()) ||
      lower.includes(member.fullName.toLowerCase()),
  );
}

function isVagueFreeText(message: string): boolean {
  const lower = message.trim().toLowerCase();
  if (lower.length < 3) return true;
  if (/\b(show more|book|confirm|reserve|yes)\b/i.test(lower)) return false;
  if (/\b(no restrictions|vegetarian|vegan|mixed)\b/i.test(lower)) return false;
  if (parseLocationFromMessage(message) != null) return false;
  if (/\b(nice|good|something|somewhere|surprise|help|recommend|ideas|options|hungry)\b/i.test(lower)) {
    return true;
  }
  return lower.split(/\s+/).length <= 4;
}

function buildVenueOptionsFallbackResponse(
  draft: BookingDraft,
  message: string,
  userMemory: UserMemory,
  communityMembers: FriendFoodProfile[] = [],
  options?: {locationChanged?: boolean},
): {text: string; ui: FallbackUi} {
  const companionIds = effectiveCommunityCompanionIds(draft.goingWithFriendIds, communityMembers);
  const communityLookup = createCommunityFriendLookup(communityMembers);
  const dateIso = draft.date;
  const time = draft.time!;
  const showMore = /\bshow more\b/i.test(message);
  const page = showMore ? (draft.venueResultsPage ?? 1) : 0;
  const catalog = getVenueOptionsForIntent(draft.intent!);
  const excluded = excludedVenueTitles(catalog, userMemory);
  const eligible = filterVenuesByAimedTime(
    filterExcludedVenues(catalog, userMemory),
    dateIso,
    time,
  );
  const ranked = rankVenueOptions(
    eligible,
    dateIso,
    time,
    draft.dietaryNeeds ?? 'none',
    (venueId) =>
      memoryRankScore(venueId, userMemory) +
      friendRankScoreForCompanions(
        venueId,
        companionIds,
        message,
        draft.intent,
        communityLookup,
      ),
  );
  const {options: pageOptions, hasMore, total} = paginateVenueOptions(ranked, page);
  const offeredById =
    dateIso != null ? assignOfferedAvailabilityForResults(ranked, dateIso, time) : new Map();
  const optionsOut = pageOptions.map((option) => {
    const offered = offeredById.get(option.id);
    let row = offered != null ? {...option, meta: formatOfferedAvailabilityLine(offered)} : option;
    const companionProof = memberSocialProofForVenue(
      row.id,
      row.title,
      communityMembers,
      companionIds,
    );
    if (companionProof != null) row = {...row, social_proof: companionProof};
    return row;
  });

  let title = buildVenueOptionsTitle(total, time, dateIso, ranked);
  if (total === 0 && dateIso != null) {
    const nearestTimes = nearestAvailableTimesAcrossVenues(
      catalog.map((option) => option.id),
      dateIso,
      time,
    );
    title =
      nearestTimes.length > 0
        ? `No tables around ${time} — try ${nearestTimes.join(' or ')}`
        : `No tables around ${time}`;
  }

  const exclusionNote =
    page === 0 && draft.personalizationNoteShown !== true
      ? buildVenueListPersonalizationNote(userMemory, excluded)
      : null;
  const mentionedFriend = mentionedCommunityMember(message, communityMembers);
  const location = draft.location ?? 'Amsterdam';
  const companionNames =
    draft.goingWithFriendIds
      ?.map((id) => communityLookup(id)?.name)
      .filter((name): name is string => name != null && name.length > 0) ?? [];
  const friendHint =
    companionNames.length > 0
      ? companionNames.length === 1
        ? `${companionNames[0]}'s picks first`
        : `${companionNames.slice(0, 2).join(' & ')}'s picks weighted`
      : mentionedFriend != null
        ? `${mentionedFriend.name}'s taste in the mix`
        : null;

  const lead =
    options?.locationChanged === true
      ? `Top ${fallbackIntentLabel(draft.intent!)} picks in ${location}.`
      : `Top ${fallbackIntentLabel(draft.intent!)} picks at ${time}.`;

  const bullets: string[] = [lead.trim()];
  if (friendHint != null) bullets.push(friendHint);
  if (draft.partyDietarySummary != null && draft.partyDietarySummary.length > 0) {
    const shortDietary = draft.partyDietarySummary.split('—')[0]?.trim() ?? draft.partyDietarySummary;
    if (shortDietary.length > 0 && shortDietary.length < 80) bullets.push(shortDietary);
  }
  const factsLine =
    bullets.length <= 1
      ? `${bullets[0] ?? lead} Pick one below.`
      : `${bullets.map((line) => `- ${line}`).join('\n')}\n\nPick one below.`;

  const response = {
    text: page === 0 ? [exclusionNote, factsLine].filter(Boolean).join(' ') : '',
    ui: {
      interactive: {
        type: 'options',
        title,
        options: optionsOut,
        pagination: {page, has_more: hasMore, total},
      },
    },
  };
  const michelinApplied = applyMichelinModeToUi(response.text, response.ui, draft.intent);
  return {text: michelinApplied.text, ui: michelinApplied.ui as FallbackUi};
}

function buildClarifyResponse(draft: BookingDraft | undefined, message: string): {text: string; ui: FallbackUi} | null {
  if (!isVagueFreeText(message)) return null;

  if (draft?.intent == null) {
    return {
      text: 'Happy to help — what kind of table are you after?',
      ui: {
        interactive: {
          type: 'clarify',
          question: 'What kind of table?',
          options: [
            {id: 'casual', label: 'Something casual, nothing fussy.'},
            {id: 'date', label: "I'm looking for a date night table."},
            {id: 'group', label: 'I need a table for a group.'},
            {id: 'business', label: 'I need a table for a business dinner.'},
          ],
        },
      },
    };
  }

  if (draft.partySize == null) {
    return {
      text: 'How many are you?',
      ui: {
        interactive: {
          type: 'clarify',
          question: 'Party size',
          options: ['2', '3', '4', '5', '6+'].map((size) => ({
            id: `party-${size}`,
            label: size === '6+' ? 'Party of 6+' : `Party of ${size}`,
          })),
        },
      },
    };
  }

  if (draft.location == null) {
    return {
      text: 'Which area should I search?',
      ui: {
        interactive: {
          type: 'clarify',
          question: 'Location',
          options: [
            {id: 'loc-amsterdam', label: 'Amsterdam'},
            {id: 'loc-de-pijp', label: 'De Pijp'},
            {id: 'loc-jordaan', label: 'Jordaan'},
          ],
        },
      },
    };
  }

  if (draft.time == null) {
    return {
      text: 'What time works?',
      ui: {
        interactive: {
          type: 'clarify',
          question: 'Time',
          options: TIME_SLOTS.filter((_, i) => i % 2 === 0).map((slot) => ({
            id: `time-${slot}`,
            label: slot,
          })),
        },
      },
    };
  }

  return null;
}

function tryBroadCatalogOptions(
  draft: BookingDraft | undefined,
  message: string,
  userMemory: UserMemory,
  communityMembers: FriendFoodProfile[] = [],
): {text: string; ui: FallbackUi} | null {
  const companionIds = effectiveCommunityCompanionIds(draft?.goingWithFriendIds, communityMembers);
  const communityLookup = createCommunityFriendLookup(communityMembers);
  const intent = draft?.intent ?? 'Something casual, nothing fussy.';
  const catalog = getVenueOptionsForIntent(intent);
  const eligible = filterExcludedVenues(catalog, userMemory);
  if (eligible.length < 3) return null;

  const time = draft?.time ?? '7:30pm';
  const dateIso = draft?.date;
  const ranked = rankVenueOptions(
    eligible,
    dateIso,
    time,
    draft?.dietaryNeeds ?? 'none',
    (venueId) =>
      memoryRankScore(venueId, userMemory) +
      friendRankScoreForCompanions(venueId, companionIds, message, intent, communityLookup),
  );
  const {options: pageOptions, hasMore, total} = paginateVenueOptions(ranked, 0);
  const offeredById =
    dateIso != null ? assignOfferedAvailabilityForResults(ranked, dateIso, time) : new Map();
  const optionsOut = pageOptions.map((option: VenueOptionCard) => {
    const offered = offeredById.get(option.id);
    let row = offered != null ? {...option, meta: formatOfferedAvailabilityLine(offered)} : option;
    const companionProof = memberSocialProofForVenue(
      row.id,
      row.title,
      communityMembers,
      companionIds,
    );
    if (companionProof != null) row = {...row, social_proof: companionProof};
    return row;
  });

  return {
    text: `Here are ${total} popular picks around ${draft?.location ?? 'Amsterdam'} — tap one to explore.`,
    ui: {
      interactive: {
        type: 'options',
        title: `Popular ${fallbackIntentLabel(intent)} spots`,
        options: optionsOut,
        pagination: {page: 0, has_more: hasMore, total},
      },
    },
  };
}

export function buildFallbackResponse(
  message: string,
  draft?: BookingDraft,
  tasteProfile?: TasteProfile | null,
  communityMembers: FriendFoodProfile[] = [],
) {
  const userMemory = getUserMemory(tasteProfile);
  const venue = draft?.venue;
  const time = draft?.time ?? 'the selected time';
  const partySize = Number.parseInt(draft?.partySize ?? '2', 10);
  const wantsBooking = /\b(book|confirm|reserve|yes)\b/i.test(message);

  const parsedLocation = parseLocationFromMessage(message);
  const effectiveDraft =
    parsedLocation != null && draft != null
      ? {...draft, location: parsedLocation, venue: undefined, venueResultsPage: 0}
      : draft;

  if (venue != null && wantsBooking) {
    const booking = createBooking({
      venue_id: venue,
      time,
      party_size: Number.isFinite(partySize) ? partySize : 2,
    });
    return {
      text: '',
      ui: {
        tool_status: [{name: 'create_booking', target: `${venue} · ${time}`, status: 'complete'}],
        interactive: {
          type: 'success',
          title: 'Table booked.',
          description: `${booking.venue_name} · ${booking.time} · party of ${booking.party_size}.`,
        },
      },
    };
  }

  if (venue != null) {
    const known = findVenueOption(venue);
    return {
      text: `${venue} fits the brief. Ready when you are.`,
      ui: {
        interactive: {
          type: 'detail',
          title: venue,
          detail: {
            subtitle: `${effectiveDraft?.location ?? 'Amsterdam'} · ${time}`,
            description:
              known?.description ??
              `A good match for ${effectiveDraft?.intent ?? 'this dinner'}${effectiveDraft?.partySize != null ? `, party of ${effectiveDraft.partySize}` : ''}.`,
            cta_label: `Book ${venue}`,
            menu_url: known?.menu_url,
            google_reviews_url: known?.google_reviews_url,
            tripadvisor_url: known?.tripadvisor_url,
          },
        },
      },
    };
  }

  if (isDraftReadyForVenues(effectiveDraft) && effectiveDraft!.dietaryNeeds == null) {
    const question =
      effectiveDraft!.partyDietarySummary != null
        ? `Any other dietary needs beyond your group? (${effectiveDraft!.partyDietarySummary})`
        : dietaryQuestionForMemory(userMemory);
    return {
      text: '',
      ui: {
        interactive: {
          type: 'dietary',
          question,
        },
      },
    };
  }

  if (isDraftReadyForVenues(effectiveDraft) && effectiveDraft!.dietaryNeeds != null) {
    return buildVenueOptionsFallbackResponse(
      effectiveDraft!,
      message,
      userMemory,
      communityMembers,
      {locationChanged: isLocationChangeMessage(message)},
    );
  }

  const clarify = buildClarifyResponse(effectiveDraft, message);
  if (clarify != null) return clarify;

  const broad = tryBroadCatalogOptions(effectiveDraft, message, userMemory, communityMembers);
  if (broad != null) return broad;

  return {
    text: FALLBACK_ASLEEP_MESSAGE,
    ui: {interactive: {type: 'none'}},
  };
}
