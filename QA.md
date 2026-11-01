# QA checklist

Manual scenarios for Quiet Table, with a record of each run. Re-run the
relevant section after a change to that area, then add a row to its log.

**Result key:** ✅ pass · ❌ fail · ⚠️ pass with a note · — not run

**Where:** `local` is `npm run dev` (no Redis, so no member/friend data) ·
`prod` is https://quiet-table-1.vercel.app

---

## 1. Find — agent off (fallback mode)

Production runs with `USE_LOCAL_FALLBACK=true`. Typed text before the wizard
is finished is handled on the device: nothing is sent to the agent.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1.1 | Message with nothing to use | On a fresh Find, type `hmm not sure` and send | Reply: "Sorry, the agent's off…". 3 saved casual place cards with **Show more restaurants** below. Wizard cards stay above. |
| 1.2 | Show more | After 1.1, tap **Show more restaurants** | 3 more cards are added to the same list (6 total). Button stays while there are more. No new chat message. |
| 1.3 | Intent, size and city in one message | Fresh Find, send `michelin for 4 in London` | Reply "Got it: Michelin star, in London, for 4." Size step shows **4** selected. Wizard is on **Who are you going with?** |
| 1.4 | Friend by name | Fresh Find, send `With Molly in Amsterdam` (use a real member's name) | Reply "Got it: with Molly, in Amsterdam. What kind of table are you after?", plus a line for Molly: diet, cuisines she likes, favourites. Tap an intent card: on the going-with step, Molly is already selected. |
| 1.5 | Friend by username | Send `dinner with @<username>` | Same as 1.4 for that member. |
| 1.6 | Name inside another word | Send `mollyhouse in Amsterdam` | Molly is **not** matched. |
| 1.7 | Text at the location step | Get to **Where should I look?**, send `London please` | Location becomes London and the wizard moves on. |
| 1.8 | Text at the going-with step | Get to **Who are you going with?**, send `with <name>` | That friend is selected and the wizard moves to location. |
| 1.9 | Business is gone | Fresh Find | Intent cards: Casual, Date night, Michelin star, Group. No Business. |

### Log

| Date | Where | Ran | Result | Notes |
|------|-------|-----|--------|-------|
| 2026-11-01 | local | 1.1, 1.2, 1.3, 1.9 | ✅ | 1.2: 3 → 6 cards. |
| 2026-11-01 | local (unit) | 1.4–1.6 matching | ✅ | Name/username/"mollyhouse" checked in code. The screen flow needs prod member data and hasn't been run yet. |

---

## 2. Find — results

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 2.1 | Michelin only | Michelin star → finish the wizard | Only Michelin-guide places (stars, Bib Gourmand, Selected). No burger bars or cafés. |
| 2.2 | Closed days dropped | Michelin star on a **Monday** at 7:30pm | Restaurant 212, Ciel Bleu, CUE and Sinne are not shown. |
| 2.3 | Closed days, open day | Same on a **Saturday** at 8pm | All four are back. |
| 2.4 | Seating windows | Ciel Bleu (18:30–20:00) at 8:00pm on a Saturday | Shown (the end of a seating window counts). |
| 2.5 | Diet with a friend | Going with a pescatarian friend | No steak or grill places. |

### Log

| Date | Where | Ran | Result | Notes |
|------|-------|-----|--------|-------|
| 2026-11-01 | local (unit) | 2.1–2.4 | ✅ | Ranking checked in code: Monday 7:30pm drops 212, Ciel Bleu, CUE and Sinne; Saturday 8pm returns 14 Michelin places. |

---

## 3. Onboarding

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 3.1 | Steps | Start onboarding | Welcome → Basics → Cuisine → **Dietary needs** → Quiz → Invite friends. Shows "Step 3 of 5" on dietary. |
| 3.2 | Dietary default | Reach the dietary step | "No restrictions" preselected. Continue works without changes. Notes field is optional, max 200 characters. |
| 3.3 | Quiz respects diet | Pick Vegetarian, continue to the quiz | No steak/grill places and no seafood-only places. |
| 3.4 | Pescatarian keeps fish | Pick Pescatarian | Fish places (e.g. Bar Fisk) can appear; steak/grill places don't. |
| 3.5 | Saved to profile | Finish onboarding, open Profile | Dietary needs card shows what was picked. |

### Log

| Date | Where | Ran | Result | Notes |
|------|-------|-----|--------|-------|
| 2026-11-01 | local (API) | 3.3, 3.4 | ✅ | Quiz API with `diet=vegetarian` / `pescatarian`. Screen flow not clicked through yet. |

---

## 4. Profile

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 4.1 | Add a place: partial name | Reviews → Add a place, type `brut` (home Amsterdam) | Brut de Mer, Brutus Bros etc. in Amsterdam, each with area and type. |
| 4.2 | Add a place: other city | Home London, type `padel` | Padella (London). Nothing from other countries when there's a local match. |
| 4.3 | Add a place: from a trip | Home London, type `septime` | Nothing local, so falls back to anywhere: Septime, Paris first. |
| 4.4 | Reviews heading | Open Profile | Heading "Reviews", no helper line under it. |

### Log

| Date | Where | Ran | Result | Notes |
|------|-------|-----|--------|-------|
| 2026-11-01 | local (API) | 4.1–4.3 | ✅ | One empty result for `padel` on the first try; fine on retry (Photon). |

---

## 5. Mobile layout (375px wide)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 5.1 | Width | Open Find on a phone | Content runs to the 16px page edge; no extra side padding. |
| 5.2 | Composer | Look at the chat box | One line, send button on the right. Placeholder stays on one line. |
| 5.3 | Composer grows | Type a long message | Box grows line by line; send stays bottom-right; text isn't cut off. |
| 5.4 | Quiet Table dot | Look at assistant messages | 8px light-green dot, centred on the first line of the bubble, card or text beside it. |
| 5.5 | Welcome bubble | First message | Light green at 20%, no outline. |
| 5.6 | Desktop unchanged | Same at desktop width | Original padding and composer layout. |

### Log

| Date | Where | Ran | Result | Notes |
|------|-------|-----|--------|-------|
| 2026-11-01 | local | 5.1–5.6 | ✅ | Dot centres measured within 1px of the first line. |
