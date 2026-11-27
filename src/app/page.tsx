'use client';

import {nudgeForText, nudgesFor} from '@/lib/find-nudges';
import {zoneCounts} from '@/lib/venue-options';
import {findHistory, markShown} from '@/lib/find-history';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
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
  MEAL_TIME,
  mealsLeft,
  type Meal,
  venueAiWriteUps,
  type DietaryNeeds,
  type MenuAction,
  type VenueOptionCard,
} from '@/lib/venue-options';
import {filterExcludedVenues, getUserMemory, type UserMemory} from '@/lib/user-memory';
import {casualPicksPage} from '@/lib/fallback-response';
import {cityLabel, hasCatalogFor} from '@/lib/city-picks';
import {
  DATE_NIGHT_OCCASION_CARDS,
  type DateNightOccasion,
} from '@/lib/date-night-occasion';
import {
  DATE_NIGHT_SPEND_CARDS,
  type DateNightSpend,
} from '@/lib/date-night-spend';
import {BookOnMapsIcon} from '@/app/components/book-on-maps-icon';
import {VenueResultListingContent} from '@/app/components/venue-result-listing';
import {HomeHeader} from '@/app/components/home-section-tabs';
import {RestaurantPanelProvider} from '@/app/components/restaurant-panel';
import {bookingUrl, catalogArea, catalogCity, catalogPlace, type CatalogCity, type Table} from '@/lib/catalog';
import {zonesOf} from '@/lib/zones';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';
import {parseLocationFromMessage} from '@/lib/parse-location';
import {handoffVenueBooking} from '@/lib/venue-booking-handoff';

// Placeholder mark until there's a real logo: a small light-green dot,
// styled and aligned in globals.css (.qt-dot).
const QUIET_TABLE_AVATAR = <span role="img" aria-label="Quiet Table" className="qt-dot" />;
// The dot marks Quiet Table speaking. Blocks that are only options (the
// kind-of-night cards, result lists) get an invisible one, to stay aligned.
const OPTIONS_SPACER = <span aria-hidden className="qt-dot" style={{visibility: 'hidden'}} />;

/** The dot for a question or message; the spacer for a block of options. */
function avatarForUi(ui: UiDirective) {
  const type = ui.interactive?.type;
  return type === 'options' || type === 'detail' ? OPTIONS_SPACER : QUIET_TABLE_AVATAR;
}


const root: CSSProperties = {height: '100dvh', width: '100%'};
const chatShell: CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  position: 'relative',
};
// Full width, so the scrollbar sits at the window's edge; the messages
// inside keep to an 800px column (globals.css).
const chatLayout: CSSProperties = {flex: 1, minHeight: 0, width: '100%'};
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
// Casual caps at 6, then a single 6+ bucket.
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

/** Short intent label for the summary bubble — not the full chip message. */
function intentSummaryLabel(intent: string | undefined): string | null {
  if (intent == null) return null;
  const lower = intent.toLowerCase();
  if (lower.includes('date night')) return 'Date night';
  if (lower.includes('casual')) return 'Casual';
  if (lower.includes('michelin')) return 'Michelin star';
  return intent.replace(/\.$/, '');
}

function formatDraftSummary(draft: BookingDraft): string {
  const intent = intentSummaryLabel(draft.intent);
  const party = draft.partySize != null ? partySizeSummaryPhrase(draft.partySize) : null;
  const parts = zonesOf(draft.location ?? '')
    .filter((zone) => draft.zones?.includes(zone.id))
    .map((zone) => zone.label);
  const place = draft.location != null ? `in ${draft.location}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}` : null;
  const when =
    draft.date != null && draft.meal != null
      ? `${formatDateForMessage(draft.date)}, ${draft.meal === 'late' ? 'late' : `for ${draft.meal}`}`
      : draft.date != null && draft.time != null
        ? `${formatDateForMessage(draft.date)} around ${draft.time}`
        : null;

  const lead = [intent, party, place].filter(Boolean).join(', ');
  if (lead.length === 0) return when != null ? `${when}.` : '';
  if (when == null) return `${lead}.`;
  return `${lead}. ${when}.`;
}


type WizardStage = 'intent' | 'size' | 'location' | 'area' | 'occasion' | 'spend' | 'date' | 'time';

// Composer teaser updates with the flow — typing is always a valid escape hatch.
// Wizard steps are set; post-summary phases (dietary, etc.) can be re-specced later.
const STAGE_PLACEHOLDERS: Record<WizardStage, string> = {
  intent: "Or just tell me what you're after...",
  size: 'Or tell me how many...',
  location: 'Or specify a location...',
  area: 'Or name a part of town...',
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

const FALLBACK_MODE_PLACEHOLDER = "Or tell me what you're after...";

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
  agentFallback: boolean;
}): string {
  if (args.agentFallback) return FALLBACK_MODE_PLACEHOLDER;
  if (args.hasVenueResults) return POST_WIZARD_PLACEHOLDERS.results;
  if (args.showingDietary) return POST_WIZARD_PLACEHOLDERS.dietary;
  if (args.wizardComplete) return POST_WIZARD_PLACEHOLDERS.default;
  return STAGE_PLACEHOLDERS[args.stage];
}

function wizardStageOrder(sizeStepSkipped: boolean, dateNightStepsIncluded: boolean): WizardStage[] {
  if (sizeStepSkipped && dateNightStepsIncluded) {
    return ['intent', 'location', 'area', 'occasion', 'spend', 'date', 'time'];
  }
  if (sizeStepSkipped) return ['intent', 'location', 'area', 'date', 'time'];
  return ['intent', 'size', 'location', 'area', 'date', 'time'];
}

function stageAfterIntentSelection(fixedPartySize: string | undefined): WizardStage {
  return fixedPartySize != null ? 'location' : 'size';
}

function visibleWizardStages(
  stage: WizardStage,
  wizardComplete: boolean,
  sizeStepSkipped: boolean,
  dateNightStepsIncluded: boolean,
): WizardStage[] {
  const order = wizardStageOrder(sizeStepSkipped, dateNightStepsIncluded);
  if (wizardComplete) return order;
  const idx = order.indexOf(stage);
  return order.slice(0, Math.max(0, idx + 1));
}

type ChatTurn = {role: 'user' | 'assistant'; text: string; kind?: 'summary'};

type BookingDraft = {
  intent?: string;
  partySize?: string;
  location?: string;
  /** Parts of the city picked (zones.ts ids, as on iOS); none means all of it. */
  zones?: string[];
  /** Lunch or dinner: which times the time step offers. Dinner when unset. */
  meal?: Meal;
  date?: string;
  time?: string;
  venue?: string;
  dietary?: string[];
  dietaryNeeds?: DietaryNeeds;
  venueResultsPage?: number;
  personalizationNoteShown?: boolean;
  /** Latest free-text ask after results — fallback mode keyword-filters on it, show more keeps it. */
  searchQuery?: string;
  occasion?: DateNightOccasion;
  spend?: DateNightSpend;
  occasionNotes?: string;
};

/** The table so far, for booking links: the day and party. Find asks a meal,
 * not a time, so the booking page shows the free times. */
function findTable(draft: BookingDraft): Table | null {
  if (draft.date == null) return null;
  const party = Number.parseInt(draft.partySize ?? '2', 10);
  return {date: draft.date, party: Number.isNaN(party) ? 2 : party};
}

/** No accounts on the web, so no members' picks to rank by (yet). */
const NO_MEMBERS: FriendFoodProfile[] = [];

const DIETARY_CHOICES: {label: string; value: DietaryNeeds}[] = [
  {label: 'No restrictions', value: 'none'},
  {label: 'Vegetarian', value: 'vegetarian'},
  {label: 'Vegan', value: 'vegan'},
  {label: 'Mixed', value: 'mixed'},
];

// No city until one's picked (or the browser already shares where you are).
const INITIAL_BOOKING_DRAFT: BookingDraft = {};

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
  renderUi,
}: {
  items: PostSummaryItem[];
  keyPrefix: string;
  /** Cards that come back mid-wizard; text should never point at cards that aren't shown. */
  renderUi?: (item: Extract<PostSummaryItem, {type: 'ui'}>, key: string) => ReactNode;
}) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === 'ui') return renderUi?.(item, `${keyPrefix}-${index}`) ?? null;
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
      <Button
        label="Book on Maps"
        variant="primary"
        style={halfWidth}
        icon={<BookOnMapsIcon />}
        onClick={onBookTable}
      />
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
  ratings,
  menuAction,
  onBookTable,
}: {
  title?: string;
  subtitle?: string;
  description?: string;
  menuOverview?: string;
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
  communityMembers,
}: {
  ui: UiDirective;
  venueOptions?: VenueOptionCard[];
  bookingDraft: BookingDraft;
  onSend: (text: string, draft?: BookingDraft, options?: SendOptions) => void;
  onSelectVenue: (title: string) => void;
  showMoreEnabled?: boolean;
  userMemory: UserMemory;
  communityMembers: FriendFoodProfile[];
}) {
  const interactive = ui.interactive;
  const listingOptions =
    interactive?.type === 'options'
      ? filterExcludedVenues(venueOptions ?? interactive.options, userMemory)
      : [];
  // Note the places on screen as shown, so next time they step back unless opened.
  const shownKey = listingOptions.map((option) => option.id).join('|');
  useEffect(() => {
    if (shownKey.length > 0) markShown(shownKey.split('|'));
  }, [shownKey]);

  const bookVenueOnMaps = (venue: VenueOptionCard) => {
    const enriched = enrichVenueOption(venue);
    onSelectVenue(enriched.title);
    // Catalog places book where they take bookings, as on iOS.
    const place = catalogPlace(enriched.id);
    if (place != null) {
      window.open(bookingUrl(place, findTable(bookingDraft)), '_blank', 'noopener,noreferrer');
      return;
    }
    handoffVenueBooking(enriched, {
      date: bookingDraft.date,
      // A meal was picked, not a time: let the booking page show what's free.
      time: bookingDraft.meal != null ? undefined : bookingDraft.time,
      partySize: bookingDraft.partySize,
      location: bookingDraft.location,
    });
  };

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
          {/* The chat line above already says what the list is; the title
              only shows when there's nothing to list. */}
          {interactive.title != null && listingOptions.length === 0 && (
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
                  onBookTable={() => bookVenueOnMaps(enriched)}
                  userMemory={userMemory}
                  communityMembers={communityMembers}
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
            ratings={ratings}
            menuAction={menuAction}
            onBookTable={() => {
              if (detailOption != null) bookVenueOnMaps(detailOption);
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
  return withDraftField(draft, 'partySize', size);
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

type IntentCard = (typeof INTENT_CARDS)[number];

/** The wizard's intent card a typed message points at, if any. */
function intentCardFromText(text: string): IntentCard | undefined {
  const lower = text.toLowerCase();
  const id = /\bmichelin\b/.test(lower)
    ? 'michelin'
    : /\bdate( night)?\b/.test(lower)
      ? 'date-night'
      : /\bcasual\b/.test(lower)
        ? 'casual'
        : null;
  return id != null ? INTENT_CARDS.find((card) => card.id === id) : undefined;
}

function offlineNothingParsed(location: string | undefined): string {
  const where = hasCatalogFor(location) ? 'a few saved casual places' : `a few places in ${cityLabel(location!)}`;
  return `Sorry, the agent's off, so I can't chat right now. Here are ${where}, or tap an option to search properly.`;
}
const OFFLINE_SHOW_MORE = 'Show more restaurants';

/** The zone a typed area falls in: "Soho" → soho, "De Pijp" → de-pijp. */
function zoneForArea(city: CatalogCity, area: string | null): string | null {
  if (area == null) return null;
  const lower = area.toLowerCase();
  const zone = zonesOf(city).find(
    (candidate) =>
      candidate.areas.some((name) => name.toLowerCase() === lower) || candidate.label.toLowerCase().includes(lower),
  );
  return zone?.id ?? null;
}

/** The two cities Find covers on the web, as on iOS. */
const FIND_CITIES: CatalogCity[] = ['Amsterdam', 'London'];

/** Which of Find's cities a position is in, within about 40 km of the centre. */
function cityNear(lat: number, lng: number): CatalogCity | null {
  const centres: Record<CatalogCity, {lat: number; lng: number}> = {
    Amsterdam: {lat: 52.3676, lng: 4.9041},
    London: {lat: 51.5072, lng: -0.1276},
  };
  for (const city of FIND_CITIES) {
    const centre = centres[city];
    const km = Math.hypot((lat - centre.lat) * 111, (lng - centre.lng) * 111 * Math.cos((lat * Math.PI) / 180));
    if (km < 40) return city;
  }
  return null;
}

function mergeDraftFromText(
  draft: BookingDraft,
  text: string,
  stage?: WizardStage,
  wizardComplete = false,
): BookingDraft {
  const lower = text.toLowerCase();
  const next = {...draft};

  const partyMatch =
    lower.match(/\b(?:party of|for)\s+(\d+)\b/) ?? lower.match(/\b(\d+)\s+(?:of us|people|guests)\b/);
  if (partyMatch != null) next.partySize = partyMatch[1];

  const parsedLocation = parseLocationFromMessage(text);
  if (parsedLocation != null) next.location = parsedLocation;

  const placeMatch = text.match(/\b(?:in|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (placeMatch != null && parsedLocation == null) next.location = placeMatch[1];
  if (lower.includes('amsterdam') && parsedLocation == null) next.location = 'Amsterdam';

  if (!wizardComplete && stage === 'location' && looksLikeLocationText(text)) {
    // "London please" → "London": drop polite filler before saving the place.
    const place = text
      .replace(/\b(?:please|thanks|thank you|how about|let'?s try|maybe|in|near|around)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (place.length >= 2) next.location = toTitleCase(place);
  }

  const timeMatch = lower.match(/\b((?:1[0-2]|[1-9])(?::30|:00)?\s?(?:am|pm|a\.m\.|p\.m\.))(?=\s|$|[.,!?])/);
  if (timeMatch != null) next.time = timeMatch[1].replace(/\s+/g, '');
  // "Lunch", "dinner" or "late" (a meal card or typed): the meal, and a time inside it.
  const mealMatch = lower.match(/\b(lunch|dinner|late)\b/);
  if (mealMatch != null && timeMatch == null) {
    const meal = mealMatch[1] as Meal;
    next.meal = meal;
    next.time = MEAL_TIME[meal];
  }

  // Find's cities: keep the city as the location and tick the part of town
  // named ("Soho" → London, Soho & Covent Garden).
  if (next.location != null && next.location !== draft.location) {
    const city = catalogCity(next.location);
    if (city != null) {
      const zone = zoneForArea(city, catalogArea(next.location));
      next.location = city;
      next.zones = zone != null ? [zone] : [];
    }
  }

  if (lower.includes('casual')) next.intent = 'Something casual, nothing fussy.';
  if (lower.includes('date night')) next.intent = "I'm looking for a date night table.";
  if (lower.includes('michelin')) next.intent = 'Find me a Michelin star table.';

  return next;
}

/** The day's AI budget from /api/agent: the share left, and why an answer
 * came from the catalog if it did ('device': this device's answers are used). */
type Credits = {remaining: number | null; limited: string | null};

/** A random id this browser keeps, for the per-device daily AI answers. */
function deviceId(): string {
  try {
    const saved = window.localStorage.getItem('qt-device');
    if (saved != null) return saved;
    const made = crypto.randomUUID();
    window.localStorage.setItem('qt-device', made);
    return made;
  } catch {
    return 'no-storage';
  }
}

/** The line under the prompt; null when the live AI is off. */
function creditsLine(credits: Credits | null): string | null {
  if (credits == null) return null;
  if (credits.limited === 'device') {
    return 'You’ve had today’s AI answers, so picks come from Quiet Table’s places until tomorrow.';
  }
  if (credits.limited === 'budget' || (credits.remaining != null && credits.remaining <= 0)) {
    return 'Community credits are used up for today, so picks come from Quiet Table’s places until tomorrow.';
  }
  if (credits.remaining == null) return null;
  return `${Math.max(0, Math.round(credits.remaining * 100))}% of community credits remaining today`;
}

async function callAgent(
  history: ChatTurn[],
  message: string,
  location: string | null,
  draft: BookingDraft,
  catalogOnly = false,
): Promise<{text: string; ui: UiDirective | null; fallback?: boolean; credits?: Credits}> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      history,
      message,
      location,
      // Find's own steps carry what this browser has been shown and opened,
      // so the ranking can vary and keep a slot for unseen places.
      draft: catalogOnly ? {...draft, findHistory: findHistory()} : draft,
      tasteProfile: null,
      device: deviceId(),
      catalogOnly,
    }),
  });
  const body = (await res.json()) as {
    text: string;
    ui: UiDirective | null;
    fallback?: boolean;
    credits?: Credits;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `agent request failed: ${res.status}`);
  }
  return body;
}

export default function Home() {
  // Hooks must run before the loading early return below, on every render.
  const [messages, setMessages] = useState<ChatTurn[]>([
    {role: 'assistant', text: "Let's find your table."},
  ]);
  const [postSummaryThread, setPostSummaryThread] = useState<PostSummaryItem[]>([]);
  const [wizardComposerThread, setWizardComposerThread] = useState<PostSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentFallback, setAgentFallback] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);
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
  const chatLayoutScrollRef = useRef<HTMLDivElement>(null);
  const wizardComplete = messages.some((m) => m.kind === 'summary');
  const visibleStages = useMemo(
    () =>
      visibleWizardStages(
        stage,
        wizardComplete,
        sizeStepSkipped,
        dateNightStepsIncluded,
      ),
    [stage, wizardComplete, sizeStepSkipped, dateNightStepsIncluded],
  );
  const summaryIndex = messages.findIndex((m) => m.kind === 'summary');
  const messagesBeforeSummary = summaryIndex >= 0 ? messages.slice(0, summaryIndex) : messages;
  const summaryMessage = summaryIndex >= 0 ? messages[summaryIndex] : null;
  const lastOptionsUiIndex = findLastOptionsUiIndex(postSummaryThread);
  const hasVenueResults = lastOptionsUiIndex >= 0;
  const lastOptions = hasVenueResults ? postSummaryThread[lastOptionsUiIndex] : null;
  const nudges =
    lastOptions?.type === 'ui' && !isLoading
      ? nudgesFor(
          (lastOptions.venueOptions ?? []).map((option) => option.id),
          bookingDraft,
        )
      : [];
  const showingDietary =
    !hasVenueResults &&
    postSummaryThread.some((item) => item.type === 'ui' && item.ui.interactive?.type === 'dietary');
  const composerPlaceholder = resolveComposerPlaceholder({
    stage,
    wizardComplete,
    hasVenueResults,
    showingDietary,
    agentFallback,
  });

  // Where you are, only when the browser already shares it with the site (no
  // prompt): in Amsterdam or London, that city is picked for you.
  const [nearCity, setNearCity] = useState<CatalogCity | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || navigator.permissions == null || navigator.geolocation == null) return;
    let cancelled = false;
    void navigator.permissions
      .query({name: 'geolocation'})
      .then((status) => {
        if (cancelled || status.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(
          (position) => !cancelled && setNearCity(cityNear(position.coords.latitude, position.coords.longitude)),
          () => {},
          {timeout: 5000, maximumAge: 10 * 60 * 1000},
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // No accounts on the web: no saved taste, so Find runs on what's asked.
  const userMemory = useMemo(() => getUserMemory(null), []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/agent')
      .then((res) => (res.ok ? (res.json() as Promise<{fallback?: boolean; credits?: Credits}>) : null))
      .then((body) => {
        if (cancelled || body == null) return;
        setAgentFallback(body.fallback === true);
        setCredits(body.credits ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);


  // After the city: its parts of town for Find's cities, else straight on.
  function stageAfterCity(location: string | undefined): WizardStage {
    if (zonesOf(location ?? '').length > 0) return 'area';
    return dateNightStepsIncluded ? 'occasion' : 'date';
  }

  // Location step: Amsterdam or London. A new city clears the parts of town.
  const pickCity = (city: CatalogCity) => {
    setBookingDraft((prev) => ({...prev, location: city, zones: prev.location === city ? prev.zones : []}));
    setStage('area');
  };

  // Area step: tick parts of town (none = all of it), then carry on.
  const toggleZone = (zone: string | null) =>
    setBookingDraft((prev) => {
      if (zone == null) return {...prev, zones: []};
      const zones = prev.zones ?? [];
      return {...prev, zones: zones.includes(zone) ? zones.filter((id) => id !== zone) : [...zones, zone]};
    });
  const finishArea = () => setStage(dateNightStepsIncluded ? 'occasion' : 'date');

  // Already somewhere Find covers: that city comes ticked.
  useEffect(() => {
    // Picking it for them is the point: one step, when they reach the question.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stage === 'location' && bookingDraft.location == null && nearCity != null) pickCity(nearCity);
  }, [stage, nearCity, bookingDraft.location]);

  // Picking an intent restarts the wizard. On the first pick, keep anything
  // typed before it (a friend, a party size), and the location as always.
  const selectIntentCard = (card: IntentCard, typedDraft?: BookingDraft) => {
    const source = typedDraft ?? bookingDraft;
    const carried: BookingDraft =
      stage === 'intent' || typedDraft != null
        ? {
            dietaryNeeds: source.dietaryNeeds,
            partySize: source.partySize,
            time: source.time,
          }
        : {};
    const base: BookingDraft = {
      ...INITIAL_BOOKING_DRAFT,
      ...carried,
      location: source.location,
      zones: source.zones,
      intent: card.message,
    };
    setMessages((prev) => (prev.length > 0 ? [prev[0]!] : []));
    setPostSummaryThread([]);
    if (typedDraft == null) setWizardComposerThread([]);
    setIntentAcknowledgement(card.acknowledgement);
    if (card.fixedPartySize != null) {
      setBookingDraft({...base, partySize: card.fixedPartySize});
      setSizeStepSkipped(true);
      setDateNightStepsIncluded(card.id === 'date-night');
      setStage(stageAfterIntentSelection(card.fixedPartySize));
      return;
    }
    const sizes = card.partySizes ?? DEFAULT_PARTY_SIZES;
    const typedSize = base.partySize != null && sizes.includes(base.partySize) ? base.partySize : undefined;
    setBookingDraft({...base, partySize: typedSize});
    setSizeStepSkipped(false);
    setDateNightStepsIncluded(false);
    setActivePartySizes(sizes);
    if (typedSize == null) setStage('size');
    else setStage('location');
  };

  // Agent off: typed text mid-wizard fills in the wizard instead of jumping
  // to a results list the wizard can't show yet. No request is made.
  const handleOfflineWizardText = (text: string) => {
    const rest = text.trim();
    const parsed =
      rest.length > 0 ? mergeDraftFromText(bookingDraft, rest, stage, false) : bookingDraft;
    // Intent only changes through its card, below.
    const draft: BookingDraft = {...parsed, intent: bookingDraft.intent};
    const notes: string[] = [];
    const locationChanged = draft.location != null && draft.location !== bookingDraft.location;
    if (locationChanged) notes.push(`in ${draft.location}`);
    const sizeChanged = draft.partySize != null && draft.partySize !== bookingDraft.partySize;
    if (sizeChanged) notes.push(`for ${draft.partySize}`);
    if (draft.time != null && draft.time !== bookingDraft.time) notes.push(`around ${draft.time}`);

    const card = intentCardFromText(rest);
    if (card != null) notes.unshift(card.title);

    const lead =
      notes.length === 0
        ? offlineNothingParsed(bookingDraft.location)
        : `Got it: ${notes.join(', ')}.${card == null && stage === 'intent' ? ' What kind of table are you after?' : ''}`;
    const reply = lead;
    const exchange: PostSummaryItem[] = [
      {type: 'message', role: 'user', text},
      {type: 'message', role: 'assistant', text: reply},
    ];
    if (notes.length === 0) {
      setWizardComposerThread((prev) => [...prev, ...exchange]);
      void addOfflinePicks(0);
      return;
    }

    if (card != null) {
      selectIntentCard(card, draft);
      setWizardComposerThread(exchange);
      return;
    }

    setBookingDraft(draft);
    setWizardComposerThread((prev) => [...prev, ...exchange]);
    if (stage === 'size' && sizeChanged) {
      setStage('location');
    } else if (stage === 'location' && locationChanged) {
      setStage(stageAfterCity(draft.location));
    }
  };

  // Agent off and nothing to go on: a page of places for the chosen city.
  // Amsterdam comes from the saved catalog; anywhere else from OpenStreetMap.
  const addOfflinePicks = async (page: number) => {
    const location = bookingDraft.location;
    let picks: {options: VenueOptionCard[]; hasMore: boolean; total: number};
    let title = 'Saved casual places';
    if (hasCatalogFor(location)) {
      picks = casualPicksPage(page, bookingDraft, userMemory, NO_MEMBERS);
    } else {
      title = `Places in ${cityLabel(location!)}`;
      const params = new URLSearchParams({area: location!, page: String(page)});
      const diet = bookingDraft.dietaryNeeds;
      if (diet != null && diet !== 'none') params.set('diet', diet);
      setIsLoading(true);
      try {
        const res = await fetch(`/api/fallback-places?${params}`);
        picks = res.ok ? await res.json() : {options: [], hasMore: false, total: 0};
      } catch {
        picks = {options: [], hasMore: false, total: 0};
      } finally {
        setIsLoading(false);
      }
    }
    setBookingDraft((prev) => ({...prev, venueResultsPage: page}));
    setWizardComposerThread((prev) =>
      picks.total === 0 && page === 0
        ? [...prev, {type: 'message', role: 'assistant', text: "Couldn't load places just now. Tap an option above to keep going."}]
        : appendAgentResponseToThread(
            prev,
            '',
            {
              interactive: {
                type: 'options',
                title,
                options: picks.options,
                pagination: {page, has_more: picks.hasMore, total: picks.total},
              },
            },
            page > 0,
          ),
    );
  };

  const showMoreOfflinePicks = () => {
    void addOfflinePicks((bookingDraft.venueResultsPage ?? 0) + 1);
  };

  const restartFindFlow = () => {
    setMessages((prev) => (prev.length > 0 && prev[0]?.role === 'assistant' ? [prev[0]!] : prev));
    setPostSummaryThread([]);
    setWizardComposerThread([]);
    setDateNightStepsIncluded(false);
    setIntentAcknowledgement(null);
    setSizeStepSkipped(false);
    setActivePartySizes(DEFAULT_PARTY_SIZES);
    setStage('intent');
    setBookingDraft((prev) => ({
      ...INITIAL_BOOKING_DRAFT,
      location: prev.location,
      zones: prev.zones,
    }));
    setIsLoading(false);
    requestAnimationFrame(() => {
      chatLayoutScrollRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    });
  };


  const send = async (text: string, draftOverride?: BookingDraft, options?: SendOptions) => {
    if (text.trim().length === 0 || isLoading) return;
    const summaryExists = messages.some((m) => m.kind === 'summary');
    const isSummaryTurn = options?.displayAsSummary === true;
    if (agentFallback && !summaryExists && !isSummaryTurn && draftOverride == null) {
      handleOfflineWizardText(text);
      return;
    }

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
    if (summaryExists && draftOverride == null) {
      nextDraft = {...nextDraft, venue: undefined, venueResultsPage: 0, searchQuery: text};
    }

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
        const updatedSummary = formatDraftSummary(nextDraft);
        return prev.map((m, i) => (i === summaryIdx ? {...m, text: updatedSummary} : m));
      });
    }

    const locationPickedInWizard =
      !summaryExists &&
      stage === 'location' &&
      draftOverride == null &&
      nextDraft.location != null &&
      nextDraft.location !== bookingDraft.location;

    if (locationPickedInWizard) {
      setBookingDraft(nextDraft);
      setWizardComposerThread((prev) => [
        ...prev,
        {type: 'message', role: 'user', text},
        {
          type: 'message',
          role: 'assistant',
          text: `Got it — I'll look around ${nextDraft.location}.`,
        },
      ]);
      setStage(stageAfterCity(nextDraft.location));
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
      const {text: replyText, ui, fallback, credits: nextCredits} = await callAgent(
        history,
        text,
        nextDraft.location ?? null,
        nextDraft,
        // Find's own steps (the first results, diet, Show more, a nudge) come
        // from the catalog, as on iOS; only typed questions use AI credits.
        isSummaryTurn || draftOverride != null || nudgeForText(text) != null,
      );
      setAgentFallback(fallback === true);
      if (nextCredits != null) setCredits(nextCredits);
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
                <HomeHeader restartVisible={hasVenueResults && !isLoading} onRestart={restartFindFlow} />
                <RestaurantPanelProvider table={findTable(bookingDraft)}>
                <ChatLayout
                  ref={chatLayoutScrollRef}
                  style={chatLayout}
                  density="spacious"
                  composer={
                    <VStack gap={2}>
                      <ChatComposer
                        density="spacious"
                        onSubmit={send}
                        isDisabled={isLoading}
                        placeholder={composerPlaceholder}
                      />
                      {creditsLine(credits) != null && (
                        <Text type="supporting" color="secondary" justify="center">
                          {creditsLine(credits)}
                        </Text>
                      )}
                    </VStack>
                  }>
                  <ChatMessageList density="spacious">
                    {messagesBeforeSummary.map((turn, index) =>
                      turn.role === 'assistant' ? (
                        <ChatMessage
                          key={index}
                          sender="assistant"
                          avatar={QUIET_TABLE_AVATAR}
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
                      <ChatMessage sender="assistant" avatar={OPTIONS_SPACER}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={2} align="start">
                            {INTENT_CARDS.map((card) => (
                              <SelectableCard
                                key={card.id}
                                label={card.title}
                                style={{padding: 'var(--spacing-4)'}}
                                isSelected={bookingDraft.intent === card.message}
                                onChange={(isSelected) => {
                                  if (isSelected) selectIntentCard(card);
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
                                    setBookingDraft((prev) => applyPartySizeSelection(prev, size));
                                    setStage('location');
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

                    {visibleStages.includes('location') && (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>
                              {intentAcknowledgement != null
                                ? `${intentAcknowledgement} Where should I look?`
                                : 'Where should I look?'}
                            </Text>
                            <VStack gap={2} align="start">
                              {FIND_CITIES.map((city) => (
                                <SelectableCard
                                  key={city}
                                  label={city}
                                  style={{padding: 'var(--spacing-4)'}}
                                  isSelected={bookingDraft.location === city}
                                  onChange={(isSelected) => {
                                    if (isSelected) pickCity(city);
                                  }}>
                                  <VStack gap={0}>
                                    <Text type="label" weight="semibold">
                                      {city}
                                    </Text>
                                    <Text type="supporting" color="secondary">
                                      {city === nearCity
                                        ? 'Based on your location'
                                        : `${zoneCounts(bookingDraft.intent ?? '', city).total} places`}
                                    </Text>
                                  </VStack>
                                </SelectableCard>
                              ))}
                            </VStack>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

                    {visibleStages.includes('area') && bookingDraft.location != null && zonesOf(bookingDraft.location).length > 0 && (() => {
                      const city = bookingDraft.location;
                      const counts = zoneCounts(bookingDraft.intent ?? '', city);
                      const picked = bookingDraft.zones ?? [];
                      return (
                        <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                          {/* As wide as the chat column, so the parts of town wrap late. */}
                          <ChatMessageBubble variant="ghost" className="wizard-block--wide" style={wizardBubblePadding}>
                            <VStack gap={3}>
                              <Text>{`Which part of ${city}? Tick as many as you like.`}</Text>
                              <HStack gap={2} wrap="wrap" className="area-cards">
                                {[{id: null, label: 'All', count: counts.total}, ...zonesOf(city).map((zone) => ({id: zone.id, label: zone.label, count: counts.byZone.get(zone.id) ?? 0}))].map((option) => (
                                  <SelectableCard
                                    key={option.id ?? 'all'}
                                    label={option.label}
                                    style={{padding: 'var(--spacing-3)'}}
                                    isSelected={option.id == null ? picked.length === 0 : picked.includes(option.id)}
                                    onChange={() => toggleZone(option.id)}>
                                    <VStack gap={0}>
                                      <Text type="label" weight="semibold">
                                        {option.label}
                                      </Text>
                                      <Text type="supporting" color="secondary" style={{whiteSpace: 'nowrap'}}>
                                        {option.count === 1 ? '1 place' : `${option.count} places`}
                                      </Text>
                                    </VStack>
                                  </SelectableCard>
                                ))}
                              </HStack>
                              {stage === 'area' && (
                                <HStack hAlign="start">
                                  <Button label="Next" variant="primary" size="sm" onClick={finishArea} />
                                </HStack>
                              )}
                            </VStack>
                          </ChatMessageBubble>
                        </ChatMessage>
                      );
                    })()}

                    <ComposerThreadMessages
                      items={wizardComposerThread}
                      keyPrefix="wizard"
                      renderUi={(item, key) =>
                        uiBlockIsVisible(item.ui) ? (
                          <ChatMessage key={key} sender="assistant" avatar={avatarForUi(item.ui)}>
                            <ChatMessageBubble variant="ghost" className="wizard-block--wide" style={wizardBubblePadding}>
                              <AgentUiBlock
                                ui={item.ui}
                                venueOptions={item.venueOptions}
                                bookingDraft={bookingDraft}
                                onSend={(text, draft, sendOptions) =>
                                  agentFallback && text === OFFLINE_SHOW_MORE
                                    ? showMoreOfflinePicks()
                                    : send(text, draft, sendOptions)
                                }
                                onSelectVenue={(title) =>
                                  setBookingDraft((prev) => withDraftField(prev, 'venue', title))
                                }
                                showMoreEnabled
                                userMemory={userMemory}
                                communityMembers={NO_MEMBERS}
                              />
                            </ChatMessageBubble>
                          </ChatMessage>
                        ) : null
                      }
                    />

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
                            <Text>Which day?</Text>
                            <Card padding={3}>
                              <Calendar
                                mode="single"
                                min={TODAY_ISO}
                                onChange={(value: string | undefined) => {
                                  if (value == null) return;
                                  setBookingDraft((prev) => {
                                    const {time, meal, ...rest} = prev;
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

                    {visibleStages.includes('time') && bookingDraft.date != null && (() => {
                      // Today: only meals not over yet.
                      const meals = mealsLeft(bookingDraft.date);
                      return (
                      <ChatMessage sender="assistant" avatar={QUIET_TABLE_AVATAR}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <VStack gap={3}>
                            <Text>Lunch or dinner on {formatDateForMessage(bookingDraft.date)}?</Text>
                            {meals.length === 0 && (
                              <Text color="secondary">It’s too late to eat out today. Pick another day.</Text>
                            )}
                            <VStack gap={2}>
                              {meals.map((meal) => (
                                <ClickableCard
                                  key={meal.id}
                                  label={meal.label}
                                  padding={4}
                                  onClick={() => {
                                    // The meal, and a time inside it for the AI's context; never sent to booking.
                                    const nextDraft: BookingDraft = {...bookingDraft, meal: meal.id, time: MEAL_TIME[meal.id]};
                                    setBookingDraft(nextDraft);
                                    requestAnimationFrame(() => {
                                      send(formatDraftSummary(nextDraft), nextDraft, {displayAsSummary: true});
                                    });
                                  }}>
                                  <VStack gap={0}>
                                    <Text type="label" weight="semibold">
                                      {meal.label}
                                    </Text>
                                    <Text type="supporting" color="secondary">
                                      {meal.subtitle}
                                    </Text>
                                  </VStack>
                                </ClickableCard>
                              ))}
                            </VStack>
                          </VStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                      );
                    })()}

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
                            avatar={avatarForUi(item.ui)}>
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
                                communityMembers={NO_MEMBERS}
                              />
                            </ChatMessageBubble>
                          </ChatMessage>
                        );
                      }

                      return null;
                    })}

                    {/* Nudges under the latest results, in the conversation rather than
                        floating over it by the prompt. */}
                    {nudges.length > 0 && (
                      <ChatMessage sender="assistant" avatar={OPTIONS_SPACER}>
                        <ChatMessageBubble variant="ghost" style={wizardBubblePadding}>
                          <HStack gap={2} wrap="wrap">
                            {nudges.map((nudge) => (
                              <Button
                                key={nudge}
                                label={nudge}
                                size="sm"
                                variant="secondary"
                                onClick={() => void send(nudge)}
                              />
                            ))}
                          </HStack>
                        </ChatMessageBubble>
                      </ChatMessage>
                    )}

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
                </RestaurantPanelProvider>
              </VStack>
            </HStack>
          </LayoutContent>
        }
      />
    </VStack>
  );
}
