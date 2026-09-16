import Anthropic from '@anthropic-ai/sdk';
import {NextResponse} from 'next/server';
import {checkVenueAvailability, createBooking, getContactPreferences, searchTables} from '@/lib/booking-data';
import type {DietaryNeeds} from '@/lib/venue-options';
import {applyMichelinModeToUi} from '@/lib/michelin-mode';
import {
  filterExcludedVenues,
  getUserMemory,
  summarizeUserMemoryForAgent,
} from '@/lib/user-memory';
import {
  getFriendFoodProfile,
  summarizeFriendForAgent,
  summarizeFriendGraphForAgent,
} from '@/lib/friend-graph-mock';
import {tasteProfileToFriendFoodProfile} from '@/lib/member-friends';
import {listMemberProfilesForSession} from '@/lib/member-registry-server';
import {summarizeCommunityTasteForAgent} from '@/lib/member-taste-discovery';
import type {TasteProfile} from '@/lib/taste-profile';
import {buildFallbackResponse} from '@/lib/fallback-response';
import {catalogAgentContextLine} from '@/lib/venue-options';

/**
 * USE_LOCAL_FALLBACK=true  → buildFallbackResponse only. No Anthropic, web_search, or MCP — zero agent credits.
 * USE_LOCAL_FALLBACK=false → Live agent: Claude + web_search + search_quiet_table_catalog (local catalog tools).
 * Override via env (e.g. USE_LOCAL_FALLBACK=true in .env.local for UI work).
 */
const USE_LOCAL_FALLBACK =
  process.env.USE_LOCAL_FALLBACK === 'true' || process.env.USE_LOCAL_FALLBACK === '1';

const client = new Anthropic();

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
- Spoken text is short. Default max ~40 words per turn; venue-results intro max ~55 words. Never recap the full booking draft (party, city, date, time) — the user already set that in the wizard.
- Do not narrate tools or process ("cross-referencing the catalog", "let me pull up", "great news — all six are available"). Put detail on cards; speech is the headline only.
- Use Markdown bullets sparingly (2–3 bullets max) when comparing friend signals or dietary notes; otherwise one or two plain sentences.
- The core job is still finding and booking a table: vibe/occasion, party size, date/time. Ask only for what the booking draft doesn't already have.
- Ask clarifying questions when a request is ambiguous (city, occasion, budget) — but respect that the web wizard may already have captured party size, date, time, and dietary needs via cards and pickers; don't re-ask what's in the draft.

Social graph & trust (Friend Foodie layer):
- When recommending, prioritize restaurants friends have visited and rated highly. Note which friend(s) went and what they said when that data exists in get_user_dining_history or context — surface it on cards via subtitle or meta (e.g. "Maya booked last month").
- If you have no logged friend-visit data for this user/city, say so plainly in spoken text — do not invent friend reviews or fake social proof. Offer general (non-friend-sourced) suggestions ranked by vibe, taste memory, and availability instead.
- Passive signals beat reviews: a friend's booking or save is enough; don't ask users to write reviews in chat.
- Use get_friend_food_profile when the user names a friend or asks for picks in a friend's taste. Synthetic demo friends until real users join: Savas Ozay (ramen, Korean BBQ, Asian fusion), Maya Chen (quiet date nights, wine), Emma van Dijk (group Italian, shareable tables; pescatarian — vegetarian plus fish/seafood, no meat).
- Use get_contact_preferences when a named guest is mentioned for dietary needs. Help build the graph over time by acknowledging saves, likes, and bookings the user makes in-session.
- As the social graph grows, warm friend signals should progressively outweigh generic picks; when the graph is empty, lean on taste memory and honest fit copy.

Vibe, price & Michelin:
- Understand and filter by vibe (casual, date night, celebratory, quick bite, group-friendly, quiet, business, etc.) — infer from review text, restaurant type, and draft context when not explicit.
- Respect price/spend signals from the draft (e.g. date-night spend tier). Let users narrow by budget in spoken text if unclear.
- MICHELIN MODE: When the booking draft intent is Michelin star, search guide.michelin.com for the location (e.g. "site:guide.michelin.com Michelin star restaurants Amsterdam"). Only propose restaurants you found on guide.michelin.com in this turn's web_search. Every venue in render_ui.options MUST include michelin_guide_url (full https://guide.michelin.com/... link from search) and michelin_distinction when known (e.g. "1 Star", "2 Stars", "3 Stars", "Bib Gourmand", "Selected"). Never claim Michelin status without a Guide URL. Do not attach google_rating or tripadvisor_rating — the UI shows Guide verification instead.

Discovery & menus (catalog + web — both):
- Quiet Table ships a curated Amsterdam catalog (search_quiet_table_catalog). Treat it as solid product data: editorial lists, friend visits, dietary tags, stable ids. It is not a last-resort fallback.
- For Amsterdam (or when the draft location is Amsterdam): call search_quiet_table_catalog for every venue-results turn — filter by vibe and near from the draft. Include catalog picks in render_ui.options (use exact id + title). Mix with web_search: e.g. mostly catalog for friend/editorial fit, plus web for menu URLs, hours, or 0–2 fresh names not in catalog. Do not run web_search-only when the catalog matches the brief.
- web_search: verify and enrich — menus, Michelin guide URLs, openings, venues outside Amsterdam. Ground web-only venues in actual search results (real name, real neighborhood).
- Call check_venue_availability with venue_id (catalog id or normalized web venue name). search_tables is an alias of search_quiet_table_catalog.
- Put menu summaries in description / menu_overview. View menu only when menu_url is known (catalog or web).

UI & booking (Quiet Table layer — non-negotiable):
- The UI is the primary path. Prefer structured render_ui controls (venue cards, detail, confirm, success) over prose-only next steps. Spoken text explains why the UI choices are shown; it doesn't replace them.
- Treat the booking draft JSON from the client as source of truth. If the user's latest text changes part of it, acknowledge and return the next useful UI control.
- When draft.goingWithFriendIds is set: boost venues from those friends' catalog picks (search_quiet_table_catalog / get_friend_food_profile), surface their social lines on cards, and honor draft.dietaryNeeds + draft.partyDietarySummary from companion restrictions (e.g. pescatarian — fish OK, no meat).
- Optional context (noise preference, tie-in plans, dietary for a named guest) — pick up naturally if mentioned; never assume or center the flow on it.
- Call get_user_dining_history when you need taste memory. Never re-suggest venues the user recently disliked; boost places they liked or saved.
- Never call create_booking without explicit prior confirmation in this conversation.
- Ground every claim in actual tool results this turn. Never narrate checks or obstacles that didn't happen.
- At the end of every turn, call render_ui exactly once. interactive.type "options" works for venues, neighborhoods, or any short list. Include tool_status when you called other tools.
- After search + availability, render venue choices as interactive.type "options". After venue selection → "detail" or "confirm". Use interactive.type "success" the moment create_booking has run.
- Put AI menu summaries on the card (description / menu_overview), not behind View menu. View menu only for real menu_url.
- Keep occasion options consistent with draft context — e.g. never offer "date night" when party size ≥ 3.
- You have Astryx design system access via MCP — consult it when choosing render_ui patterns.
- First venue-results spoken text (interactive.type "options" after draft complete): one tight hook only — e.g. vibe + strongest friend or dietary note + "pick a table below". No venue essays, no repeating card copy, empty string OK on "show more". Example shape: "Saturday date night — leaning on Maya's favourites and your taste profile. Three strong fits at 8:30."`;

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
      'Look up a close friend\'s food taste, cuisine affinities, and Amsterdam venue picks (visits + notes). Use when the user asks for recs in a friend\'s taste or names Savas, Maya, or Emma.',
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
    name: 'search_quiet_table_catalog',
    description:
      'Curated Amsterdam venue catalog (same data as fallback mode): editorial picks, new openings, friend social proof, dietary tags. Call alongside web_search for Amsterdam results — filter by vibe, neighborhood, or text query. Returns stable ids for render_ui.options.',
    input_schema: {
      type: 'object',
      properties: {
        vibe: {type: 'string', description: 'e.g. "date night", "group", "michelin star", "casual"'},
        near: {type: 'string', description: 'Neighborhood or area, e.g. "De Pijp", "Oud-Zuid", "NDSM"'},
        query: {type: 'string', description: 'Optional name or keyword search within the catalog'},
        limit: {type: 'integer', description: 'Max venues to return (default 12)'},
      },
    },
  },
  {
    name: 'search_tables',
    description: 'Alias for search_quiet_table_catalog — prefer search_quiet_table_catalog.',
    input_schema: {
      type: 'object',
      properties: {
        vibe: {type: 'string'},
        near: {type: 'string'},
        query: {type: 'string'},
        limit: {type: 'integer'},
        party_size: {type: 'integer'},
        time_window: {type: 'string'},
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
  goingWithFriendIds?: string[];
  goingWithSkipped?: boolean;
  partyDietarySummary?: string;
};

function isDraftReadyForVenues(draft?: BookingDraft): boolean {
  return draft?.intent != null && draft.partySize != null && draft.location != null && draft.time != null;
}

function executeDomainTool(
  name: string,
  input: Record<string, unknown>,
  tasteProfile?: TasteProfile | null,
): unknown {
  switch (name) {
    case 'get_user_dining_history':
      return summarizeUserMemoryForAgent(getUserMemory(tasteProfile));
    case 'get_friend_food_profile': {
      const friend = getFriendFoodProfile(String(input.name ?? ''));
      return friend != null
        ? summarizeFriendForAgent(friend)
        : {error: 'No friend profile on file — do not invent visits or reviews.'};
    }
    case 'get_contact_preferences':
      return getContactPreferences(String(input.name ?? ''));
    case 'search_quiet_table_catalog':
    case 'search_tables': {
      const catalog = searchTables(input);
      const memory = getUserMemory(tasteProfile);
      const allowedIds = new Set(
        filterExcludedVenues(
          catalog.map((row) => ({id: row.id})),
          memory,
        ).map((row) => row.id),
      );
      return catalog.filter((row) => allowedIds.has(row.id));
    }
    case 'check_venue_availability':
      return checkVenueAvailability(input as {venue_id: string; time: string});
    case 'create_booking':
      return createBooking(input as {venue_id: string; time: string; party_size: number});
    default:
      return {error: `unknown tool: ${name}`};
  }
}

async function loadCommunityMembers(sessionUserId: string | undefined): Promise<
  ReturnType<typeof tasteProfileToFriendFoodProfile>[]
> {
  const id = sessionUserId?.trim();
  if (id == null || id.length === 0) return [];
  const listed = await listMemberProfilesForSession(id);
  if (!listed.ok) return [];
  return listed.profiles.map(tasteProfileToFriendFoodProfile);
}

export async function POST(request: Request) {
  const {history, message, location, draft, tasteProfile} = (await request.json()) as {
    history: ChatTurn[];
    message: string;
    location?: string | null;
    draft?: BookingDraft;
    tasteProfile?: TasteProfile | null;
  };

  const communityMembers = await loadCommunityMembers(tasteProfile?.userId);

  if (USE_LOCAL_FALLBACK) {
    return NextResponse.json({
      ...buildFallbackResponse(message, draft, tasteProfile, communityMembers),
      fallback: true,
    });
  }

  const memory = getUserMemory(tasteProfile);
  const contextLines = [
    location != null && location.trim().length > 0
      ? `Known browser location: "${location}". Treat this as the default search area unless the user names a different place.`
      : null,
    draft != null ? `Current booking draft JSON: ${JSON.stringify(draft)}.` : null,
    `User dining memory JSON: ${JSON.stringify(summarizeUserMemoryForAgent(memory))}.`,
    `Close friends food graph JSON: ${JSON.stringify(summarizeFriendGraphForAgent())}.`,
    communityMembers.length > 0
      ? `Community taste (beta — treat every member as followed; boost their loved/liked venues in results): ${JSON.stringify(summarizeCommunityTasteForAgent(communityMembers))}.`
      : null,
    catalogAgentContextLine(),
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
        return NextResponse.json({
          ...buildFallbackResponse(message, draft, tasteProfile, communityMembers),
          fallback: true,
        });
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
      const result = executeDomainTool(block.name, input, tasteProfile);
      if (block.name === 'create_booking') tableBookingResult = result as ReturnType<typeof createBooking>;
      executedCalls.push({
        name: block.name,
        target: describeCallTarget(block.name, input, tasteProfile),
        status: 'complete',
      });
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

function describeCallTarget(
  name: string,
  input: Record<string, unknown>,
  tasteProfile?: TasteProfile | null,
): string {
  switch (name) {
    case 'get_user_dining_history':
      return getUserMemory(tasteProfile).firstName || 'guest';
    case 'get_friend_food_profile':
      return String(input.name ?? '');
    case 'get_contact_preferences':
      return String(input.name ?? '');
    case 'search_quiet_table_catalog':
    case 'search_tables':
      return [input.vibe, input.near, input.query].filter(Boolean).join(' · ') || 'Amsterdam catalog';
    case 'check_venue_availability':
      return `${input.venue_id ?? ''} · ${input.time ?? ''}`;
    case 'create_booking':
      return `${input.venue_id ?? ''} · ${input.time ?? ''} · party of ${input.party_size ?? '?'}`;
    default:
      return JSON.stringify(input);
  }
}
