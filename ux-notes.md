# Quiet Table UX Notes

## Product Spine

- Proposed Direction: UI-first booking flow with conversational fallback.
- **Rules file:** `rules.md` — stable booking logic and UX guardrails (party sizes, intent handoffs, etc.).
- Astryx UI: component system and interaction constraints.

## Casual Baseline Pass

Casual is the baseline flow for shaping the whole UX.

### Works

- UI-only path completes: Casual -> size -> Amsterdam -> date -> time -> venue cards.
- Final handoff returns venue cards, not prose-only.
- User summary bubble is clear enough as a draft recap.

### Tidy Points

- Opening welcome should become useful setup copy or disappear into the card prompt.
- Casual acknowledgement needs more context: "Casual, easy. I'll keep it relaxed and unfussy. How many of you?"
- ~~Size choices are broad but dense. Consider grouped choices: 1, 2, 3-4, 5-6, 7+.~~ → **Casual caps at 6 + 6+**; see **Casual party size & group handoff** below and `rules.md`.
- Location copy should reflect Amsterdam lock: "Amsterdam" / "Default search area".
- Date prompt should be more active: "Which night should I check?"
- Time step should not show fake "Booked" slots before a venue is known.
- ~~Venue cards need stronger decision cues: why it fits, neighborhood, price/vibe, concrete availability.~~ → see **Rich venue option cards** below.
- ~~"Available at the selected time" should become concrete, e.g. "Available at 7:30pm".~~ → **shipped 2026-07-14**, see **Per-venue availability** below and `rules.md`.
- "Pick one and I'll take you to confirmation" is acceptable but could soften to "Pick one and I'll show the table before we confirm."

## Rich venue option cards (2026-07-14)

Significant UX update: venue **options** and **detail** cards are now decision-oriented, not just title + "Choose X".

### What shipped

- **List-style inner layout (2026-07-22, first pass)** — Figma layout guide inside Astryx `SelectableCard` (Astryx padding/radius kept). Horizontal header (square image + title / availability / place / ratings / dietary chip), expandable icon+text meta band (description, social, personalization — room for more rows), then Book / View menu / share (share stub). Component: `src/app/components/venue-result-listing.tsx`.
- **Trusted social proof** (mock, local) — now a meta row with thumbs icon (e.g. *"John recently liked this"*). Goal: context from friends/contacts before the user commits.
- **Ratings line** — fake Google ★ and TripAdvisor ★ plus review count (e.g. `Google ★ 4.5 · TripAdvisor ★ 4.5 · 1,240 reviews`).
- **Secondary actions** on each card (clicks do **not** select the venue):
  - **View menu** — always present. Opens the exact `menu_url` when known; otherwise expands an **AI menu overview** with caveat (*not the live menu*). Live agent path: pull exact menu or scan site/socials for the overview.
  - **Share** — icon present for parity; no-op until share sheet is designed.
  - ~~Google reviews / TripAdvisor~~ — deferred; ratings line still shown as text.
- Primary card tap still selects the venue and moves to **detail**; detail layout not yet matched to list style.
- CTA copy on cards: **Book a table** / **View menu**.

### Data & credits

- All enrichment lives in **`src/lib/venue-options.ts`** — mock catalog keyed by intent (casual, date night, Michelin).
- **`USE_LOCAL_FALLBACK = true`** unchanged: no Anthropic calls, no web search, no menu/review API fetches. Links are static URLs only when the user clicks.
- Agent fallback (`route.ts`) uses `getVenueOptionsForIntent()`; client merges sparse payloads via `enrichVenueOption()`.

### Files

| File | Role |
|------|------|
| `src/lib/venue-options.ts` | Mock venues, social proof, ratings, outbound URLs |
| `src/app/components/venue-result-listing.tsx` | List-style inner content for option cards |
| `src/app/page.tsx` | SelectableCard shell + detail enrichment |
| `src/app/api/agent/route.ts` | Fallback options + detail copy from catalog |

### Still to do (later)

- Tweak list spacing/type after first-pass review.
- Match detail view to the same list layout.
- Replace mock social proof with real contacts / social graph when available.
- Pull or embed menus without leaving the app when an exact source exists; otherwise keep the AI overview + caveat path.
- Wire share sheet.

## Per-venue availability (2026-07-14)

"if a user now taps 9:30pm - maybe there is more options, or one of these options isn't available. we're faking this obv but i think we should reflect reality here."

### What shipped

- Time selection now actually changes what the venue cards say. Previously every card hardcoded `"Available at the selected time"` regardless of which time was picked — picking 6:30pm vs 9:30pm changed nothing downstream.
- Added a **fine-grained, per-venue seeded fake** (`isVenueAvailableAt(venueId, date, time)` in `venue-options.ts`) independent from the existing coarse date-level time-chip fake (`timeSlotAvailability`). Same deterministic hash approach — reproducible per demo run, not random per render.
- Venue card meta line is now honest: `"Available at 9:30pm"` or near-aim variants via `resolveOfferedAvailability` / `assignOfferedAvailabilityForResults`.
- Same logic applied server-side in `route.ts`'s fallback options path (meta written per card from the full ranked set).
- **Plentiful (4+ exact):** ~2 cards offered at **+15** with clear “past your aim” copy. **Sparse (&lt;3):** stretch into ±15–30 so the list isn’t thin.

### Rationale

An agentic backend naturally handles "this specific venue, at this specific time, doesn't have a table" — that's what `check_venue_availability` is for in the live agent path. The local fallback was the one place flattening that away by always claiming availability. Fixing the fake data model closes that gap without needing live API calls. Off-aim offers make strong finds usable without pretending every table is exactly at the aimed slot.

### Still open (deliberately deferred)

- **Zero-venues-available at a chosen time.** Partially handled via `nearestAvailableTimesAcrossVenues` title + empty list; could still get a warmer agent recovery beat.
- No inline "switch to this time" affordance on a near-aim card yet — the offered time is informational text only (draft still holds the aimed time).

## Casual party size & group handoff (2026-07-14)

Product rule (also in **`rules.md`**): casual does not expose 7–9+ on the size step.

### What shipped

- Casual chips: **1, 2, 3, 4, 5, 6, 6+** (`CASUAL_PARTY_SIZES` in `page.tsx`).
- **6+** auto-handoff to **group flow**:
  - Intent → `I need a table for a group.`
  - Acknowledgement → *Group dinner, nice.*
  - Location step and beyond use group intent for copy and venue catalog.
- Group venue mock options added (`GROUP_OPTIONS` in `venue-options.ts` — e.g. Cecconi's, MOMO).

### Rationale

Large casual dinners are really group bookings — separate UX, separate venue set, without asking the user to back out and re-pick **Group** from the intent list.

### Still open

- Direct **Group** intent card still shows full 1–9+; may later start at 6+ only for consistency.

## Agentic plays

Named moments where the agent does real work beyond tapping through the wizard — worth calling out in demos and design reviews.

### Menu view

**Trigger:** User taps **View menu** on a venue option or detail card.

**Play:**
1. **Exact menu** — if a `menu_url` (or equivalent live source) exists, open/show that menu.
2. **AI overview** — if not, the agent scans the restaurant website / socials and returns a short menu overview.

**Control boundary:** Overview is never presented as the live menu. Always surface the caveat: *AI overview from the restaurant’s website and socials — not the live menu.*

**Why it matters:** Lets someone decide “is this the right spot?” without leaving the booking thread — and flexes agentic research when an exact menu isn’t in hand.

**Status:** CTA shipped on cards; exact URL path works; overview path is fallback-synthesized today, live scan when agent mode is on. See `rules.md` § View menu.

## UX Decisions

- Use local fallback venue data until explicitly told to re-enable live AI calls.
- Treat stable booking constraints as rules, not model guesses.
- Use AI/fallback copy for context, rationale, and edge-case handling.
- Keep the composer available throughout as a fallback, but optimize the primary path for UI selection.
