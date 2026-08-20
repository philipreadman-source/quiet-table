# AX Brain — Terminology & Reference

A shared vocabulary for Quiet Table and agentic booking work.  
Start here when we say “AX,” “orchestration,” or “agentic UX.”

---

## Core idea (one paragraph)

**UX → AX** names a real shift: the user stops operating controls and starts **delegating outcomes**. That shift is easy to see. Harder — and where the design work now lives — is the **orchestration layer**: the place between what the user meant and what the system does. Screens get simpler; that middle layer gets heavier. AX is not “less UI.” It is designing how intention becomes action, and how control comes back.

Primary source: [AX is just the orchestration layer](https://uxdesign.cc/ax-is-just-the-orchestration-layer-cacb4ed4fe45) — Adrian Levy, UX Collective (Jul 2026).

---

## Glossary

| Term | Plain meaning | Quiet Table example |
|------|---------------|---------------------|
| **UX** | User operates the interface (menus, forms, flows). | Wizard chips for size / date / time |
| **AX** | Agentic experience — user states an outcome; system acts. Badge for the shift, not a full map of the work. | “Find me a date-night table” → venues appear |
| **Locus of control** | Who drives: human vs system. Generative AI reverses it — user says *what*, not *how* (Nielsen). | User aims for 7:30; agent finds who has a table |
| **Orchestration layer** | The design place between intention in and judgment out. Not plumbing — product. Decides how far the agent goes, when it asks, what it shows. | Draft + memory + tools → ranked cards + copy |
| **Delegation** | Handing an outcome to the system instead of operating each step. | After summary, agent runs search / rank / UI |
| **Teleporting to the goal** | What good AX *feels* like (Maeda). Not the work itself — the work is designing the transit. | Wizard feels fast; agent “just finds tables” |
| **Principal** | You are no longer only the “user”; you are the person the agent acts *for*. | Aiden’s memory, tastes, accountability for booking |
| **Control boundary** | What the system may decide alone vs where it must stop and ask. | All times choosable; availability only after venues |
| **Cognitive distribution** | Who does which part of the thinking. | UI: occasion/budget; agent: search & rank |
| **Intention verification** | Are we building what they meant, or what was easiest to parse? | Occasion + spend before search; summary recap |
| **Legibility surface** | Can they read what it did in time to stay responsible? | “Left out Bar Fisk”; “Available at 8pm (near 7:30)” |
| **Outcome procurement** | What “done” means and who confirms. | Book a table / success banner — explicit confirm |
| **Upstream border** | Where intention enters; keep intent intact across translation. | Intent cards + occasion/spend + draft as source of truth |
| **Downstream border** | Where control returns after the system acted. | Cards, tool status, personalization note (once) |

---

## Anatomy — five surfaces, one address

All five live **inside** the orchestration layer (not five separate screens):

```
  Intention in  ──►  [ ORCHESTRATION LAYER ]  ──►  Judgment out
                         │
                         ├─ 1. Control boundaries
                         ├─ 2. Cognitive distribution
                         ├─ 3. Intention verification
                         ├─ 4. Legibility surfaces
                         └─ 5. Outcome procurement
```

**Quiet Table mapping (current prototype):**

| Surface | How we design it today |
|---------|-------------------------|
| **1. Control boundaries** | Wizard owns party/date/time; agent owns venue search. Never grey “booked” times before a restaurant exists. Disliked venues filtered out. Booking only after explicit confirm. |
| **2. Cognitive distribution** | Casual = lean UI. Date night = UI adds occasion + budget. Agent does availability (exact / ±15 / ±30; plentiful +15 mix; sparse stretch), ranking, card UI. Memory applies tastes without re-asking every time. |
| **3. Intention verification** | Structured draft + summary. Date night ceremony/spend before search. Dietary chips. Live path: free text can patch the draft. |
| **4. Legibility** | Personalization note on first results only. Availability lines. Social/memory badges. Chronological thread (messages below cards). Tool status when live agent runs. |
| **5. Outcome procurement** | Select venue → detail → Book. Success = table booked. Prototype pause before full payment path. |

---

## UX vs AX — how we talk about Quiet Table

| Layer | Role | Owns |
|-------|------|------|
| **Wizard (UX)** | Fast, structured brief | Intent, size, location, date, time; date night adds occasion + spend |
| **Orchestration (AX)** | Intention → plan → act → show | Draft as truth, memory/social, search, exact / ±15 / ±30 (plentiful +15 mix), rank, `render_ui` |
| **Live agent vs fallback** | Demo rails | Amsterdam mock catalog vs real web search when agent is on |

**Don’t say:** “Agentic means chat replaces the UI.”  
**Do say:** “UI gathers the brief; orchestration decides how the agent finds and shows the table.”

---

## Related references (starter shelf)

Keep adding links here as we find them.

### Primary (Levy / UX Collective)
- [AX is just the orchestration layer](https://uxdesign.cc/ax-is-just-the-orchestration-layer-cacb4ed4fe45) — Levy, Jul 2026 · *this brain’s anchor*
- [You don’t design the interface anymore. You design the deciding.](https://uxdesign.cc/you-dont-design-the-interface-anymore-you-design-the-deciding-835c01982ead) — Levy · five surfaces of deciding
- [You are no longer the user. You are the principal.](https://uxdesign.cc/you-are-no-longer-the-user-you-are-the-principal) — Levy · principal vs user *(confirm URL if link drifts)*

### Named in the essay
- **John Maeda** — *Design in Tech Report* · UX → AX; “orchestrating outcomes”; “teleporting to the goal”; screen as window for judgment
- **Jakob Nielsen** — generative UI / locus of control reversal — user states result, not procedure
- **arXiv / agent-oriented software** — discoverability, orchestration, capability granularity, interface standardization *(cited in Levy; pin exact paper when we use it in a deck)*

### Adjacent responses worth skimming
- [Even without I, there’s always U](https://codewords.tech/even-without-i-theres-always-u-4960fa8f5a6b) — related AX framing (comment on the essay)

### Quiet Table project docs
- `agentic-booking-flow-planning.md` — flow diagram, casual vs date night
- `rules.md` — hard product rules
- `ux-notes.md` — UX narrative & open items
- `ux-decisions-log.txt` — dated decisions

---

## Design prompts (use on any new beat)

Before shipping a new agentic moment, answer:

1. **Boundary** — What must it stop and ask about?
2. **Legibility** — How does it show its work when it does?
3. **Done** — What does “done” mean so someone can check it?

That’s control boundary + legibility + outcome procurement in one pass.

---

## Phrases we prefer in demos

| Prefer | Avoid |
|--------|--------|
| Orchestration layer | “The AI just handles it” |
| Control boundary | “Fully autonomous” with no stop points |
| Intention in / judgment out | “Teleport” as the whole job |
| Principal (Aiden) | Only “user” when agency + accountability matter |
| Cards as agent output | Prose-only as the product |

### FLAG: first venue-results spoken text

- **Fallback on** (`USE_LOCAL_FALLBACK = true`): templated intro — e.g. *“I'm favouring calmer spots… I found 8 date-night options around Amsterdam…”* (`FALLBACK_VENUE_INTRO_IS_TEMPLATE` in `route.ts` / `user-memory.ts`).
- **Fallback off** (live agent): spoken text must be **context-aware** from draft selections (intent, occasion, spend, location, time, dietary) + memory — one short paragraph on first results only. System prompt enforces this.

---

## How to grow this brain

When we read something useful:
1. Add a **glossary row** (term · plain meaning · Quiet Table example)
2. Add a **link** under Related references
3. If it changes a product rule, log it in `ux-decisions-log.txt` too

Last seeded: 2026-07-20 · Levy “AX is just the orchestration layer”
