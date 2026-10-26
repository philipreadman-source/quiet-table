import Anthropic from '@anthropic-ai/sdk';
import {NextResponse} from 'next/server';
import {searchTables} from '@/lib/booking-data';
import type {DietaryNeeds} from '@/lib/venue-options';
import {applyMichelinModeToUi} from '@/lib/michelin-mode';
import {
  filterExcludedVenues,
  getUserMemory,
  summarizeUserMemoryForAgent,
} from '@/lib/user-memory';
import type {FriendFoodProfile} from '@/lib/friend-graph-mock';
import {summarizeFriendForAgent} from '@/lib/friend-graph-mock';
import {tasteProfileToFriendFoodProfile} from '@/lib/member-friends';
import {listMemberProfilesForSession} from '@/lib/member-registry-server';
import {summarizeCommunityTasteForAgent} from '@/lib/member-taste-discovery';
import type {TasteProfile} from '@/lib/taste-profile';
import {buildFallbackResponse} from '@/lib/fallback-response';
import {catalogAgentContextLine} from '@/lib/venue-options';

/**
 * Fallback → buildFallbackResponse only (response includes fallback: true). No Anthropic credits.
 * Live agent → Claude + web_search + catalog tools when USE_LIVE_AGENT=true on Vercel production,
 * or USE_LOCAL_FALLBACK=false, or unset locally/preview with ANTHROPIC_API_KEY.
 */
function useLocalFallback(): boolean {
  const flag = process.env.USE_LOCAL_FALLBACK;
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  if (process.env.USE_LIVE_AGENT === 'true' || process.env.USE_LIVE_AGENT === '1') {
    return false;
  }
  if (process.env.VERCEL_ENV === 'production') return true;
  return false;
}

const USE_LOCAL_FALLBACK = useLocalFallback();

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
function fallbackWithNote(note: string, ...args: FallbackArgs) {
  const fallback = buildFallbackResponse(...args);
  return NextResponse.json({
    ...fallback,
    text: [note, fallback.text].filter(Boolean).join('\n\n'),
    fallback: true,
  });
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
- Among the venues your search returned, rank ones friends have visited and rated highly first. Note which friend(s) went and what they said when that data exists in get_user_dining_history or context — surface it on cards via subtitle or meta (e.g. "<friend name> loved it last month").
- If you have no logged friend-visit data for this user/city, say so plainly in spoken text — do not invent friend reviews or fake social proof. Offer general (non-friend-sourced) suggestions ranked by vibe, taste memory, and availability instead.
- Passive signals beat reviews: a friend's booking or save is enough; don't ask users to write reviews in chat.
- Friends are real Quiet Table members, listed in the Member taste graph JSON. Use get_friend_food_profile only for a named friend missing from it. Help build the graph over time by acknowledging saves and likes the user makes in-session.
- As the social graph grows, warm friend signals should progressively outweigh generic picks; when the graph is empty, lean on taste memory and honest fit copy.

Vibe, price & Michelin:
- Understand and filter by vibe (casual, date night, celebratory, quick bite, group-friendly, quiet, business, etc.) — infer from review text, restaurant type, and draft context when not explicit.
- Respect price/spend signals from the draft (e.g. date-night spend tier). Let users narrow by budget in spoken text if unclear.
- MICHELIN MODE: When the booking draft intent is Michelin star, run exactly ONE web_search (e.g. site:guide.michelin.com Michelin star restaurants Amsterdam Noord). Do not repeat web_search with rephrased queries. Only propose restaurants you found on guide.michelin.com. Every venue in render_ui.options MUST include michelin_guide_url and michelin_distinction when known. Never claim Michelin status without a Guide URL.

Tool budget (speed — follow strictly):
- Venue-results turn (first options list after draft complete): at most ONE search_quiet_table_catalog, at most ONE web_search (cities other than Amsterdam, Michelin intent, or the catalog has nothing for the request). Card times are illustrative; there are no live reservation APIs.
- Do NOT call get_friend_food_profile when Member taste graph JSON is already in context — use that data for members.
- Do NOT call get_user_dining_history if User dining memory JSON is already in context unless the user just changed preferences in chat.
Discovery & menus (catalog + web):
- Quiet Table ships a curated Amsterdam catalog (search_quiet_table_catalog). Treat it as solid product data: editorial lists, friend visits, dietary tags, stable ids.
- For Amsterdam: one catalog search filtered by vibe and near from the draft. Include catalog picks in render_ui.options (exact id + title). For any other city, use web_search instead of the catalog. For Amsterdam, add web_search only when Michelin mode or the user asked for menus/openings not in catalog.
- Venues on the cards come from this turn's search (catalog or web_search results). Friend and member data only ranks and labels those venues. Never use a friend's loved list as the result set. Add at most ONE friend favourite that search didn't return, and only for a friend in draft.goingWithFriendIds. If web_search returned venues, at least three cards must be from those results.
- Put menu summaries in description / menu_overview. View menu only when menu_url is known (catalog or web).
- Never set image_url on options or detail — the UI is text-first (no venue photos).

UI & booking (Quiet Table layer — non-negotiable):
- The UI is the primary path. Prefer structured render_ui controls (venue cards, detail) over prose-only next steps. Spoken text explains why the UI choices are shown; it doesn't replace them.
- Treat the booking draft JSON from the client as source of truth. If the user's latest text changes part of it, acknowledge and return the next useful UI control.
- When draft.goingWithFriendIds is set: rank search results by those friends' taste (cuisines, vibes, venues they loved), surface their social lines on cards, and honor draft.dietaryNeeds + draft.partyDietarySummary from companion restrictions (e.g. pescatarian — fish OK, no meat).
- Dietary limits are hard filters, not ranking hints. Read them from draft.dietaryNeeds, draft.partyDietarySummary, the user's memory preferences (dietaryLean, dietaryNotes) and dietaryNotes for each friend in draft.goingWithFriendIds. Drop any venue built around food someone in the party can't eat (e.g. steakhouses, smokehouses and BBQ for a vegetarian or pescatarian). When the user states a new limit in chat, search again with it rather than re-ranking the previous cards.
- Optional context (noise preference, tie-in plans, dietary for a named guest) — pick up naturally if mentioned; never assume or center the flow on it.
- Call get_user_dining_history when you need taste memory. Never re-suggest venues the user recently disliked; boost places they liked or saved.
- Ground every claim in actual tool results this turn. Never narrate checks or obstacles that didn't happen.
- At the end of every turn, call render_ui exactly once. interactive.type "options" works for venues, neighborhoods, or any short list. Include tool_status when you called other tools.
- After catalog search (and optional single web_search), render venue choices as interactive.type "options". After venue selection → "detail" for that venue. Quiet Table does not book tables: the detail card's Book button opens Google Maps and copies the date, time and party size. Never say a table is booked or confirmed.
- Put AI menu summaries on the card (description / menu_overview), not behind View menu. View menu only for real menu_url.
- Keep occasion options consistent with draft context — e.g. never offer "date night" when party size ≥ 3.
- First venue-results spoken text (interactive.type "options" after draft complete): one tight hook only — e.g. vibe + strongest friend or dietary note + "pick a table below". No venue essays, no repeating card copy, empty string OK on "show more". Example shape: "Saturday date night — leaning on your taste profile and a friend's favourite. Three strong fits at 8:30."`;

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
      'Rarely needed — member taste graph is already in context. Only if the user names a friend who is NOT in that JSON.',
    input_schema: {
      type: 'object',
      properties: {name: {type: 'string', description: 'Friend first name or member id'}},
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
                id: {type: 'string'},
                title: {type: 'string'},
                subtitle: {type: 'string'},
                meta: {type: 'string'},
                description: {type: 'string'},
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

function resolveCommunityFriendByName(
  name: string,
  communityMembers: FriendFoodProfile[],
): FriendFoodProfile | undefined {
  const needle = name.trim().toLowerCase();
  if (needle.length === 0) return undefined;
  return communityMembers.find(
    (member) =>
      member.id.toLowerCase() === needle ||
      member.name.toLowerCase() === needle ||
      member.fullName.toLowerCase().includes(needle) ||
      needle.includes(member.name.toLowerCase()),
  );
}

function executeDomainTool(
  name: string,
  input: Record<string, unknown>,
  tasteProfile?: TasteProfile | null,
  communityMembers: FriendFoodProfile[] = [],
): unknown {
  switch (name) {
    case 'get_user_dining_history':
      return summarizeUserMemoryForAgent(getUserMemory(tasteProfile));
    case 'get_friend_food_profile': {
      const rawName = String(input.name ?? '');
      const friend = resolveCommunityFriendByName(rawName, communityMembers);
      return friend != null
        ? summarizeFriendForAgent(friend)
        : {error: 'No friend profile on file — do not invent visits or reviews.'};
    }
    case 'search_quiet_table_catalog': {
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

export function GET() {
  return NextResponse.json({fallback: USE_LOCAL_FALLBACK});
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
    communityMembers.length > 0
      ? `Member taste graph (beta — use it to rank and label search results, not as a source of venues):${JSON.stringify(summarizeCommunityTasteForAgent(communityMembers))}.`
      : 'No other members on the table yet — rely on the signed-in user taste profile only.',
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
      return fallbackWithNote(TIMED_OUT_NOTE, message, draft, tasteProfile, communityMembers);
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
        return fallbackWithNote(TIMED_OUT_NOTE, message, draft, tasteProfile, communityMembers);
      }
      if (USE_LOCAL_FALLBACK) {
        return NextResponse.json({
          ...buildFallbackResponse(message, draft, tasteProfile, communityMembers),
          fallback: true,
        });
      }
      return agentErrorResponse(error);
    }

    logUsage(iteration, response, system.length);
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
      const result = executeDomainTool(block.name, input, tasteProfile, communityMembers);
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
    case 'search_quiet_table_catalog':
      return [input.vibe, input.near, input.query].filter(Boolean).join(' · ') || 'Amsterdam catalog';
    default:
      return JSON.stringify(input);
  }
}
