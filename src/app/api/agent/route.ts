import Anthropic from '@anthropic-ai/sdk';
import {NextResponse} from 'next/server';
import {checkVenueAvailability, createBooking, getContactPreferences, searchTables} from '@/lib/booking-data';
import {
  buildVenueOptionsTitle,
  assignOfferedAvailabilityForResults,
  filterVenuesByAimedTime,
  findVenueOption,
  formatOfferedAvailabilityLine,
  getVenueOptionsForIntent,
  nearestAvailableTimesAcrossVenues,
  paginateVenueOptions,
  rankVenueOptions,
  type DietaryNeeds,
} from '@/lib/venue-options';
import {applyMichelinModeToUi} from '@/lib/michelin-mode';
import {
  buildVenueListPersonalizationNote,
  dietaryQuestionForMemory,
  excludedVenueTitles,
  filterExcludedVenues,
  getUserMemory,
  memoryRankScore,
  summarizeUserMemoryForAgent,
} from '@/lib/user-memory';
import {
  friendRankScore,
  getFriendFoodProfile,
  getMentionedFriend,
  summarizeFriendForAgent,
  summarizeFriendGraphForAgent,
} from '@/lib/friend-graph-mock';

const client = new Anthropic();
// UI/UX build sessions: mock catalog only — no Anthropic credits.
// Set false for live agent demos when Anthropic billing is topped up.
const USE_LOCAL_FALLBACK = true;

/** Shown when the composer gets free text the mock catalog cannot handle. */
const FALLBACK_ASLEEP_MESSAGE =
  'The agent is currently asleep, you can browse the UX in fallback mode.';

function agentErrorResponse(error: unknown) {
  console.error('[agent] Anthropic request failed:', error);
  let detail = 'Agent unavailable';
  if (error instanceof Error) {
    const match = error.message.match(/"message":"([^"]+)"/);
    detail = match?.[1] ?? error.message;
  }
  return NextResponse.json({text: '', ui: null, error: detail}, {status: 503});
}

// Merged: Quiet Table concierge + Friend Foodie Recommender (social graph, vibe, honest cold start).
const SYSTEM_PROMPT = `You are the agent behind Quiet Table — a close-friend restaurant concierge that finds and books a table. Users have (or will build) a social graph of friends who visit restaurants; your job is to help them discover great places based on where friends have actually been and what fits their taste — not generic algorithmic dumps. The prototype defaults to Amsterdam as demo city; support any city the user names.

Identity & tone:
- Be concise, warm, and practical — like a well-connected friend giving a recommendation, not a search engine listing.
- The core job is still finding and booking a table: vibe/occasion, party size, date/time. Ask only for what the booking draft doesn't already have.
- Ask clarifying questions when a request is ambiguous (city, occasion, budget) — but respect that the web wizard may already have captured party size, date, time, and dietary needs via cards and pickers; don't re-ask what's in the draft.

Social graph & trust (Friend Foodie layer):
- When recommending, prioritize restaurants friends have visited and rated highly. Note which friend(s) went and what they said when that data exists in get_user_dining_history or context — surface it on cards via subtitle or meta (e.g. "Maya booked last month").
- If you have no logged friend-visit data for this user/city, say so plainly in spoken text — do not invent friend reviews or fake social proof. Offer general (non-friend-sourced) suggestions ranked by vibe, taste memory, and availability instead.
- Passive signals beat reviews: a friend's booking or save is enough; don't ask users to write reviews in chat.
- Use get_friend_food_profile when the user names a friend or asks for picks in a friend's taste. Demo close friends: Savas Ozay (ramen, KBBQ, Asian fusion), Maya Chen (quiet date nights, wine), Emma van Dijk (groups, Italian).
- Use get_contact_preferences when a named guest is mentioned for dietary needs. Help build the graph over time by acknowledging saves, likes, and bookings the user makes in-session.
- As the social graph grows, warm friend signals should progressively outweigh generic picks; when the graph is empty, lean on taste memory and honest fit copy.

Vibe, price & Michelin:
- Understand and filter by vibe (casual, date night, celebratory, quick bite, group-friendly, quiet, business, etc.) — infer from review text, restaurant type, and draft context when not explicit.
- Respect price/spend signals from the draft (e.g. date-night spend tier). Let users narrow by budget in spoken text if unclear.
- MICHELIN MODE: When the booking draft intent is Michelin star, search guide.michelin.com for the location (e.g. "site:guide.michelin.com Michelin star restaurants Amsterdam"). Only propose restaurants you found on guide.michelin.com in this turn's web_search. Every venue in render_ui.options MUST include michelin_guide_url (full https://guide.michelin.com/... link from search) and michelin_distinction when known (e.g. "1 Star", "2 Stars", "3 Stars", "Bib Gourmand", "Selected"). Never claim Michelin status without a Guide URL. Do not attach google_rating or tripadvisor_rating — the UI shows Guide verification instead.

Discovery & menus:
- Use web_search first for real, current restaurants matching vibe and location. Ground every venue in an actual named result (real name, real neighborhood) — never invent venues.
- Call check_venue_availability with the exact real venue name you found. Only fall back to search_tables if web_search returns nothing usable.
- Use web_search to scan public signals (restaurant sites, reviews, social posts) for menu highlights. Put summaries in description and/or menu_overview on the card — present as general overviews grounded in search, not verbatim or guaranteed-current menus. View menu CTA only when menu_url is known.

UI & booking (Quiet Table layer — non-negotiable):
- The UI is the primary path. Prefer structured render_ui controls (venue cards, detail, confirm, success) over prose-only next steps. Spoken text explains why the UI choices are shown; it doesn't replace them.
- Treat the booking draft JSON from the client as source of truth. If the user's latest text changes part of it, acknowledge and return the next useful UI control.
- Optional context (noise preference, tie-in plans, dietary for a named guest) — pick up naturally if mentioned; never assume or center the flow on it.
- Call get_user_dining_history when you need taste memory. Never re-suggest venues the user recently disliked; boost places they liked or saved.
- Never call create_booking without explicit prior confirmation in this conversation.
- Ground every claim in actual tool results this turn. Never narrate checks or obstacles that didn't happen.
- At the end of every turn, call render_ui exactly once. interactive.type "options" works for venues, neighborhoods, or any short list. Include tool_status when you called other tools.
- After search + availability, render venue choices as interactive.type "options". After venue selection → "detail" or "confirm". Use interactive.type "success" the moment create_booking has run.
- Put AI menu summaries on the card (description / menu_overview), not behind View menu. View menu only for real menu_url.
- Keep occasion options consistent with draft context — e.g. never offer "date night" when party size ≥ 3.
- You have Astryx design system access via MCP — consult it when choosing render_ui patterns.
- First venue-results spoken text (interactive.type "options" after draft complete) MUST be context-aware: weave intent, occasion, spend, location, aimed time, dietaryNeeds, memory, and honest cold-start framing if no friend data. One short paragraph only — not repeated on "show more".`;

const domainTools: Anthropic.Tool[] = [
  {
    name: 'get_user_dining_history',
    description:
      "Look up the current user's dining history, saved venues, standing preferences (noise, dietary lean), and any friend-visit signals available in memory. Use before ranking — never invent friend data not returned here.",
    input_schema: {type: 'object', properties: {}},
  },
  {
    name: 'get_friend_food_profile',
    description:
      'Look up a close friend\'s food taste, cuisine affinities, and Amsterdam venue picks (visits + notes). Use when the user asks for recs in a friend\'s taste or names a friend like Savas.',
    input_schema: {
      type: 'object',
      properties: {name: {type: 'string', description: 'Friend first name or id, e.g. Savas, Maya, Emma'}},
      required: ['name'],
    },
  },
  {
    name: 'get_contact_preferences',
    description: "Look up a named contact's saved preferences, e.g. dietary restrictions.",
    input_schema: {
      type: 'object',
      properties: {name: {type: 'string', description: 'First name of the contact'}},
      required: ['name'],
    },
  },
  {
    name: 'search_tables',
    description: 'Fallback mock catalog — only use if web_search returns nothing usable for the location. Search for tables matching a vibe/occasion, filtered by location, party size, time window, and dietary restrictions.',
    input_schema: {
      type: 'object',
      properties: {
        vibe: {type: 'string', description: 'e.g. "date night", "group", "michelin star", "casual", "celebration", "quiet"'},
        near: {type: 'string', description: 'Address or neighborhood to search near'},
        party_size: {type: 'integer'},
        time_window: {type: 'string', description: 'e.g. "8-8:30pm"'},
        dietary_restrictions: {type: 'array', items: {type: 'string'}},
      },
    },
  },
  {
    name: 'check_venue_availability',
    description: 'Confirm a specific venue has a table at a given time.',
    input_schema: {
      type: 'object',
      properties: {
        venue_id: {type: 'string'},
        time: {type: 'string'},
      },
      required: ['venue_id', 'time'],
    },
  },
  {
    name: 'create_booking',
    description: 'Book a table. Only call after the user has explicitly confirmed the venue and time.',
    input_schema: {
      type: 'object',
      properties: {
        venue_id: {type: 'string'},
        time: {type: 'string'},
        party_size: {type: 'integer'},
      },
      required: ['venue_id', 'time', 'party_size'],
    },
  },
];

// Server-side tool — Anthropic runs the search and returns results inline in
// the same turn, no client round-trip. GA, no beta header needed.
const webSearchTool = {type: 'web_search_20260209', name: 'web_search', max_uses: 3};

const renderUiTool: Anthropic.Tool = {
  name: 'render_ui',
  description: 'Describe the single interactive UI moment the user should see at the end of this turn, plus any tool-call status to show for transparency. Call this exactly once, last, every turn.',
  input_schema: {
    type: 'object',
    properties: {
      tool_status: {
        type: 'array',
        description: 'Tool calls made this turn, for a transparency panel.',
        items: {
          type: 'object',
          properties: {
            name: {type: 'string'},
            target: {type: 'string'},
            status: {type: 'string', enum: ['complete', 'running']},
          },
          required: ['name', 'target', 'status'],
        },
      },
      interactive: {
        type: 'object',
        description: 'The one interactive control to render. Set type to "none" for a plain free-form question.',
        properties: {
          type: {
            type: 'string',
            enum: ['none', 'confirm', 'options', 'detail', 'success'],
          },
          question: {type: 'string', description: 'For type=confirm'},
          confirm_label: {type: 'string', description: 'For type=confirm'},
          title: {type: 'string', description: 'For type=options/detail/success'},
          options: {
            type: 'array',
            description: 'For type=options — venues, neighborhoods, times, or any other short list to pick from',
            items: {
              type: 'object',
              properties: {
                id: {type: 'string'},
                title: {type: 'string'},
                subtitle: {type: 'string'},
                meta: {type: 'string'},
                description: {type: 'string'},
                image_url: {type: 'string'},
                cta_label: {type: 'string'},
                menu_url: {
                  type: 'string',
                  description: 'Exact menu page URL from web_search when available',
                },
                menu_overview: {
                  type: 'string',
                  description:
                    'Short AI menu summary when menu_url is unknown — grounded in search results, no invented dishes',
                },
                michelin_guide_url: {
                  type: 'string',
                  description: 'Required for Michelin intent — https://guide.michelin.com/... from web_search',
                },
                michelin_distinction: {
                  type: 'string',
                  description: 'e.g. 1 Star, 2 Stars, Bib Gourmand, Selected',
                },
              },
              required: ['id', 'title'],
            },
          },
          detail: {
            type: 'object',
            description: 'For type=detail',
            properties: {
              id: {type: 'string'},
              subtitle: {type: 'string'},
              description: {type: 'string'},
              cta_label: {type: 'string'},
                meta: {type: 'string'},
                image_url: {type: 'string'},
                menu_url: {type: 'string'},
                menu_overview: {type: 'string'},
            },
          },
          description: {type: 'string', description: 'For type=success'},
        },
        required: ['type'],
      },
    },
    required: ['interactive'],
  },
};

type ChatTurn = {role: 'user' | 'assistant'; text: string};

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
  occasion?: string;
  spend?: string;
  occasionNotes?: string;
};

function isDraftReadyForVenues(draft?: BookingDraft): boolean {
  return draft?.intent != null && draft.partySize != null && draft.location != null && draft.time != null;
}

function executeDomainTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'get_user_dining_history':
      return summarizeUserMemoryForAgent(getUserMemory());
    case 'get_friend_food_profile': {
      const friend = getFriendFoodProfile(String(input.name ?? ''));
      return friend != null
        ? summarizeFriendForAgent(friend)
        : {error: 'No friend profile on file — do not invent visits or reviews.'};
    }
    case 'get_contact_preferences':
      return getContactPreferences(String(input.name ?? ''));
    case 'search_tables':
      return searchTables(input);
    case 'check_venue_availability':
      return checkVenueAvailability(input as {venue_id: string; time: string});
    case 'create_booking':
      return createBooking(input as {venue_id: string; time: string; party_size: number});
    default:
      return {error: `unknown tool: ${name}`};
  }
}

export async function POST(request: Request) {
  const {history, message, location, draft} = (await request.json()) as {
    history: ChatTurn[];
    message: string;
    location?: string | null;
    draft?: BookingDraft;
  };

  if (USE_LOCAL_FALLBACK) {
    return NextResponse.json({...buildFallbackResponse(message, draft), fallback: true});
  }

  const contextLines = [
    location != null && location.trim().length > 0
      ? `Known browser location: "${location}". Treat this as the default search area unless the user names a different place.`
      : null,
    draft != null ? `Current booking draft JSON: ${JSON.stringify(draft)}.` : null,
    `User dining memory JSON: ${JSON.stringify(summarizeUserMemoryForAgent(getUserMemory()))}.`,
    `Close friends food graph JSON: ${JSON.stringify(summarizeFriendGraphForAgent())}.`,
  ].filter(Boolean);

  const system = contextLines.length > 0 ? `${SYSTEM_PROMPT}\n\n${contextLines.join('\n')}` : SYSTEM_PROMPT;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((turn) => ({role: turn.role, content: turn.text})),
    {role: 'user', content: message},
  ];

  let textOut = '';
  let uiOut: Record<string, unknown> | null = null;
  // Ground truth for the tool-status panel — built from what actually ran,
  // never from the model's self-reported render_ui.tool_status. Models will
  // happily narrate tool calls (and results) that never happened otherwise.
  const executedCalls: {name: string; target: string; status: 'complete'}[] = [];
  let tableBookingResult: ReturnType<typeof createBooking> | null = null;
  // web_search's dynamic filtering runs code execution under the hood, which
  // leaves pending tool uses tied to a container — later iterations within
  // this same turn must reference that container or the API rejects them.
  let containerId: string | undefined;

  // Manual agentic loop: run entirely within this request. Tool calls and
  // their results stay server-side and are not replayed to the client —
  // the client only keeps plain {role, text} turns, not full Claude blocks.
  for (let iteration = 0; iteration < 8; iteration++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        betas: ['mcp-client-2025-11-20'],
        system,
        container: containerId,
        mcp_servers: [{type: 'url', url: 'https://astryx.atmeta.com/mcp', name: 'xds'}],
        tools: [
          ...(domainTools as Anthropic.Beta.BetaToolUnion[]),
          renderUiTool as Anthropic.Beta.BetaToolUnion,
          webSearchTool as Anthropic.Beta.BetaToolUnion,
          {type: 'mcp_toolset', mcp_server_name: 'xds'},
        ],
        messages,
      });
    } catch (error) {
      if (USE_LOCAL_FALLBACK) {
        return NextResponse.json({...buildFallbackResponse(message, draft), fallback: true});
      }
      return agentErrorResponse(error);
    }

    containerId = response.container?.id ?? containerId;
    messages.push({role: 'assistant', content: response.content});

    for (const block of response.content) {
      if (block.type === 'text') {
        textOut += (textOut ? '\n' : '') + block.text;
      }
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );

    // Server-side tool — Anthropic executes web_search inline, so there's no
    // tool_use/tool_result round-trip for it. Log it here for the same
    // transparency panel the client-executed tools populate below.
    for (const block of response.content) {
      if (block.type === 'server_tool_use' && block.name === 'web_search') {
        const input = block.input as Record<string, unknown>;
        executedCalls.push({name: 'web_search', target: String(input.query ?? ''), status: 'complete'});
      }
    }

    const renderCall = toolUseBlocks.find((b) => b.name === 'render_ui');
    if (renderCall) {
      uiOut = renderCall.input as Record<string, unknown>;
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = toolUseBlocks.map((block) => {
      if (block.name === 'render_ui') {
        return {type: 'tool_result', tool_use_id: block.id, content: 'displayed to user'};
      }
      const input = block.input as Record<string, unknown>;
      const result = executeDomainTool(block.name, input);
      if (block.name === 'create_booking') tableBookingResult = result as ReturnType<typeof createBooking>;
      executedCalls.push({name: block.name, target: describeCallTarget(block.name, input), status: 'complete'});
      return {type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result)};
    });

    messages.push({role: 'user', content: toolResults});

    if (renderCall) break; // render_ui is always the last call of a turn
  }

  // Overwrite whatever the model self-reported with the real execution log.
  const uniqueExecutedCalls = dedupeExecutedCalls(executedCalls);
  if (uiOut != null) {
    uiOut.tool_status = uniqueExecutedCalls.length > 0 ? uniqueExecutedCalls : undefined;
  }

  // The success banner is the one moment worth guaranteeing outright rather
  // than hoping the model remembers to call it — the table booking is the
  // core goal met.
  if (tableBookingResult != null) {
    const booking = tableBookingResult as ReturnType<typeof createBooking>;
    uiOut = uiOut ?? {};
    uiOut.tool_status = uniqueExecutedCalls;
    uiOut.interactive = {
      type: 'success',
      title: 'Table booked.',
      description: `${booking.venue_name} · ${booking.time} · party of ${booking.party_size}.`,
    };
  }

  const michelinApplied = applyMichelinModeToUi(textOut, uiOut, draft?.intent);
  return NextResponse.json({text: michelinApplied.text, ui: michelinApplied.ui});
}

function dedupeExecutedCalls(calls: {name: string; target: string; status: 'complete'}[]) {
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.name}\u001f${call.status}\u001f${call.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFallbackResponse(message: string, draft?: BookingDraft) {
  const userMemory = getUserMemory();
  const venue = draft?.venue;
  const time = draft?.time ?? 'the selected time';
  const partySize = Number.parseInt(draft?.partySize ?? '2', 10);
  const wantsBooking = /\b(book|confirm|reserve|yes)\b/i.test(message);

  if (venue != null && wantsBooking) {
    const booking = createBooking({venue_id: venue, time, party_size: Number.isFinite(partySize) ? partySize : 2});
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
            subtitle: `${draft?.location ?? 'Amsterdam'} · ${time}`,
            description:
              known?.description ??
              `A good match for ${draft?.intent ?? 'this dinner'}${draft?.partySize != null ? `, party of ${draft.partySize}` : ''}.`,
            image_url: known?.image_url,
            cta_label: `Book ${venue}`,
            menu_url: known?.menu_url,
            google_reviews_url: known?.google_reviews_url,
            tripadvisor_url: known?.tripadvisor_url,
          },
        },
      },
    };
  }

  if (isDraftReadyForVenues(draft) && draft!.dietaryNeeds == null) {
    return {
      text: '',
      ui: {
        interactive: {
          type: 'dietary',
          question: dietaryQuestionForMemory(userMemory),
        },
      },
    };
  }

  if (isDraftReadyForVenues(draft) && draft!.dietaryNeeds != null) {
    const dateIso = draft!.date;
    const time = draft!.time!;
    const showMore = /\bshow more\b/i.test(message);
    const page = showMore ? (draft!.venueResultsPage ?? 1) : 0;
    const catalog = getVenueOptionsForIntent(draft!.intent!);
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
      draft!.dietaryNeeds,
      (venueId) =>
        memoryRankScore(venueId, userMemory) +
        friendRankScore(venueId, message, draft!.intent),
    );
    const {options: pageOptions, hasMore, total} = paginateVenueOptions(ranked, page);
    const offeredById =
      dateIso != null ? assignOfferedAvailabilityForResults(ranked, dateIso, time) : new Map();
    const options = pageOptions.map((option) => {
      const offered = offeredById.get(option.id);
      return offered != null
        ? {...option, meta: formatOfferedAvailabilityLine(offered)}
        : option;
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
      page === 0 && draft!.personalizationNoteShown !== true
        ? buildVenueListPersonalizationNote(userMemory, excluded)
        : null;
    const mentionedFriend = getMentionedFriend(message);
    const factsLine =
      mentionedFriend != null
        ? `I found ${total} ${fallbackIntentLabel(draft!.intent!)} options around ${draft!.location} — factoring in ${mentionedFriend.name}'s taste where it fits. Pick one to book.`
        : `I found ${total} ${fallbackIntentLabel(draft!.intent!)} options around ${draft!.location}. Pick one to book.`;

    const response = {
      text: page === 0 ? [exclusionNote, factsLine].filter(Boolean).join(' ') : '',
      ui: {
        interactive: {
          type: 'options',
          title,
          options,
          pagination: {page, has_more: hasMore, total},
        },
      },
    };
    const michelinApplied = applyMichelinModeToUi(response.text, response.ui, draft!.intent);
    return {text: michelinApplied.text, ui: michelinApplied.ui};
  }

  return {
    text: FALLBACK_ASLEEP_MESSAGE,
    ui: {interactive: {type: 'none'}},
  };
}

function fallbackIntentLabel(intent: string) {
  const lower = intent.toLowerCase();
  if (lower.includes('date')) return 'date-night';
  if (lower.includes('michelin')) return 'Michelin-style';
  if (lower.includes('business')) return 'business dinner';
  if (lower.includes('group')) return 'group-friendly';
  return 'casual';
}

function describeCallTarget(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'get_user_dining_history':
      return getUserMemory().firstName;
    case 'get_friend_food_profile':
      return String(input.name ?? '');
    case 'get_contact_preferences':
      return String(input.name ?? '');
    case 'search_tables':
      return [input.vibe, input.near].filter(Boolean).join(' · ') || 'all vibes';
    case 'check_venue_availability':
      return `${input.venue_id ?? ''} · ${input.time ?? ''}`;
    case 'create_booking':
      return `${input.venue_id ?? ''} · ${input.time ?? ''} · party of ${input.party_size ?? '?'}`;
    default:
      return JSON.stringify(input);
  }
}
