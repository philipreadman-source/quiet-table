# Quiet Table — Booking & UX Rules

Hard-coded product rules. The wizard and fallback agent should follow these; AI copy handles tone and edge cases around them, not the logic itself.

## Intent → party size

| Intent | Party size step | Notes |
|--------|-----------------|-------|
| **Casual** | `1, 2, 3, 4, 5, 6, 6+` | Cap at 6; **6+ switches to group flow** (see below). |
| **Date night** | Skip | Fixed party of **2**. |
| **Michelin star** | `1, 2, 3, 4, 4+` | Large parties are rare at this tier; agent handles 4+ results. |
| **Business** | `1–9+` (full range) | Unchanged. |
| **Group** | `1–9+` (full range) | Direct group pick; subtitle says “6 or more”. |

## Casual 6+ → group handoff

When the user picks **Casual**, then **6+** on “How many of you?”:

1. **Intent** becomes group: `I need a table for a group.`
2. **Acknowledgement** becomes: *Group dinner, nice.*
3. **Party size** stays `6+` → draft summary: *for a party of 6 or more*
4. Wizard continues: location → date → time → agent.
5. **Venue options** use the **group** catalog (not casual).

Do not offer 7, 8, or 9+ on the casual size step — route large parties through group.

## Composer teaser (catch-all input)

- Placeholder copy **updates with the flow** — never stays on the opening intent line after the user has moved on.
- Wizard steps already have per-stage lines (`STAGE_PLACEHOLDERS`).
- Once venue **results** are on screen: `Can't find what you're looking for? Or have any questions...`
- Dietary / other post-summary teasers are soft defaults for now — full per-step matrix TBD.

## View menu

- Every venue **option** and **detail** card always shows **View menu** next to Book a table.
- **Exact menu:** when `menu_url` is known, open it (new tab).
- **AI overview:** when no exact menu is available, the agent may scan the restaurant website / socials and show a short overview. Always include the caveat: *AI overview from the restaurant’s website and socials — not the live menu.* Never present an overview as a definitive current menu.
- Fallback prototype synthesizes an overview from catalog copy when `menu_url` is missing (`resolveMenuAction` in `venue-options.ts`).

## Location

- Default search area: **Amsterdam** (geolocation may refine neighborhood label).

## Venue availability

- User aims for a time **before** venues are known — **all time chips are choosable**. Never grey out slots as "booked" pre-venue; we don't know availability yet.
- After the draft is complete, pull restaurants that have a table at the **exact aimed time**, or within **±15 / ±30 minutes**.
- **Sparse (0–2 / under 3 results):** lean on the ±15–30 window to fill the list — a good find is worth a short wait or coming a bit early.
- **Plentiful (4+ exact matches):** keep most cards at the exact aimed time, but intentionally offer **~2** as **+15 min** (e.g. aim 8:00pm → Available at 8:15pm) with clear copy — strong finds are worth waiting a little.
- Per-venue fake: `isVenueAvailableAt` / `resolveOfferedAvailability` / `assignOfferedAvailabilityForResults` / `filterVenuesByAimedTime` in `venue-options.ts`.
- Card copy: `"Available at 8:00pm"` (exact), `"Available at 8:15pm"` (+15), or `"Available at 8:30pm"` (±30). Exact ranks above near-15 above near-30.
- Ranking order: exact → near-15 → near-30 → memory → dietary. Fully unavailable venues are filtered out.
- Selecting a venue that only has a near slot is allowed — the card states the bookable time honestly.

## Agent / fallback

- **`USE_LOCAL_FALLBACK = true`** — mock catalog (no API credits). Flip to `false` for live agent demos when Anthropic billing is topped up.
- Venue cards: mock catalog in `src/lib/venue-options.ts` keyed by intent (casual, date, michelin, **group**).
- Stable constraints live here and in code; model handles wording and exceptions only.

## References

- UX decisions (demo): `ux-decisions.md`
- UX narrative and open tidy items: `ux-notes.md`
- Decision log with dates: `ux-decisions-log.txt`
- Implementation: `src/app/page.tsx` (`CASUAL_PARTY_SIZES`, `applyPartySizeSelection`), `src/lib/venue-options.ts` (`isVenueAvailableAt`, `assignOfferedAvailabilityForResults`, `resolveOfferedAvailability`)
