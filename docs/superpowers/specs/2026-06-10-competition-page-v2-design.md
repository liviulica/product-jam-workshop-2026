# Competition page v2 — design

**Date:** 2026-06-10
**Status:** Approved (design), pending spec review
**Author:** Claude (brainstormed with liviu)

## Goal

Expand the portal's Competition section and the `/h:competition` command from a
competitor catalogue into a strategic view. Add three new rendered sections —
a Handy-focused **SWOT**, a **proposed roadmap**, and an **aggregated latest-news
feed** — and broaden the competitor set. Update the command file so future runs
regenerate the richer structure correctly.

This is a portal feature change, not just a data refresh: it touches the data
contract (`competition.json`), the TypeScript types/loader, the Competition page,
and the command prompt.

## Decisions (locked during brainstorming)

1. **Render in the portal** — new sections are visible on the Competition page, not data-only.
2. **Handy-focused** SWOT and roadmap (one of each, about Handy vs the field), not per-competitor.
3. **Competitor set = 12**: existing 8 (superwhisper, MacWhisper, Wispr Flow, Aqua Voice,
   Talon Voice, Otter.ai, Apple Dictation, Windows Voice Typing) + **Eloquent, Grammarly,
   VoiceInk, Willow Voice**.
4. **Latest news = one chronological feed** (date-sorted desc, ~12–15 items, last ~3 months,
   each tagged with its competitor), separate from each competitor's own `recentNews`.
5. **Roadmap horizons = Now / Next / Later** (not dated quarters). Framed explicitly as a
   *proposed* strategy grounded in competitive gaps, NOT the maintainer's committed plan.
6. **Grammarly is adjacent** (writing assistant with voice features, not local dictation),
   framed like Otter.ai.

## Data contract — `portal/public/data/competition.json`

Unchanged top-level fields: `generatedAt`, `summary`, `competitors[]`, `opportunities[]`.

New top-level fields:

```jsonc
"swot": {
  "strengths":     ["string", ...],
  "weaknesses":    ["string", ...],
  "opportunities": ["string", ...],   // canonical list of Handy opportunities
  "threats":       ["string", ...]
},
"roadmap": [
  { "horizon": "Now",   "theme": "string", "items": ["string", ...], "rationale": "string" },
  { "horizon": "Next",  "theme": "string", "items": ["string", ...], "rationale": "string" },
  { "horizon": "Later", "theme": "string", "items": ["string", ...], "rationale": "string" }
],
"latestNews": [
  { "date": "YYYY-MM-DD", "competitor": "string", "headline": "string", "url": "string", "summary": "string" }
]
```

- `opportunities[]` (top-level, existing) stays populated and is kept identical to
  `swot.opportunities` for backward compatibility. The page renders the SWOT grid (which
  shows opportunities) and drops the standalone Opportunities box to avoid duplication.
- Per-competitor record shape is unchanged: `name, url, positioning, pricing, platforms[],
  openSource, local, strengths[], weaknesses[], recentNews[], vsHandy`.
- `latestNews` is a curated superset of the most notable per-competitor items, deduplicated,
  sorted newest-first. Items unconfirmable against a primary source are still allowed but
  any uncertain fact in a summary is marked `"unverified"`.

## Types + loader — `portal/src/lib/data.ts`

Add:

```ts
export type Swot = {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
};

export type RoadmapPhase = {
  horizon: string;     // "Now" | "Next" | "Later"
  theme: string;
  items: string[];
  rationale: string;
};

export type AggregatedNewsItem = {
  date: string;
  competitor: string;
  headline: string;
  url: string;
  summary: string;
};
```

Extend `Competition`:

```ts
export type Competition = {
  generatedAt: string | null;
  summary: string;
  competitors: Competitor[];
  opportunities: string[];
  swot: Swot;                       // NEW
  roadmap: RoadmapPhase[];          // NEW
  latestNews: AggregatedNewsItem[]; // NEW
};
```

Update `loadCompetition`'s empty fallback to include
`swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }`,
`roadmap: []`, `latestNews: []`. All new fields are arrays/objects so the page renders
nothing for them when absent (older JSON without these fields still loads — the loader
fallback only applies to a missing/blank file, so the page code must treat the fields as
possibly-undefined and default them).

> Robustness note: because a previously-generated `competition.json` may lack the new
> fields, the page must read them defensively (e.g. `data.swot ?? emptySwot`,
> `data.roadmap ?? []`, `data.latestNews ?? []`) rather than assuming presence.

## Page rendering — `portal/src/pages/Competition.tsx`

Section order (top to bottom):

1. **Summary** — unchanged (markdown).
2. **SWOT** (new) — 2×2 grid, responsive (2 cols desktop, 1 col mobile). Color-coded:
   Strengths green, Weaknesses red, Opportunities indigo, Threats amber. Each quadrant is a
   titled card with a bulleted list. Replaces the old standalone "Opportunities" box.
3. **Proposed roadmap** (new) — Now / Next / Later. Three columns on desktop, stacked on
   mobile. Each phase shows horizon label, theme, bulleted items, and a one-line rationale.
   A short caption clarifies this is a suggested strategy, not the maintainer's roadmap.
4. **At a glance** table — unchanged (Tool / Local / Open source / Pricing / Platforms).
5. **Per-competitor cards** — unchanged.
6. **Latest news** (new) — merged chronological feed. Each row: date · competitor tag ·
   linked headline · summary. Newest first.

Empty-state behaviour unchanged (`EmptyState` when no competitors and no summary). New
sections each guard on non-empty arrays so they disappear cleanly when data is absent.

## Data generation (research)

For all 12 competitors: WebSearch for recent (last ~3 months, prefer 2026) news, features,
pricing, platforms, and cloud-vs-local / open-source status; WebFetch a primary page
(site / pricing / changelog) to confirm key facts. Build/refresh each competitor record,
then synthesise:

- the Handy **SWOT** (strengths from being free/OSS/local/cross-platform; weaknesses from
  feature gaps vs paid rivals; opportunities from market gaps; threats from well-funded
  closed rivals, platform incumbents bundling dictation, and model commoditisation),
- the **roadmap** (Now/Next/Later, each item tied to a specific competitive gap),
- the **latestNews** feed (dedup + date-sort the most notable items).

Cite real URLs. Mark unverifiable facts `"unverified"`. Set `meta.json ->
lastUpdated.competition = now`.

## Command rewrite — `.claude/commands/h/competition.md`

Rewrite to specify the new output: the 12-competitor baseline (with Grammarly/Otter.ai
flagged adjacent), the new `swot`, `roadmap`, and `latestNews` top-level fields and their
shapes, the chronological-feed requirement, the Handy-focused SWOT/roadmap framing, the
Now/Next/Later horizons, and a note that the portal now renders these sections. Preserve the
`allowed-tools` (WebSearch, WebFetch, Read, Write) and the "cite real URLs / mark unverified"
rules. Document that `opportunities[]` mirrors `swot.opportunities`.

## Verification

After the type + page edits, run the portal build to confirm it compiles and the new types
are consistent:

```bash
cd portal && npx tsc --noEmit && npm run build
```

Then reload http://localhost:5273/ and confirm the SWOT grid, roadmap, and latest-news feed
render with real data, and that the empty state still works if `competition.json` is removed.

## Out of scope (YAGNI)

- No new "Strategy" page or route — the new sections live on the existing Competition page.
- No dated/quarterly roadmap, no per-competitor SWOT.
- No automated news fetching/scheduling — generation stays manual via the command.
- No changes to the other three portal sections or their commands.

## Files touched

- `portal/public/data/competition.json` (regenerated)
- `portal/public/data/meta.json` (timestamp bump)
- `portal/src/lib/data.ts` (types + loader fallback)
- `portal/src/pages/Competition.tsx` (3 new sections, drop standalone opportunities box)
- `.claude/commands/h/competition.md` (rewrite)
- `docs/superpowers/specs/2026-06-10-competition-page-v2-design.md` (this doc)
