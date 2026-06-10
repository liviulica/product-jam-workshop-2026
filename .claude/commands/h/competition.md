---
description: Refresh competitive intelligence on speech-to-text rivals for the portal
argument-hint: "[focus]  optional competitor or angle (default full sweep)"
allowed-tools: WebSearch, WebFetch, Read, Write
---
Regenerate portal/public/data/competition.json.
Handy = free, open-source, fully-local, cross-platform dictation (Whisper/Parakeet),
positioned as the most forkable speech-to-text tool.

The portal's Competition page renders, in this order: the market `summary`, a Handy
`swot` 2x2 grid, the proposed `roadmap` (Now/Next/Later), an "At a glance" table, the
per-competitor cards, and the aggregated `latestNews` feed. Populate every field below so
each section renders.

## Competitors to cover (baseline 12, plus any you discover)

superwhisper, MacWhisper, Wispr Flow, Aqua Voice, Talon Voice, VoiceInk (open-source local
rival), Willow Voice, Eloquent (Google's free offline iOS app), Otter.ai (adjacent —
meetings), Grammarly (adjacent — writing assistant with bundled voice), and built-in Apple
Dictation and Windows Voice Typing. Flag Otter.ai and Grammarly as adjacent in their
positioning. Add genuinely relevant newcomers you find; don't drop existing ones without a
reason (e.g. discontinued).

## Steps

1. WebSearch each rival for recent (last ~3 months, prefer 2026) news, new features,
   pricing, platforms, and cloud-vs-local / open-source status. WebFetch a primary page
   (site / pricing / changelog) to confirm key facts.
2. Per competitor build a record: positioning, pricing, platforms[], openSource (bool),
   local (bool), strengths[], weaknesses[], recentNews[{date,headline,url,summary}], vsHandy.
3. Write a market `summary` (markdown) covering the state of the field and Handy's position.
4. Build the Handy-focused `swot`: strengths[], weaknesses[], opportunities[], threats[].
   - Keep `opportunities[]` (top-level) identical to `swot.opportunities` for back-compat.
   - Opportunities = gaps Handy can exploit (privacy, forkability, price, Linux, model choice).
   - Threats = well-funded closed rivals, platform incumbents bundling dictation, free+local
     newcomers (e.g. Eloquent), other OSS local apps, model commoditisation, bus-factor.
5. Build a proposed `roadmap`: an array of phases with horizon "Now" / "Next" / "Later".
   Each phase: { horizon, theme, items[], rationale }. Frame it as a SUGGESTED strategy to
   defend Handy's edge, tied to specific competitive gaps — NOT the maintainer's committed
   plan. Use Now/Next/Later, not dated quarters. Ground "Now" in the open-issue priorities.
6. Build `latestNews`: a single chronological feed (newest first, ~10-15 items, last ~3
   months) of the most notable items across ALL competitors, deduplicated. Each item:
   { date, competitor, headline, url, summary }. This is a curated cross-competitor superset,
   distinct from each competitor's own recentNews.
7. Write competition.json with the shape below and set meta.json -> lastUpdated.competition = now.

## Shape

```
{
  "generatedAt": ISO,
  "summary": "markdown",
  "competitors": [{
    "name", "url", "positioning", "pricing", "platforms": [],
    "openSource": false, "local": false, "strengths": [], "weaknesses": [],
    "recentNews": [{ "date", "headline", "url", "summary" }],
    "vsHandy": "how Handy compares"
  }],
  "opportunities": [],                       // mirror of swot.opportunities
  "swot": {
    "strengths": [], "weaknesses": [], "opportunities": [], "threats": []
  },
  "roadmap": [
    { "horizon": "Now", "theme": "...", "items": [], "rationale": "..." },
    { "horizon": "Next", "theme": "...", "items": [], "rationale": "..." },
    { "horizon": "Later", "theme": "...", "items": [], "rationale": "..." }
  ],
  "latestNews": [
    { "date": "YYYY-MM-DD", "competitor": "...", "headline": "...", "url": "...", "summary": "..." }
  ]
}
```

Cite real URLs. If a fact (e.g. exact price) cannot be verified, mark it "unverified".
Month-only dates ("2026-03") are acceptable when a precise day isn't known. If $ARGUMENTS
names a single competitor or angle, focus the refresh there but keep the rest of the file
intact and consistent.
