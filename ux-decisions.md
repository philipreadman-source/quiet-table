# Quiet Table — UX Decisions

Demo-friendly summary. Chronological archive: `ux-decisions-log.txt`. Hard rules: `rules.md`.

---

## TLDR

**UI gathers the brief. The agent finds the table.**

- Opening cards → structured wizard → short recap → dietary → ranked venue cards.
- Casual stays lean. Date night adds occasion + budget (party of 2, size skipped).
- Time is an **aim**, not availability. All slots choosable. Agent returns exact time, or ±15 / ±30 when needed.
- Cards carry social proof, ratings, memory badges, and **View menu** (exact URL or AI overview with caveat).
- Composer is always there as escape hatch; its teaser line updates with the phase.

---

## Wizard vs Agentic

| **Wizard (UI)** | **Agentic (AX)** |
|-----------------|------------------|
| Intent cards (Casual, Date night, Michelin, Business, Group) | Search + availability around aimed time |
| Party size chips (rules per intent; Casual 6+ → Group) | Rank: exact → near-15 → near-30 → memory → dietary |
| Location (Amsterdam demo) | Personalization note once on first results |
| Date night only: occasion → spend | List-style venue cards (3 + Show more) |
| Date → time aim → summary recap | View menu: exact link **or** AI site/social overview + caveat |
| Dietary chips after summary | Book / confirm / success |
| Composer fallback at every step | Live agent vs local mock catalog |

**Don’t say:** “Agentic means chat replaces the UI.”  
**Do say:** “UI gathers the brief; orchestration decides how the agent finds and shows the table.”

---

## Other notes

### Casual vs Date night

| | Casual | Date night |
|--|--------|------------|
| Party size | Ask · 1–6, **6+ → Group** | Skip · always 2 |
| Extra beats | None | Occasion → Budget |
| After summary | Same path | Same path |

Shared after location: **date → time (aim) → summary → dietary → agent.**

### Time & availability

- Aim first — never grey “booked” slots before venues exist.
- **Sparse (&lt;3):** stretch ±15 / ±30 so the list isn’t thin.
- **Plentiful (4+ exact):** most stay exact; ~2 offered at **+15** (strong finds are worth a short wait).
- Card copy: `Available at 8:00pm` / `8:15pm` / `8:30pm` — no long “past your aim” suffix.

### View menu (agentic play)

- Always on the card.
- Exact `menu_url` → open it.
- Otherwise → AI overview from site/socials, with caveat: *not the live menu.*

### Composer teaser

Updates with the phase. On results: *Can't find what you're looking for? Or have any questions...*

### Demo rails

- `USE_LOCAL_FALLBACK = true` — mock Amsterdam catalog, no API credits. Flip to `false` when Anthropic billing is topped up.
- Flip off for live demos (e.g. Paris + real search).

### Parked

- Location-aware spend bands · Maps favourites / blog guides as social graph · Detail view list layout · Live share sheet

---

## Related

| Doc | Use for |
|-----|---------|
| `rules.md` | Hard product rules |
| `agentic-booking-flow-planning.md` | Flow diagram + talk track |
| `ax-brain.md` | AX vocabulary |
| `ux-notes.md` | Narrative + open tidy items |
| `ux-decisions-log.txt` | Chronological archive |
