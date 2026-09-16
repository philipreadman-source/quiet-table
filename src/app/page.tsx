'use client';

import {useEffect, useMemo, useState, type CSSProperties, type MouseEvent} from 'react';
import {useAuth, useUser} from '@clerk/nextjs';
import {useRouter} from 'next/navigation';
import {Sparkles} from 'lucide-react';
import {HStack, VStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatToolCalls,
} from '@astryxdesign/core/Chat';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Banner} from '@astryxdesign/core/Banner';
import {Text} from '@astryxdesign/core/Text';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {
  enrichVenueOption,
  findVenueOption,
  formatRatingsLine,
  resolveMenuAction,
  TIME_SLOTS,
  venueAiWriteUps,
  type DietaryNeeds,
  type MenuAction,
  type VenueOptionCard,
} from '@/lib/venue-options';
import {filterExcludedVenues, getUserMemory, type UserMemory} from '@/lib/user-memory';
import {isOnboardingComplete, saveTasteProfile, type TasteProfile} from '@/lib/taste-profile';
import {mergeClerkUserIntoProfile} from '@/lib/clerk-profile';
import {resolveFriendFoodProfile} from '@/lib/member-friends';
import {useMemberFriends} from '@/lib/use-member-friends';
import {
  DATE_NIGHT_OCCASION_CARDS,
  type DateNightOccasion,
} from '@/lib/date-night-occasion';
import {
  DATE_NIGHT_SPEND_CARDS,
  type DateNightSpend,
} from '@/lib/date-night-spend';
import {VenueResultListingContent} from '@/app/components/venue-result-listing';
import {HomeFriendsTabPanel} from '@/app/components/home-friends-tab';
import {HomeProfileTabPanel} from '@/app/components/home-profile-tab';
import {HomeSectionTabBar, type HomeMainSection} from '@/app/components/home-section-tabs';
import {WizardGoingWithStep} from '@/app/components/wizard-going-with-step';
import {
  derivePartyDietaryFromCompanions,
  listWizardCompanionFriends,
  type FriendFoodProfile,
} from '@/lib/friend-graph-mock';
import {reverseGeocode} from '@/lib/reverse-geocode';
import {parseLocationFromMessage} from '@/lib/parse-location';

const QUIET_TABLE_AVATAR = (
  <Avatar src="/brand/quiet-table-mark.svg" name="Quiet Table" alt="Quiet Table" size="xsmall" />
);


const root: CSSProperties = {height: '100dvh', width: '100%'};
const chatShell: CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  minHeight: 0,
  height: '100%',
};
const chatLayout: CSSProperties = {flex: 1, minHeight: 0, width: '100%', maxWidth: 800};
const chatBubblePadding: CSSProperties = {
  paddingBlock: 'var(--spacing-4)',
  paddingInline: 'var(--spacing-5)',
};
/** Wizard card blocks — flush left; no top inset so cards line up with the avatar. */
const wizardBubblePadding: CSSProperties = {
  paddingBlockStart: 0,
  paddingBlockEnd: 'var(--spacing-4)',
  paddingInline: 0,
};
/** Text + tool/status replies — top-align Q with the bubble (multi-line stays natural). */
const chatMessageInlineStyle: CSSProperties = {alignItems: 'flex-start'};

// Fixed, art-directed opening move — instant, no round-trip. Every card
// runs the same wizard next: intent -> party size -> date -> time. Party
// size is always a deterministic card choice (a free-text reply won't
// reliably normalize), never left for the agent to ask conversationally.
const DEFAULT_PARTY_SIZES = ['1', '2', '3', '4', '5', '6', '7', '8', '9+'];
// Casual caps at 6 — large parties belong in the group flow via 6+.
const CASUAL_PARTY_SIZES = ['1', '2', '3', '4', '5', '6', '6+'];
// Michelin-starred tables rarely seat large parties — offering the full 1-9+
// range just invites picking a size that won't have real results. Cap the
// chips at 4, then a single 4+ bucket the agent can reason about instead.
const MICHELIN_PARTY_SIZES = ['1', '2', '3', '4', '4+'];

const INTENT_CARDS = [
  {
    id: 'casual',
    title: 'Casual',
    subtitle: 'Easygoing, no fuss',
    message: 'Something casual.',
    acknowledgement: 'Casual.',
    partySizes: CASUAL_PARTY_SIZES,
  },
  // Date night implies two people — skip the size step rather than ask.
  {
    id: 'date-night',
    title: 'Date night',
    subtitle: 'Quiet, intimate, worth dressing up for',
    message: "I'm looking for a date night table.",
    acknowledgement: 'Ah date night 😘.',
    fixedPartySize: '2',
  },
  {
    id: 'michelin',
    title: 'Michelin star',
    subtitle: 'The tasting menu, the occasion',
    message: 'Find me a Michelin star table.',
    acknowledgement: 'Yes, chef.',
    partySizes: MICHELIN_PARTY_SIZES,
  },
  {
    id: 'business',
    title: 'Business',
    subtitle: 'Professional, easy to talk shop',
    message: 'I need a table for a business dinner.',
    acknowledgement: 'Business dinner, got it.',
  },
  {
    id: 'group',
    title: 'Group',
    subtitle: 'For 6 or more people',
    message: 'I need a table for a group.',
    acknowledgement: 'Group dinner, nice.',
  },
] satisfies {
  id: string;
  title: string;
  subtitle: string;
  message: string;
  acknowledgement: string;
  fixedPartySize?: string;
  partySizes?: string[];
}[];

function partySizeSummaryPhrase(value: string): string {
  return value.endsWith('+')
    ? `for a party of ${value.slice(0, -1)} or more`
    : `for a party of ${value}`;
}

function isSoloPartySize(size: string | undefined): boolean {
  return size === '1';
}

/** Short intent label for the summary bubble — not the full chip message. */
function intentSummaryLabel(intent: string | undefined): string | null {
  if (intent == null) return null;
  const lower = intent.toLowerCase();
  if (lower.includes('date night')) return 'Date night';
  if (lower.includes('casual')) return 'Casual';
  if (lower.includes('michelin')) return 'Michelin star';
  if (lower.includes('business')) return 'Business';
  if (lower.includes('group')) return 'Group';
  return intent.replace(/\.$/, '');
}

function goingWithSummaryPhrase(draft: BookingDraft, members: readonly FriendFoodProfile[]): string | null {
  const ids = draft.goingWithFriendIds;
  if (ids == null || ids.length === 0 || draft.goingWithSkipped === true) return null;
  const names = ids
    .map((id) => resolveFriendFoodProfile(id, members)?.name)
    .filter((name): name is string => name != null && name.length > 0);
  if (names.length === 0) return null;
  if (names.length === 1) return `with ${names[0]}`;
  if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
  return `with ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function formatDraftSummary(draft: BookingDraft, members: readonly FriendFoodProfile[]): string {
  const intent = intentSummaryLabel(draft.intent);
  const party = draft.partySize != null ? partySizeSummaryPhrase(draft.partySize) : null;
  const companions = goingWithSummaryPhrase(draft, members);
  const place = draft.location != null ? `in ${draft.location}` : null;
  const when =
    draft.date != null && draft.time != null
      ? `${formatDateForMessage(draft.date)} around ${draft.time}`
      : null;

  const lead = [intent, party, companions, place].filter(Boolean).join(', ');
  if (lead.length === 0) return when != null ? `${when}.` : '';
  if (when == null) return `${lead}.`;
  return `${lead}. ${when}.`;
}

const GROUP_INTENT_MESSAGE = 'I need a table for a group.';
const CASUAL_INTENT_MESSAGE = 'Something casual, nothing fussy.';
const GROUP_INTENT_ACKNOWLEDGEMENT = 'Group dinner, nice.';

type WizardStage = 'intent' | 'size' | 'goingWith' | 'location' | 'occasion' | 'spend' | 'date' | 'time';

// Composer teaser updates with the flow — typing is always a valid escape hatch.
// Wizard steps are set; post-summary phases (dietary, etc.) can be re-specced later.
const STAGE_PLACEHOLDERS: Record<WizardStage, string> = {
  intent: "Or just tell me what you're after...",
  size: 'Or tell me how many...',
  goingWith: 'Or say who is joining...',
  location: 'Or specify a location...',
  occasion: 'Or describe the occasion...',
  spend: 'Or say what you want to spend...',
  date: 'Or tell me when...',
  time: 'Or specify a time...',
};

const POST_WIZARD_PLACEHOLDERS = {
  dietary: 'Or mention any dietary needs...',
  results: "Can't find what you're looking for? Or have any questions...",
  default: 'Or tell me anything else...',
} as const;

const TODAY_ISO = new Date().toISOString().slice(0, 10) as ISODateString;

function formatDateForMessage(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function resolveComposerPlaceholder(args: {
  stage: WizardStage;
  wizardComplete: boolean;
  hasVenueResults: boolean;
  showingDietary: boolean;
}): string {
  if (args.hasVenueResults) return POST_WIZARD_PLACEHOLDERS.results;
  if (args.showingDietary) return POST_WIZARD_PLACEHOLDERS.dietary;
  if (args.wizardComplete) return POST_WIZARD_PLACEHOLDERS.default;
  return STAGE_PLACEHOLDERS[args.stage];
}

function wizardStageOrder(
  sizeStepSkipped: boolean,
  dateNightStepsIncluded: boolean,
  skipGoingWith: boolean,
): WizardStage[] {
  const goingWith: WizardStage[] = skipGoingWith ? [] : ['goingWith'];
  if (sizeStepSkipped && dateNightStepsIncluded) {
    return ['intent', 'location', 'occasion', 'spend', 'date', 'time'];
  }
  if (sizeStepSkipped) return ['intent', 'location', 'date', 'time'];
  return ['intent', 'size', ...goingWith, 'location', 'date', 'time'];
}

function visibleWizardStages(
  stage: WizardStage,
  wizardComplete: boolean,
  sizeStepSkipped: boolean,
  dateNightStepsIncluded: boolean,
  skipGoingWith: boolean,
): WizardStage[] {
  const order = wizardStageOrder(sizeStepSkipped, dateNightStepsIncluded, skipGoingWith);
  if (wizardComplete) return order;
  const idx = order.indexOf(stage);
  return order.slice(0, Math.max(0, idx + 1));
}

type ChatTurn = {role: 'user' | 'assistant'; text: string; kind?: 'summary'};

type BookingDraft = {
  intent?: string;
  partySize?: string;
  location?: string;
  date?: string;
  time?: string;
  venue?: string;
  dietary?: string[];
  dietaryNeeds?: DietaryNeeds;
  venueResultsPage?: number;
  personalizationNoteShown?: boolean;
  occasion?: DateNightOccasion;
  spend?: DateNightSpend;
  occasionNotes?: string;
  goingWithFriendIds?: string[];
  goingWithSkipped?: boolean;
  /** Set from companion dietary leans (e.g. Emma pescatarian). */
  partyDietarySummary?: string;
};

function stageAfterGoingWith(): WizardStage {
  return 'location';
}

function toggleGoingWithFriend(
  draft: BookingDraft,
  friendId: string,
  selected: boolean,
  members: readonly FriendFoodProfile[],
): BookingDraft {
  const current = draft.goingWithFriendIds ?? [];
  const next = selected ? [...current, friendId] : current.filter((id) => id !== friendId);
  const withIds: BookingDraft = {
    ...draft,
    goingWithFriendIds: next.length > 0 ? next : undefined,
    goingWithSkipped: false,
  };
  return applyCompanionPartyInfluence(withIds, members);
}

function applyCompanionPartyInfluence(
  draft: BookingDraft,
  members: readonly FriendFoodProfile[],
): BookingDraft {
  const ids = draft.goingWithFriendIds;
  if (ids == null || ids.length === 0 || draft.goingWithSkipped === true) {
    return {...draft, partyDietarySummary: undefined};
  }
  const lookup = (id: string) => resolveFriendFoodProfile(id, members);
  const derived = derivePartyDietaryFromCompanions(ids, lookup);
  if (derived == null) {
    return {...draft, partyDietarySummary: undefined};
  }
  return {
    ...draft,
    dietaryNeeds: derived.dietaryNeeds,
    partyDietarySummary: derived.summary,
  };
}

const DIETARY_CHOICES: {label: string; value: DietaryNeeds}[] = [
  {label: 'No restrictions', value: 'none'},
  {label: 'Vegetarian', value: 'vegetarian'},
  {label: 'Vegan', value: 'vegan'},
  {label: 'Mixed', value: 'mixed'},
];

const INITIAL_BOOKING_DRAFT: BookingDraft = {location: 'Amsterdam'};

type ToolStatus = {name: string; target: string; status: 'complete' | 'running'};

type Interactive =
  | {type: 'none'}
  | {type: 'confirm'; question?: string; confirm_label?: string}
  | {type: 'dietary'; question?: string}
  | {type: 'clarify'; question?: string; options: {id: string; label: string}[]}
  | {
      type: 'options';
      title?: string;
      options: VenueOptionCard[];
      pagination?: {page: number; has_more: boolean; total: number};
    }
  | {
      type: 'detail';
      title?: string;
      detail?: {
        id?: string;
        subtitle?: string;
        description?: string;
        cta_label?: string;
        meta?: string;
        image_url?: string;
        menu_url?: string;
        menu_overview?: string;
        google_reviews_url?: string;
        tripadvisor_url?: string;
      };
    }
  | {type: 'success'; title?: string; description?: string};

type UiDirective = {tool_status?: ToolStatus[]; interactive?: Interactive};

type PostSummaryItem =
  | {type: 'message'; role: 'user' | 'assistant'; text: string}
  | {type: 'ui'; ui: UiDirective; venueOptions?: VenueOptionCard[]};

function findLastOptionsUiIndex(thread: PostSummaryItem[]): number {
  for (let i = thread.length - 1; i >= 0; i--) {
    const item = thread[i];
    if (item?.type === 'ui' && item.ui.interactive?.type === 'options') return i;
  }
  return -1;
}

function appendAgentResponseToThread(
  thread: PostSummaryItem[],
  replyText: string,
  ui: UiDirective | null,
  mergeOptions: boolean,
): PostSummaryItem[] {
  const next = [...thread];
  if (replyText.trim().length > 0) {
    next.push({type: 'message', role: 'assistant', text: replyText});
  }
  if (ui == null) return next;

  const interactive = ui.interactive;
  if (interactive?.type === 'options') {
    const page = interactive.pagination?.page ?? 0;
    if (mergeOptions || page > 0) {
      const idx = findLastOptionsUiIndex(next);
      if (idx >= 0) {
        const existing = next[idx] as Extract<PostSummaryItem, {type: 'ui'}>;
        next[idx] = {
          type: 'ui',
          ui: {...existing.ui, tool_status: ui.tool_status, interactive},
          venueOptions: [...(existing.venueOptions ?? []), ...interactive.options],
        };
        return next;
      }
    }
    next.push({type: 'ui', ui, venueOptions: interactive.options});
    return next;
  }

  if (interactive != null && interactive.type !== 'none') {
    next.push({type: 'ui', ui});
  }
  return next;
}

function threadToAgentHistory(
  messages: ChatTurn[],
  wizardThread: PostSummaryItem[],
  postThread: PostSummaryItem[],
): ChatTurn[] {
  const summaryIndex = messages.findIndex((m) => m.kind === 'summary');
  const beforeSummary = summaryIndex >= 0 ? messages.slice(0, summaryIndex) : messages;
  const summaryTurns = summaryIndex >= 0 ? [messages[summaryIndex]!] : [];
  const toTurns = (thread: PostSummaryItem[]) =>
    thread
      .filter((item): item is Extract<PostSummaryItem, {type: 'message'}> => item.type === 'message')
      .map((item) => ({role: item.role, text: item.text}));
  return [...beforeSummary, ...toTurns(wizardThread), ...summaryTurns, ...toTurns(postThread)];
}

function ComposerThreadMessages({
  items,
  keyPrefix,
}: {
  items: PostSummaryItem[];
  keyPrefix: string;
}) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type !== 'message') return null;
        if (item.role === 'assistant') {
          return (
            <ChatMessage
              key={`${keyPrefix}-${index}`}
              sender="assistant"
              avatar={QUIET_TABLE_AVATAR}
              className="chat-message--inline"
              style={chatMessageInlineStyle}>
              <ChatMessageBubble style={chatBubblePadding}>
                <Markdown density="compact">{item.text}</Markdown>
              </ChatMessageBubble>
            </ChatMessage>
          );
        }
        return (
          <ChatMessage key={`${keyPrefix}-${index}`} sender="user">
            <ChatMessageBubble style={chatBubblePadding}>{item.text}</ChatMessageBubble>
          </ChatMessage>
        );
      })}
    </>
  );
}

function uiBlockIsVisible(ui: UiDirective): boolean {
  return (ui.tool_status?.length ?? 0) > 0 || (ui.interactive != null && ui.interactive.type !== 'none');
}

function stopCardSelect(event: MouseEvent) {
  event.stopPropagation();
}

function openExternalLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function VenueCardActions({
  onBookTable,
  onViewMenu,
  hasMenuLink,
}: {
  onBookTable: () => void;
  onViewMenu: () => void;
  hasMenuLink: boolean;
}) {
  const halfWidth: CSSProperties = {flex: '1 1 0', width: '50%'};

  return (
    <HStack gap={2} onClick={stopCardSelect} style={{width: '100%'}}>
      <Button label="Book a table" variant="primary" style={halfWidth} onClick={onBookTable} />
      {hasMenuLink && (
        <Button label="View menu" variant="secondary" style={halfWidth} onClick={onViewMenu} />
      )}
    </HStack>
  );
}

function DetailAiBlurb({text}: {text: string}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = text.length > 96;

  return (
    <VStack gap={1} onClick={stopCardSelect}>
      <HStack gap={1} vAlign="start">
        <Sparkles size={14} strokeWidth={1.8} aria-hidden />
        <Text
          color="secondary"
          style={
            expanded || !canExpand
              ? undefined
              : {
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }
          }>
          {text}
        </Text>
      </HStack>
      {canExpand && (
        <Button
          label={expanded ? 'Show less' : 'Read more…'}
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((open) => !open)}
        />
      )}
    </VStack>
  );
}

function DetailVenueCard({
  title,
  subtitle,
  description,
  menuOverview,
  imageUrl,
  ratings,
  menuAction,
  onBookTable,
}: {
  title?: string;
  subtitle?: string;
  description?: string;
  menuOverview?: string;
  imageUrl?: string;
  ratings: string | null;
  menuAction: MenuAction | null;
  onBookTable: () => void;
}) {
  const aiWriteUps = venueAiWriteUps({description, menu_overview: menuOverview});

  const handleViewMenu = () => {
    if (menuAction?.mode === 'exact') {
      openExternalLink(menuAction.url);
    }
  };

  return (
    <Card variant="muted" padding={3}>
      <VStack gap={2}>
        {imageUrl != null && (
          <div
            aria-hidden
            style={{
              width: '100%',
              height: 140,
              borderRadius: 'var(--radius-container)',
              backgroundImage: `url(${imageUrl})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />
        )}
        <VStack gap={0}>
          <Text type="label" weight="semibold">
            {title}
          </Text>
          {subtitle != null && (
            <Text type="supporting" color="secondary">
              {subtitle}
            </Text>
          )}
          {ratings != null && (
            <Text type="supporting" color="secondary">
              {ratings}
            </Text>
          )}
        </VStack>
        {aiWriteUps.map((text, index) => (
          <DetailAiBlurb key={`detail-ai-${index}`} text={text} />
        ))}
        <VenueCardActions
          onBookTable={onBookTable}
          onViewMenu={handleViewMenu}
          hasMenuLink={menuAction != null}
        />
      </VStack>
    </Card>
  );
}

type SendOptions = {
  displayAsSummary?: boolean;
  skipUserMessage?: boolean;
  mergeOptions?: boolean;
};

function AgentUiBlock({
  ui,
  venueOptions,
  bookingDraft,
  onSend,
  onSelectVenue,
  showMoreEnabled = true,
  userMemory,
}: {
  ui: UiDirective;
  venueOptions?: VenueOptionCard[];
  bookingDraft: BookingDraft;
  onSend: (text: string, draft?: BookingDraft, options?: SendOptions) => void;
  onSelectVenue: (title: string) => void;
  showMoreEnabled?: boolean;
  userMemory: UserMemory;
}) {
  const interactive = ui.interactive;
  const listingOptions =
    interactive?.type === 'options'
      ? filterExcludedVenues(venueOptions ?? interactive.options, userMemory)
      : [];

  return (
    <VStack gap={3}>
      {ui.tool_status != null && ui.tool_status.length > 0 && (
        <ChatToolCalls defaultIsExpanded calls={ui.tool_status} />
      )}

      {interactive?.type === 'confirm' && (
        <VStack gap={2}>
          {interactive.question != null && <Text>{interactive.question}</Text>}
          <Button
            label={interactive.confirm_label ?? 'Confirm'}
            variant="primary"
            onClick={() => onSend(interactive.confirm_label ?? 'Confirmed', bookingDraft)}
          />
        </VStack>
      )}

      {interactive?.type === 'dietary' && (
        <VStack gap={2}>
          {interactive.question != null && <Text>{interactive.question}</Text>}
          <HStack gap={2} wrap="wrap">
            {DIETARY_CHOICES.map((choice) => (
              <SelectableCard
                key={choice.value}
                label={choice.label}
                style={{padding: 'var(--spacing-3)'}}
                isSelected={false}
                onChange={(isSelected) => {
                  if (!isSelected) return;
                  onSend(choice.label, {
                    ...bookingDraft,
                    dietaryNeeds: choice.value,
                    venueResultsPage: 0,
                    venue: undefined,
                  });
                }}>
                <Text type="label" weight="semibold">
                  {choice.label}
                </Text>
              </SelectableCard>
            ))}
          </HStack>
        </VStack>
      )}

      {interactive?.type === 'clarify' && (
        <VStack gap={2}>
          {interactive.question != null && (
            <Text type="label" weight="semibold">
              {interactive.question}
            </Text>
          )}
          <HStack gap={2} wrap="wrap">
            {interactive.options.map((option) => (
              <SelectableCard
                key={option.id}
                label={option.label}
                style={{padding: 'var(--spacing-3)'}}
                isSelected={false}
                onChange={(isSelected) => {
                  if (!isSelected) return;
                  onSend(option.label, bookingDraft);
                }}>
                <Text type="label" weight="semibold">
                  {option.label}
                </Text>
              </SelectableCard>
            ))}
          </HStack>
        </VStack>
      )}

      {interactive?.type === 'options' && (
        <VStack gap={2}>
          {interactive.title != null && (
            <Text type="label" weight="semibold">
              {interactive.title}
            </Text>
          )}
          {listingOptions.map((option) => {
            const enriched = enrichVenueOption(option);
            return (
              <Card key={option.id} padding={4}>
                <VenueResultListingContent
                  option={enriched}
                  date={bookingDraft.date}
                  time={bookingDraft.time}
                  dietaryNeeds={bookingDraft.dietaryNeeds}
                  onBookTable={() => onSelectVenue(enriched.title)}
                  userMemory={userMemory}
                />
              </Card>
            );
          })}
          {showMoreEnabled && interactive.pagination?.has_more === true && (
            <Button
              label="Show more restaurants"
              variant="secondary"
              onClick={() => {
                const nextPage = (bookingDraft.venueResultsPage ?? 0) + 1;
                onSend(
                  'Show more restaurants',
                  {...bookingDraft, venueResultsPage: nextPage},
                  {skipUserMessage: true, mergeOptions: true},
                );
              }}
            />
          )}
        </VStack>
      )}

      {interactive?.type === 'detail' && (() => {
        const known = interactive.title != null ? findVenueOption(interactive.title) : undefined;
        const sparseOption: VenueOptionCard | undefined =
          interactive.title != null
            ? {
                id: known?.id ?? interactive.title,
                title: interactive.title,
                subtitle: interactive.detail?.subtitle,
                description: interactive.detail?.description,
                menu_url: interactive.detail?.menu_url,
                menu_overview: interactive.detail?.menu_overview,
                image_url: interactive.detail?.image_url,
              }
            : undefined;
        const detailOption =
          sparseOption != null ? enrichVenueOption(sparseOption) : undefined;
        const menuAction = detailOption != null ? resolveMenuAction(detailOption) : null;
        const ratings =
          detailOption?.michelin_guide_url != null
            ? null
            : detailOption != null
              ? formatRatingsLine(detailOption)
              : null;
        return (
          <DetailVenueCard
            title={interactive.title}
            subtitle={interactive.detail?.subtitle}
            description={interactive.detail?.description}
            menuOverview={interactive.detail?.menu_overview}
            imageUrl={interactive.detail?.image_url}
            ratings={ratings}
            menuAction={menuAction}
            onBookTable={() => {
              if (interactive.title != null) onSelectVenue(interactive.title);
            }}
          />
        );
      })()}

      {interactive?.type === 'success' && (
        <Banner
          status="success"
          title={interactive.title ?? 'All set.'}
          description={interactive.description}
          endContent={<Button label="Done" variant="ghost" size="sm" />}
        />
      )}
    </VStack>
  );
}

function withDraftField<K extends keyof BookingDraft>(
  draft: BookingDraft,
  key: K,
  value: BookingDraft[K],
): BookingDraft {
  return {...draft, [key]: value};
}

function applyPartySizeSelection(draft: BookingDraft, size: string): BookingDraft {
  if (size === '6+' && draft.intent === CASUAL_INTENT_MESSAGE) {
    return {...draft, intent: GROUP_INTENT_MESSAGE, partySize: size};
  }
  return withDraftField(draft, 'partySize', size);
}

function isGroupHandoffFromCasual(draft: BookingDraft, size: string): boolean {
  return size === '6+' && draft.intent === CASUAL_INTENT_MESSAGE;
}

function toTitleCase(place: string): string {
  return place
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function looksLikeLocationText(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 48) return false;
  if (/\b(show more|book|confirm|reserve|yes|vegetarian|vegan|mixed|restrictions)\b/i.test(lower)) {
    return false;
  }
  if (/\b(casual|date night|michelin|business|group|party of|for \d)\b/i.test(lower)) return false;
  if (/\b([6-9](?::30|:00)?\s?(?:pm|p\.m\.))\b/i.test(lower)) return false;
  return /^[a-zA-ZÀ-ÿ\s'.-]+$/.test(trimmed);
}

function mergeDraftFromText(
  draft: BookingDraft,
  text: string,
  stage?: WizardStage,
  wizardComplete = false,
): BookingDraft {
  const lower = text.toLowerCase();
  const next = {...draft};

  const partyMatch = lower.match(/\b(?:party of|for)\s+(\d+)\b/);
  if (partyMatch != null) next.partySize = partyMatch[1];

  const parsedLocation = parseLocationFromMessage(text);
  if (parsedLocation != null) next.location = parsedLocation;

  const placeMatch = text.match(/\b(?:in|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (placeMatch != null && parsedLocation == null) next.location = placeMatch[1];
  if (lower.includes('amsterdam') && parsedLocation == null) next.location = 'Amsterdam';

  const maySetLocation =
    stage === 'location' || (wizardComplete && draft.intent != null && draft.time != null);
  if (maySetLocation && looksLikeLocationText(text)) {
    next.location = toTitleCase(text.trim());
  }

  const timeMatch = lower.match(/\b([6-9](?::30|:00)?\s?(?:pm|p\.m\.))\b/);
  if (timeMatch != null) next.time = timeMatch[1].replace(/\s+/g, '');

  if (lower.includes('casual')) next.intent = 'Something casual, nothing fussy.';
  if (lower.includes('date night')) next.intent = "I'm looking for a date night table.";
  if (lower.includes('michelin')) next.intent = 'Find me a Michelin star table.';
  if (lower.includes('business')) next.intent = 'I need a table for a business dinner.';
  if (lower.includes('group')) next.intent = 'I need a table for a group.';

  return next;
}

async function callAgent(
  history: ChatTurn[],
  message: string,
  location: string | null,
  draft: BookingDraft,
  tasteProfile: TasteProfile | null,
): Promise<{text: string; ui: UiDirective | null}> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({history, message, location, draft, tasteProfile}),
  });
  const body = (await res.json()) as {text: string; ui: UiDirective | null; error?: string};
  if (!res.ok) {
    throw new Error(body.error ?? `agent request failed: ${res.status}`);
  }
  return body;
}

export default function Home() {
  const router = useRouter();
  const {userId: clerkUserId, isLoaded: isAuthLoaded} = useAuth();
  const {user: clerkUser} = useUser();
  const {members: memberFriends} = useMemberFriends();
  const wizardCompanionFriends = useMemo(
    () => (memberFriends.length > 0 ? memberFriends.slice(0, 8) : listWizardCompanionFriends()),
    [memberFriends],
  );
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [postSummaryThread, setPostSummaryThread] = useState<PostSummaryItem[]>([]);
  const [wizardComposerThread, setWizardComposerThread] = useState<PostSummaryItem[]>([]);
  const [locationFromComposer, setLocationFromComposer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mainSection, setMainSection] = useState<HomeMainSection>('find');
  // Fixed pre-agent wizard: intent -> party size -> location -> date -> time.
  const [stage, setStage] = useState<WizardStage>('intent');
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>(INITIAL_BOOKING_DRAFT);
  // Which chip set the size step shows — most intents use the full 1-9+
  // range, but some (Michelin star) swap in a shorter, more realistic one.
  const [activePartySizes, setActivePartySizes] = useState<string[]>(DEFAULT_PARTY_SIZES);
  // Some intents (date night) skip the size step outright — remembered so
  // scroll-back through the stacked wizard skips a step that was never shown.
  const [sizeStepSkipped, setSizeStepSkipped] = useState(false);
  const [dateNightStepsIncluded, setDateNightStepsIncluded] = useState(false);
  const [intentAcknowledgement, setIntentAcknowledgement] = useState<string | null>(null);
  // Real geolocation doesn't resolve in this sandboxed preview environment
  // (no permission prompt reaches it), so the prototype assumes it was
  // already shared at the start of the session and defaults to Amsterdam.
  // A real deployment would start this at null and rely on requestLocation.
  const userLocation = bookingDraft.location ?? null;
  const wizardComplete = messages.some((m) => m.kind === 'summary');
  const skipGoingWithStep = isSoloPartySize(bookingDraft.partySize);
  const visibleStages = useMemo(
    () =>
      visibleWizardStages(
        stage,
        wizardComplete,
        sizeStepSkipped,
        dateNightStepsIncluded,
        skipGoingWithStep,
      ),
    [stage, wizardComplete, sizeStepSkipped, dateNightStepsIncluded, skipGoingWithStep],
  );
  const summaryIndex = messages.findIndex((m) => m.kind === 'summary');
  const messagesBeforeSummary = summaryIndex >= 0 ? messages.slice(0, summaryIndex) : messages;
  const summaryMessage = summaryIndex >= 0 ? messages[summaryIndex] : null;
  const lastOptionsUiIndex = findLastOptionsUiIndex(postSummaryThread);
  const hasVenueResults = lastOptionsUiIndex >= 0;
  const showingDietary =
    !hasVenueResults &&
    postSummaryThread.some((item) => item.type === 'ui' && item.ui.interactive?.type === 'dietary');
  const composerPlaceholder = resolveComposerPlaceholder({
    stage,
    wizardComplete,
    hasVenueResults,
    showingDietary,
  });

  // Best-effort: ask for location. If permission is denied or geolocation
  // isn't available, userLocation just stays null — the location wizard
  // step falls back to a "share my location" retry, and if that's declined
  // too, typing an area into the composer works exactly as it always has.
  const requestLocation = () => {
    if (typeof navigator === 'undefined' || navigator.geolocation == null) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reverseGeocode(position.coords.latitude, position.coords.longitude).then((place) => {
          if (place != null) {
            setBookingDraft((prev) => withDraftField(prev, 'location', place));
            setLocationFromComposer(false);
          }
        });
      },
      () => {},
      {timeout: 5000},
    );
  };

  const userMemory = useMemo(() => getUserMemory(tasteProfile), [tasteProfile]);

  useEffect(() => {
    if (!isAuthLoaded || clerkUserId == null) return;
    let cancelled = false;
    void import('@/lib/profile-sync').then(({hydrateTasteProfileWithServer}) =>
      hydrateTasteProfileWithServer(clerkUserId),
    ).then((profile) => {
      if (cancelled) return;
      if (!isOnboardingComplete(profile)) {
        router.replace('/onboarding');
        return;
      }
      const withClerk = mergeClerkUserIntoProfile(profile, clerkUser);
      if (withClerk !== profile) {
        saveTasteProfile(withClerk);
      }
      setTasteProfile(withClerk);
      const name = profile.username.trim();
      setMessages([
        {
          role: 'assistant',
          text: name.length > 0 ? `Welcome, ${name}. Let's find your table.` : `Welcome. Let's find your table.`,
        },
      ]);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router, isAuthLoaded, clerkUserId, clerkUser]);

  useEffect(() => {
    if (tasteProfile == null || clerkUser == null) return;
    const merged = mergeClerkUserIntoProfile(tasteProfile, clerkUser);
    if (merged === tasteProfile) return;
    saveTasteProfile(merged);
    setTasteProfile(merged);
  }, [clerkUser, tasteProfile]);

  useEffect(() => {
    requestLocation();
  }, []);

  if (!isAuthLoaded || clerkUserId == null || !ready) {
    return (
      <Layout
        height="fill"
        content={
          <LayoutContent>
            <VStack hAlign="center" vAlign="center" style={{minHeight: '60dvh'}}>
              <Text color="secondary">Loading your table…</Text>
            </VStack>
          </LayoutContent>
        }
      />
    );
  }

  const demoResetAvatar = (
    <button
      type="button"
      onClick={() => router.push('/onboarding?reset=1')}
      aria-label="Restart onboarding demo"
      title="Restart onboarding demo"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        borderRadius: '9999px',
        display: 'inline-flex',
        lineHeight: 0,
      }}>
      <Avatar src="/brand/quiet-table-mark.svg" name="Quiet Table" alt="Quiet Table" size="xsmall" />
    </button>
  );

  const send = async (text: string, draftOverride?: BookingDraft, options?: SendOptions) => {
    if (text.trim().length === 0 || isLoading) return;
    const summaryExists = messages.some((m) => m.kind === 'summary');
    const isSummaryTurn = options?.displayAsSummary === true;

    const activeComposerThread = summaryExists ? postSummaryThread : wizardComposerThread;

    const threadForHistory =
      !options?.skipUserMessage && !isSummaryTurn
        ? [...activeComposerThread, {type: 'message' as const, role: 'user' as const, text}]
        : activeComposerThread;

    const history = isSummaryTurn
      ? threadToAgentHistory(
          messages.filter((m) => m.kind !== 'summary'),
          wizardComposerThread,
          [],
        )
      : summaryExists
        ? threadToAgentHistory(messages, wizardComposerThread, threadForHistory)
        : threadToAgentHistory(messages, threadForHistory, []);

    let nextDraft =
      draftOverride ?? mergeDraftFromText(bookingDraft, text, stage, summaryExists);

    if (
      summaryExists &&
      nextDraft.location != null &&
      nextDraft.location !== bookingDraft.location
    ) {
      nextDraft = {
        ...nextDraft,
        venue: undefined,
        venueResultsPage: 0,
        personalizationNoteShown: false,
      };
      setMessages((prev) => {
        const summaryIdx = prev.findIndex((m) => m.kind === 'summary');
        if (summaryIdx < 0) return prev;
        const updatedSummary = formatDraftSummary(nextDraft, memberFriends);
        return prev.map((m, i) => (i === summaryIdx ? {...m, text: updatedSummary} : m));
      });
      setLocationFromComposer(true);
    }

    const locationPickedInWizard =
      !summaryExists &&
      stage === 'location' &&
      draftOverride == null &&
      nextDraft.location != null &&
      nextDraft.location !== bookingDraft.location;

    if (locationPickedInWizard) {
      setBookingDraft(nextDraft);
      setLocationFromComposer(true);
      setWizardComposerThread((prev) => [
        ...prev,
        {type: 'message', role: 'user', text},
        {
          type: 'message',
          role: 'assistant',
          text: `Got it — I'll look around ${nextDraft.location}.`,
        },
      ]);
      setStage(dateNightStepsIncluded ? 'occasion' : 'date');
      return;
    }

    setBookingDraft(nextDraft);

    if (isSummaryTurn) {
      setMessages((prev) => {
        const priorSummaryIndex = prev.findIndex((m) => m.kind === 'summary');
        const base = priorSummaryIndex >= 0 ? prev.slice(0, priorSummaryIndex) : prev;
        return [...base, {role: 'assistant', text, kind: 'summary' as const}];
      });
    } else if (!options?.skipUserMessage) {
      if (summaryExists) {
        setPostSummaryThread((prev) => [...prev, {type: 'message', role: 'user', text}]);
      } else {
        setWizardComposerThread((prev) => [...prev, {type: 'message', role: 'user', text}]);
      }
    }

    setIsLoading(true);
    try {
      const {text: replyText, ui} = await callAgent(
        history,
        text,
        nextDraft.location ?? userLocation,
        nextDraft,
        tasteProfile,
      );
      const appendResponse = (prev: PostSummaryItem[]) =>
        appendAgentResponseToThread(prev, replyText, ui, options?.mergeOptions === true);
      if (isSummaryTurn || summaryExists) {
        setPostSummaryThread((prev) => appendResponse(prev));
      } else {
        setWizardComposerThread((prev) => appendResponse(prev));
      }
      if (ui?.interactive?.type === 'options' && (ui.interactive.pagination?.page ?? 0) === 0) {
        setBookingDraft((prev) => ({...prev, personalizationNoteShown: true}));
      }
    } catch (error) {
      const errorText =
        error instanceof Error && error.message.length > 0
          ? error.message
          : 'Something went wrong reaching the agent — mind trying again?';
      if (isSummaryTurn || summaryExists) {
        setPostSummaryThread((prev) => [...prev, {type: 'message', role: 'assistant', text: errorText}]);
      } else {
        setWizardComposerThread((prev) => [...prev, {type: 'message', role: 'assistant', text: errorText}]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <VStack style={root}>
      <Layout
        height="fill"
        content={
          <LayoutContent>
            <HStack height="100%">
              <VStack style={chatShell} hAlign="center" gap={2}>
                <HomeSectionTabBar value={mainSection} onChange={setMainSection} />
                {mainSection === 'find' ? (
                <ChatLayout
                  style={chatLayout}
                  density="spacious"
                  composer={
                    <ChatComposer
                      density="spacious"
                      onSubmit={send}
                      isDisabled={isLoading}
                      placeholder={composerPlaceholder}
                    />
                  }>
                  <ChatMessageList density="spacious">
                    {messagesBeforeSummary.map((turn, index) =>
                      turn.role === 'assistant' ? (
                        <ChatMessage
                          key={index}
                          sender="assistant"
                          avatar={index === 0 ? demoResetAvatar : QUIET_TABLE_AVATAR}
                          className="chat-message--inline"
                          style={chatMessageInlineStyle}>
                          <ChatMessageBubble style={chatBubblePadding}>
                            <Markdown density="compact">{turn.text}</Markdown>
                          </ChatMessageBubble>
                        </ChatMessage>
                      ) : (
                        <ChatMessage key={index} sender="user">
                          <ChatMessageBubble style={chatBubblePadding}>{turn.text}</ChatMessageBubble>
                        </ChatMessage>
                      ),
                    )}

                    {visibleStages.includes('intent') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={2} align="start">
                            {INTENT_CARDS.map((card) => (
                              <SelectableCard
                                key={card.id}
                                label={card.title}
                                style={{padding: 'var(--spacing-4)'}}
                                isSelected={false}
                                onChange={(isSelected) => {
                                  if (!isSelected) return;
                                  setMessages((prev) => (prev.length > 0 ? [prev[0]!] : []));
                                  setPostSummaryThread([]);
                                  setWizardComposerThread([]);
                                  setLocationFromComposer(false);
                                  setDateNightStepsIncluded(false);
                                  setBookingDraft((prev) => ({
                                    ...INITIAL_BOOKING_DRAFT,
                                    location: prev.location ?? 'Amsterdam',
                                  }));
                                  setIntentAcknowledgement(card.acknowledgement);
                                  if (card.fixedPartySize != null) {
                                    setBookingDraft((prev) => ({
                                      ...prev,
                                      intent: card.message,
                                      partySize: card.fixedPartySize,
                                    }));
                                    setSizeStepSkipped(true);
                                    setDateNightStepsIncluded(card.id === 'date-night');
                                    setStage('location');
                                  } else {
                                    setBookingDraft((prev) => ({...prev, intent: card.message, partySize: undefined}));
                                    setSizeStepSkipped(false);
                                    setDateNightStepsIncluded(false);
                                    setActivePartySizes(card.partySizes ?? DEFAULT_PARTY_SIZES);
                                    setStage('size');
                                  }
                                }}>
                                <VStack gap={0}>
                                  <Text type="label" weight="semibold">
                                    {card.title}
                                  </Text>
                                  <Text type="supporting" color="secondary">
                                    {card.subtitle}
                                  </Text>
                                </VStack>
                              </SelectableCard>
                            ))}
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('size') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>
                              {intentAcknowledgement != null
                                ? `${intentAcknowledgement} How many of you?`
                                : 'How many of you?'}
                            </Text>
                            <HStack gap={2} wrap="wrap">
                              {activePartySizes.map((size) => (
                                <SelectableCard
                                  key={size}
                                  label={size}
                                  width={56}
                                  style={{padding: 'var(--spacing-3)'}}
                                  isSelected={bookingDraft.partySize === size}
                                  onChange={(isSelected) => {
                                    if (!isSelected) return;
                                    if (isGroupHandoffFromCasual(bookingDraft, size)) {
                                      setIntentAcknowledgement(GROUP_INTENT_ACKNOWLEDGEMENT);
                                    }
                                    const solo = isSoloPartySize(size);
                                    setBookingDraft((prev) => {
                                      const next = applyPartySizeSelection(prev, size);
                                      if (!solo) return next;
                                      return {
                                        ...next,
                                        goingWithFriendIds: undefined,
                                        goingWithSkipped: true,
                                        partyDietarySummary: undefined,
                                        dietaryNeeds:
                                          next.partyDietarySummary != null ? undefined : next.dietaryNeeds,
                                      };
                                    });
                                    setStage(solo ? stageAfterGoingWith() : 'goingWith');
                                  }}>
                                  <Text type="label" weight="semibold" justify="center">
                                    {size}
                                  </Text>
                                </SelectableCard>
                              ))}
                            </HStack>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('goingWith') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <WizardGoingWithStep
                            intentLead={intentAcknowledgement}
                            friends={wizardCompanionFriends}
                            selectedFriendIds={bookingDraft.goingWithFriendIds ?? []}
                            onToggleFriend={(friendId, selected) => {
                              setBookingDraft((prev) =>
                                toggleGoingWithFriend(prev, friendId, selected, memberFriends),
                              );
                            }}
                            onSkip={() => {
                              setBookingDraft((prev) => ({
                                ...prev,
                                goingWithFriendIds: undefined,
                                goingWithSkipped: true,
                                partyDietarySummary: undefined,
                                ...(prev.partyDietarySummary != null ? {dietaryNeeds: undefined} : {}),
                              }));
                              setStage(stageAfterGoingWith());
                            }}
                            onContinue={() => {
                              setBookingDraft((prev) => applyCompanionPartyInfluence(prev, memberFriends));
                              setStage(stageAfterGoingWith());
                            }}
                          />
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('location') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>
                              {intentAcknowledgement != null
                                ? `${intentAcknowledgement} Where should I look?`
                                : 'Where should I look?'}
                            </Text>
                            {userLocation != null ? (
                              <VStack gap={2}>
                                <ClickableCard
                                  label={userLocation}
                                  padding={4}
                                  onClick={() => {
                                    setBookingDraft((prev) => withDraftField(prev, 'location', userLocation));
                                    setLocationFromComposer(false);
                                    setStage(dateNightStepsIncluded ? 'occasion' : 'date');
                                  }}>
                                  <VStack gap={0}>
                                    <Text type="label" weight="semibold">
                                      {userLocation}
                                    </Text>
                                    <Text type="supporting" color="secondary">
                                      {locationFromComposer
                                        ? "Let's look for a table"
                                        : 'Based on your location'}
                                    </Text>
                                  </VStack>
                                </ClickableCard>
                              </VStack>
                            ) : (
                              <VStack gap={2}>
                                <Text color="secondary">Type a neighborhood or city below, or share your location.</Text>
                                <Button label="Share my location" size="sm" onClick={requestLocation} />
                              </VStack>
                            )}
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    <ComposerThreadMessages items={wizardComposerThread} keyPrefix="wizard" />

                    {visibleStages.includes('occasion') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>What kind of night is it?</Text>
                            <VStack gap={2}>
                              {DATE_NIGHT_OCCASION_CARDS.map((card) => (
                                <ClickableCard
                                  key={card.id}
                                  label={card.title}
                                  padding={4}
                                  onClick={() => {
                                    setBookingDraft((prev) => withDraftField(prev, 'occasion', card.id));
                                    setStage('spend');
                                  }}>
                                  <VStack gap={0}>
                                    <Text type="label" weight="semibold">
                                      {card.title}
                                    </Text>
                                    <Text type="supporting" color="secondary">
                                      {card.subtitle}
                                    </Text>
                                  </VStack>
                                </ClickableCard>
                              ))}
                            </VStack>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('spend') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>What sort of budget are we thinking?</Text>
                            <VStack gap={2}>
                              {DATE_NIGHT_SPEND_CARDS.map((card) => (
                                <ClickableCard
                                  key={card.id}
                                  label={card.title}
                                  padding={4}
                                  onClick={() => {
                                    setBookingDraft((prev) => withDraftField(prev, 'spend', card.id));
                                    setStage('date');
                                  }}>
                                  <VStack gap={0}>
                                    <Text type="label" weight="semibold">
                                      {card.title}
                                    </Text>
                                    <Text type="supporting" color="secondary">
                                      {card.subtitle}
                                    </Text>
                                  </VStack>
                                </ClickableCard>
                              ))}
                            </VStack>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('date') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" className="wizard-block--wide" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>Which night?</Text>
                            <Card padding={3}>
                              <Calendar
                                mode="single"
                                min={TODAY_ISO}
                                onChange={(value: string | undefined) => {
                                  if (value == null) return;
                                  setBookingDraft((prev) => {
                                    const {time, ...rest} = prev;
                                    return {...rest, date: value};
                                  });
                                  setStage('time');
                                }}
                              />
                            </Card>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('time') && bookingDraft.date != null && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>What time on {formatDateForMessage(bookingDraft.date)}?</Text>
                            <HStack gap={2} wrap="wrap">
                              {TIME_SLOTS.map((slot) => (
                                  <SelectableCard
                                    key={slot}
                                    label={slot}
                                    style={{padding: 'var(--spacing-3)'}}
                                    isSelected={bookingDraft.time === slot}
                                    onChange={(isSelected) => {
                                      if (!isSelected) return;
                                      const nextDraft = withDraftField(bookingDraft, 'time', slot);
                                      setBookingDraft(nextDraft);
                                      requestAnimationFrame(() => {
                                        send(formatDraftSummary(nextDraft, memberFriends), nextDraft, {
                                          displayAsSummary: true,
                                        });
                                      });
                                    }}>
                                    <Text type="label" weight="semibold" justify="center">
                                      {slot}
                                    </Text>
                                  </SelectableCard>
                              ))}
                            </HStack>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {summaryMessage != null && (
                      <ChatMessage
                        sender="assistant"
                        avatar={QUIET_TABLE_AVATAR}
                        className="chat-message--inline"
                        style={chatMessageInlineStyle}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <Text color="secondary">{summaryMessage.text}</Text>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {postSummaryThread.map((item, index) => {
                      if (item.type === 'message') {
                        return item.role === 'assistant' ? (
                          <ChatMessage
                            key={`thread-${index}`}
                            sender="assistant"
                            avatar={QUIET_TABLE_AVATAR}
                            className="chat-message--inline"
                            style={chatMessageInlineStyle}>
                            <ChatMessageBubble style={chatBubblePadding}>
                              <Markdown density="compact">{item.text}</Markdown>
                            </ChatMessageBubble>
                          </ChatMessage>
                        ) : (
                          <ChatMessage key={`thread-${index}`} sender="user">
                            <ChatMessageBubble style={chatBubblePadding}>{item.text}</ChatMessageBubble>
                          </ChatMessage>
                        );
                      }

                      if (item.type === 'ui' && uiBlockIsVisible(item.ui)) {
                        return (
                          <ChatMessage
                            key={`thread-${index}`}
                            sender="assistant"
                            avatar={QUIET_TABLE_AVATAR}>
                            <ChatMessageBubble variant="ghost" className="wizard-block--wide" style={wizardBubblePadding}>
                              <AgentUiBlock
                                ui={item.ui}
                                venueOptions={item.venueOptions}
                                bookingDraft={bookingDraft}
                                onSend={send}
                                onSelectVenue={(title) =>
                                  setBookingDraft((prev) => withDraftField(prev, 'venue', title))
                                }
                                showMoreEnabled={index === lastOptionsUiIndex}
                                userMemory={userMemory}
                              />
                            </ChatMessageBubble>
                          </ChatMessage>
                        );
                      }

                      return null;
                    })}

                    {isLoading && (
                      <ChatMessage
                        sender="assistant"
                        avatar={QUIET_TABLE_AVATAR}
                        className="chat-message--inline"
                        style={chatMessageInlineStyle}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <Text color="secondary">Thinking…</Text>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}
                  </ChatMessageList>
                </ChatLayout>
                ) : mainSection === 'friends' ? (
                  <HomeFriendsTabPanel />
                ) : (
                  <HomeProfileTabPanel
                    profile={tasteProfile!}
                    onProfileSaved={(next) => {
                      setTasteProfile(next);
                      setBookingDraft((prev) => ({...prev, location: next.homeArea}));
                      setMessages((prev) => {
                        if (prev.length === 0 || prev[0]?.role !== 'assistant') return prev;
                        const name = next.username.trim();
                        const welcome =
                          name.length > 0
                            ? `Welcome, ${name}. Let's find your table.`
                            : `Welcome. Let's find your table.`;
                        return [{...prev[0]!, text: welcome}, ...prev.slice(1)];
                      });
                    }}
                  />
                )}
              </VStack>
            </HStack>
          </LayoutContent>
        }
      />
    </VStack>
  );
}
