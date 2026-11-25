import Anthropic from '@anthropic-ai/sdk';
import {NextResponse} from 'next/server';
import {searchTables} from '@/lib/booking-data';
import {allowAnswer, chargeAnswer, creditsRemaining, networkKey, usageCents} from '@/lib/ai-budget';
import type {DietaryNeeds} from '@/lib/venue-options';
import {applyMichelinModeToUi} from '@/lib/michelin-mode';
import {
  filterExcludedVenues,
  getUserMemory,
  summarizeUserMemoryForAgent,
} from '@/lib/user-memory';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';
import type {TasteProfile} from '@/lib/taste-profile';
import {buildFallbackResponse} from '@/lib/fallback-response';
import {catalogAgentContextLine, venueInCity} from '@/lib/venue-options';
import {zonesOf} from '@/lib/zones';

/**
 * Fallback → buildFallbackResponse only (response includes fallback: true). No Anthropic credits.
 * The site has no sign-in, so anyone can reach this route: the live agent
 * (Claude + web_search + catalog tools) only runs when USE_LIVE_AGENT=true or
 * USE_LOCAL_FALLBACK=false is set, on purpose. Everywhere else, fallback.
 */
function shouldUseLocalFallback(): boolean {
  const flag = process.env.USE_LOCAL_FALLBACK;
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  if (process.env.USE_LIVE_AGENT === 'true' || process.env.USE_LIVE_AGENT === '1') {
    return false;
  }
  return true;
}

const USE_LOCAL_FALLBACK = shouldUseLocalFallback();

const client = new Anthropic();

// Model for the live agent. Set AGENT_MODEL in Vercel to switch without a code
// change. Haiku is the current choice for cost testing.
const AGENT_MODEL = process.env.AGENT_MODEL?.trim() || 'claude-sonnet-4-6';

// Token measurement for cost work. Logs counts only, never message text.
// Read in Vercel → Logs by searching for "agent_usage".
function logUsage(iteration: number, response: Anthropic.Beta.BetaMessage, systemChars: number) {
  console.log(
    'agent_usage',
    JSON.stringify({
      iteration,
      model: response.model,
      stop_reason: response.stop_reason,
      system_chars: systemChars,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      web_search_requests: response.usage.server_tool_use?.web_search_requests ?? 0,
      tools_called: toolsCalled(response),
      web_search_errors: webSearchErrors(response),
    }),
  );
}

// Names of every tool the model called this round, client and server side.
function toolsCalled(response: Anthropic.Beta.BetaMessage): string[] {
  return response.content.flatMap((block) =>
    block.type === 'tool_use' || block.type === 'server_tool_use' ? [block.name] : [],
  );
}

// Web search failures come back inside the response as an error object, not
// as a thrown error, so they never reach the catch block. Log their codes.
function webSearchErrors(response: Anthropic.Beta.BetaMessage): string[] {
  return response.content.flatMap((block) => {
    if (block.type !== 'web_search_tool_result') return [];
    const content = block.content as unknown;
    if (Array.isArray(content)) return [];
    const code = (content as {error_code?: unknown}).error_code;
    return [typeof code === 'string' ? code : 'unknown_error'];
  });
}

type FallbackArgs = Parameters<typeof buildFallbackResponse>;

// Answers from the catalog with a short note, for when live search can't
// finish inside the turn budget. Keeps the chat from waiting on a dead request.
async function fallbackWithNote(note: string, credits: Credits, ...args: FallbackArgs) {
  const fallback = await buildFallbackResponse(...args);
  return NextResponse.json({
    ...fallback,
    text: [note, fallback.text].filter(Boolean).join('\n\n'),
    fallback: true,
    credits,
  });
}

/** The day's AI budget, for the line under the prompt: the share left (0 to
 * 1), and why this answer came from the catalog, if it did. */
type Credits = {remaining: number | null; limited: 'budget' | 'device' | 'secret' | 'unavailable' | null};

/** The browser's random id, as sent; anything odd counts as one shared device. */
function cleanDevice(device: unknown): string {
  return typeof device === 'string' && /^[a-z0-9-]{8,64}$/i.test(device) ? device : 'unknown-device';
}

function agentErrorResponse(error: unknown) {
  console.error('[agent] Anthropic request failed:', error);
  let detail = 'Agent unavailable';
  if (error instanceof Error) {
    const match = error.message.match(/"message":"([^"]+)"/);
    detail = match?.[1] ?? error.message;
  }
  return NextResponse.json({text: '', ui: null, error: detail}, {status: 503});
}

// The website's Find: no accounts and no friends. The visitor picks the kind
// of table, city (Amsterdam or London), parts of town, day and time in the
// wizard; this agent finds the places.
const SYSTEM_PROMPT = `You are the agent behind Quiet Table's website: you find a restaurant table in Amsterdam or London from Quiet Table's curated catalog, for someone who has told the site what they're after. There are no accounts or friends on the website, so never mention friends, friend visits, members, reviews by people they know, or a social graph, and never say what data is missing.

Tone:
- Concise, warm and practical, like someone who knows the city well. Plain words, no hype.
- Spoken text is short: max ~40 words a turn.
- Never narrate tools or process ("let me check", "cross-referencing", "great news").
- The core job is finding a table for the kind of night, party size, day and time. The booking draft JSON already has what the wizard asked; never re-ask it.

The first list of places after the wizard:
- Open with where and what, then one line on the picks, then nothing else. Shape: "<City> (<parts of town>), for <kind of table>. <One sentence on the fit and the time>." e.g. "Amsterdam (Oost), for date night. Three upscale fits work for 6:30 on Saturday." or "London, for a casual lunch. Four easy picks open at 12:30 on Friday."
- The city is draft.location; the parts of town are the labels for draft.zones (given in context); leave the brackets out when no parts were picked. The kind of table comes from draft.intent; say lunch when draft.meal is "lunch".
- Empty spoken text is fine on "show more".

Finding places:
- Call search_quiet_table_catalog once for the first list: it already searches in the city and parts of town picked. Pass vibe from the kind of table, and query only for a specific ask (a cuisine, a dish, wine, cocktails). Treat it as vetted product data.
- Use web_search only for Michelin mode, or when the visitor asks for something the catalog clearly doesn't have (a menu, a brand-new opening). At most one web_search a turn.
- Prefer places in the parts of town picked; only go wider if there are too few.
- Catalog venues may carry "hours". Skip any closed on draft.date at draft.time; no hours means unknown, so keep them.
- Dietary limits are hard filters: read draft.dietaryNeeds. Drop any place built around food the party can't eat (e.g. steakhouses for vegetarians).
- Respect price and spend signals from the draft or chat.
- Ground every claim in this turn's tool results. Never invent places, hours, prices or reviews.

MICHELIN MODE: when draft.intent is a Michelin table, run exactly ONE web_search (e.g. site:guide.michelin.com Michelin star restaurants Amsterdam). Only propose restaurants found on guide.michelin.com, each with michelin_guide_url and michelin_distinction when known. Never claim Michelin status without a Guide URL.

Cards and UI:
- At the end of every turn call render_ui exactly once. Venues go in interactive.type "options"; picking one leads to "detail".
- For catalog venues send only id and title: the app fills in the rest. Never set meta or image_url. For web_search venues send title, subtitle (area · cuisine), a one-sentence description (max 140 characters) and menu_url when the search gave one. Menu summaries go on the detail card only.
- Quiet Table doesn't book tables: the Book button opens the restaurant's own booking page. Never say a table is booked or confirmed.
- Treat the booking draft JSON as the source of truth; if the latest message changes part of it, acknowledge briefly and return the next useful UI.`;

const domainTools: Anthropic.Tool[] = [
  {
    name: 'get_user_dining_history',
    description:
      "Look up what this visitor has said about their taste this session (dietary lean, noise). Rarely needed: the draft has the essentials.",
    input_schema: {type: 'object', properties: {}},
  },
  {
    name: 'search_quiet_table_catalog',
    description:
      "Quiet Table's curated catalog for Amsterdam and London (the same places as the app): editorial picks, new openings, hours, price and dietary tags. It searches in the city and parts of town the visitor picked. Filter by vibe, or query a cuisine or keyword. Returns stable ids for render_ui.options.",
    input_schema: {
      type: 'object',
      properties: {
        vibe: {type: 'string', description: 'e.g. "date night", "group", "michelin star", "casual"'},
        near: {type: 'string', description: 'Only for a neighbourhood the visitor names in chat, e.g. "De Pijp", "Shoreditch"'},
        query: {type: 'string', description: 'Optional name or keyword search within the catalog'},
        limit: {type: 'integer', description: 'Max venues to return (default 12)'},
      },
    },
  },
];

// Server-side tool — Anthropic runs the search and returns results inline in
// the same turn, no client round-trip. GA, no beta header needed. Haiku gets
// the basic version: the dynamic-filtering one rejected its search input
// (invalid_tool_input). Two uses so one bad attempt doesn't end the search.
const webSearchTool = {
  type: AGENT_MODEL.includes('haiku') ? 'web_search_20250305' : 'web_search_20260209',
  name: 'web_search',
  max_uses: 2,
};

const renderUiTool: Anthropic.Tool = {
  name: 'render_ui',
  description: 'Describe the single interactive UI moment the user should see at the end of this turn, plus any tool-call status to show for transparency. Call this exactly once, last, every turn.',
  input_schema: {
    type: 'object',
    properties: {
      interactive: {
        type: 'object',
        description: 'The one interactive control to render. Set type to "none" for a plain free-form question.',
        properties: {
          type: {
            type: 'string',
            enum: ['none', 'confirm', 'options', 'detail'],
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
                id: {type: 'string', description: 'Catalog id for catalog venues'},
                title: {type: 'string'},
                subtitle: {type: 'string', description: 'Web venues only: area · cuisine'},
                description: {type: 'string', description: 'Web venues only: one sentence, max 140 characters'},
                cta_label: {type: 'string'},
                menu_url: {
                  type: 'string',
                  description: 'Exact menu page URL from web_search when available',
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
  /** Parts of the city picked in the wizard (zones.ts ids); none means all of it. */
  zones?: string[];
  /** Lunch or dinner. */
  meal?: 'lunch' | 'dinner';
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
  tasteProfile: TasteProfile | null | undefined,
  draft: BookingDraft | undefined,
): unknown {
  switch (name) {
    case 'get_user_dining_history':
      return summarizeUserMemoryForAgent(getUserMemory(tasteProfile));
    case 'search_quiet_table_catalog': {
      const catalog = searchTables({...input, city: draft?.location, zones: draft?.zones});
      const memory = getUserMemory(tasteProfile);
      const allowedIds = new Set(
        filterExcludedVenues(
          catalog.map((row) => ({id: row.id})),
          memory,
        ).map((row) => row.id),
      );
      return catalog.filter((row) => allowedIds.has(row.id));
    }
    default:
      return {error: `unknown tool: ${name}`};
  }
}

export async function GET() {
  if (USE_LOCAL_FALLBACK) return NextResponse.json({fallback: true});
  return NextResponse.json({fallback: false, credits: {remaining: await creditsRemaining(), limited: null}});
}

/** The parts of town picked, by name, for the opening line. */
function zoneContextLine(draft: BookingDraft | undefined): string | null {
  const labels = zonesOf(draft?.location ?? '')
    .filter((zone) => draft?.zones?.includes(zone.id))
    .map((zone) => zone.label);
  return labels.length > 0 ? `Parts of town picked (draft.zones): ${labels.join(', ')}.` : null;
}

export async function POST(request: Request) {
  const {history, message, location, draft, tasteProfile, device} = (await request.json()) as {
    history: ChatTurn[];
    message: string;
    location?: string | null;
    draft?: BookingDraft;
    tasteProfile?: TasteProfile | null;
    /** A random id the browser keeps, for the per-device daily answers. */
    device?: string;
  };

  // No accounts on the web, so no members' taste to draw on.
  const communityMembers: FriendFoodProfile[] = [];

  if (USE_LOCAL_FALLBACK) {
    return NextResponse.json({
      ...(await buildFallbackResponse(message, draft, tasteProfile, communityMembers)),
      fallback: true,
    });
  }

  // The day's budget and this device's answers (supabase/web_ai_budget.sql).
  // None left: answer from the catalog, free.
  const allowance = await allowAnswer(cleanDevice(device), networkKey(request));
  if (!allowance.allowed) {
    return NextResponse.json({
      ...(await buildFallbackResponse(message, draft, tasteProfile, communityMembers)),
      fallback: true,
      credits: {remaining: allowance.remaining, limited: allowance.reason} satisfies Credits,
    });
  }
  // What this answer costs, call by call; recorded however the turn ends.
  let spentCents = 0;
  const settle = async (): Promise<Credits> => ({remaining: await chargeAnswer(spentCents), limited: null});

  const memory = getUserMemory(tasteProfile);
  const contextLines = [
    location != null && location.trim().length > 0
      ? `Known browser location: "${location}". Treat this as the default search area unless the user names a different place.`
      : null,
    draft != null ? `Current booking draft JSON: ${JSON.stringify(draft)}.` : null,
    `User dining memory JSON: ${JSON.stringify(summarizeUserMemoryForAgent(memory))}.`,
    zoneContextLine(draft),
    catalogAgentContextLine(),
  ].filter(Boolean);

  const system = contextLines.length > 0 ? `${SYSTEM_PROMPT}\n\n${contextLines.join('\n')}` : SYSTEM_PROMPT;
  // Static instructions first, marked for caching. Per-request context follows
  // uncached, so the cached prefix holds across turns and users.
  const systemBlocks: Anthropic.Beta.BetaTextBlockParam[] = [
    {type: 'text', text: SYSTEM_PROMPT, cache_control: {type: 'ephemeral'}},
    ...(contextLines.length > 0 ? [{type: 'text' as const, text: contextLines.join('\n')}] : []),
  ];

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
  // web_search's dynamic filtering runs code execution under the hood, which
  // leaves pending tool uses tied to a container — later iterations within
  // this same turn must reference that container or the API rejects them.
  let containerId: string | undefined;

  // Turn budget: live Claude + web search can outlast the platform's function
  // limit, and a dead request leaves the chat waiting with no cards. Past this,
  // answer from the catalog and say so.
  const TURN_BUDGET_MS = 25_000;
  const TIMED_OUT_NOTE = 'Live search ran out of time, so these picks come from the Quiet Table catalog.';
  const turnStartedAt = Date.now();

  // Manual agentic loop: run entirely within this request. Tool calls and
  // their results stay server-side and are not replayed to the client —
  // the client only keeps plain {role, text} turns, not full Claude blocks.
  for (let iteration = 0; iteration < 4; iteration++) {
    const remainingMs = TURN_BUDGET_MS - (Date.now() - turnStartedAt);
    if (remainingMs <= 0) {
      return fallbackWithNote(TIMED_OUT_NOTE, await settle(), message, draft, tasteProfile, communityMembers);
    }
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: AGENT_MODEL,
        max_tokens: 2000,
        system: systemBlocks,
        container: containerId,
        tools: [
          ...(domainTools as Anthropic.Beta.BetaToolUnion[]),
          renderUiTool as Anthropic.Beta.BetaToolUnion,
          webSearchTool as Anthropic.Beta.BetaToolUnion,
        ],
        messages,
      }, {timeout: remainingMs, maxRetries: 0});
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        return fallbackWithNote(TIMED_OUT_NOTE, await settle(), message, draft, tasteProfile, communityMembers);
      }
      await settle();
      return agentErrorResponse(error);
    }

    logUsage(iteration, response, system.length);
    spentCents += usageCents({
      model: response.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      web_search_requests: response.usage.server_tool_use?.web_search_requests ?? 0,
    });
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
      const result = executeDomainTool(block.name, input, tasteProfile, draft);
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

  const michelinApplied = applyMichelinModeToUi(textOut, uiOut, draft?.intent);
  return NextResponse.json({
    text: michelinApplied.text,
    ui: keepToCity(michelinApplied.ui, draft?.location),
    credits: await settle(),
  });
}

/** Last check before the cards go out: drop any catalog place from another
 * city than the one picked, whatever the model sent. */
function keepToCity<T>(ui: T, location: string | undefined): T {
  const interactive = (ui as {interactive?: {type?: string; options?: {id: string; title: string}[]}} | null)
    ?.interactive;
  if (interactive?.type !== 'options' || interactive.options == null || location == null) return ui;
  const kept = interactive.options.filter((option) => venueInCity(option, location));
  if (kept.length === interactive.options.length) return ui;
  console.warn(`[agent] dropped ${interactive.options.length - kept.length} option(s) outside ${location}`);
  return {...ui, interactive: {...interactive, options: kept}};
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
    case 'search_quiet_table_catalog':
      return [input.vibe, input.near, input.query].filter(Boolean).join(' · ') || 'Amsterdam catalog';
    default:
      return JSON.stringify(input);
  }
}
