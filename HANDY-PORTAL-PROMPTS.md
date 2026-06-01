# Handy Portal: Prompts

This file collects every prompt used to build and run the Handy portal, so they can be reviewed or re-used.

- **Prompt A** builds the portal one time.
- **Prompts B1 to B5** are the durable `/h:` slash-command files (saved under `.claude/commands/h/`).

How to use: paste Prompt A once into a Claude Code session started in `product-jam/`; save B1 to B5 as `.claude/commands/h/<name>.md`; then run `/h:update-all` and `cd portal && npm run dev`.

The four sections share one **data contract** (the JSON files the commands write and the portal reads):

```
meta.json: { repo, lastUpdated:{ releaseNotes, docs, prioritization, competition } }  // ISO or null
release-notes.json: { generatedAt, range:{since,until,label}, summary,
  prs:[{ number,title,type,author:{login,name},mergedAt,url,description,labels[] }],
  leaderboard:[{ login,name,count,additions,deletions,prNumbers[] }] }   // avatar = https://github.com/{login}.png
docs-index.json: { generatedAt, sections:[{ id,title,file,category,order }] }
docs/<id>.md: markdown
prioritization.json: { generatedAt, weights:{comments,severity,priority},
  issues:[{ number,title,url,author,createdAt,updatedAt,labels[],
    scores:{comments,severity,priority,total}, rationale, recommendedAction,
    signals:{commentCount,participants,thumbsUp,maintainerEngaged,ageDays} }] }  // sorted by scores.total desc
competition.json: { generatedAt, summary,
  competitors:[{ name,url,positioning,pricing,platforms[],openSource,local,
    strengths[],weaknesses[],recentNews:[{date,headline,url,summary}],vsHandy }],
  opportunities[] }
```

---

## Prompt A: build the portal (run once in product-jam/)

```text
You are building a LOCAL web portal for the open-source app "Handy"
(github.com/cjpais/Handy, a Tauri speech-to-text app). Work ONLY inside
/Users/liviu/Coding/product-jam. Do NOT modify anything under Handy/ (treat it as
read-only source).

Create a Vite + React + TypeScript + Tailwind v4 app in product-jam/portal/ that
renders four sections from generated JSON. The /h: slash commands regenerate that
JSON; the portal ONLY reads it.

Stack (mirror Handy's known-good wiring):
- vite.config.ts: plugins [react(), tailwindcss()] using @vitejs/plugin-react and
  @tailwindcss/vite.
- src/index.css starts with: @import "tailwindcss";   (Tailwind v4, no PostCSS).
- tsconfig: jsx react-jsx, module ESNext, moduleResolution bundler, strict, noEmit.
- index.html: <div id="root"></div> + <script type="module" src="/src/main.tsx">.
- Extra deps: react-router-dom (HashRouter), react-markdown, remark-gfm.
- Scripts: dev (primary), build, preview.

Data access: src/lib/data.ts exposes typed loaders that
fetch(`${import.meta.env.BASE_URL}data/<file>.json`). Missing or empty files resolve
to a typed empty value so pages show an empty state instead of crashing.

Data contract: portal/public/data/
  meta.json: { repo, lastUpdated:{ releaseNotes, docs, prioritization, competition } }
  release-notes.json: { generatedAt, range:{since,until,label}, summary,
    prs:[{ number,title,type,author:{login,name},mergedAt,url,description,labels[] }],
    leaderboard:[{ login,name,count,additions,deletions,prNumbers[] }] }   // avatar = https://github.com/{login}.png
  docs-index.json: { generatedAt, sections:[{ id,title,file,category,order }] }
  docs/<id>.md: markdown
  prioritization.json: { generatedAt, weights:{comments,severity,priority},
    issues:[{ number,title,url,author,createdAt,updatedAt,labels[],
      scores:{comments,severity,priority,total}, rationale, recommendedAction,
      signals:{commentCount,participants,thumbsUp,maintainerEngaged,ageDays} }] }
  competition.json: { generatedAt, summary,
    competitors:[{ name,url,positioning,pricing,platforms[],openSource,local,
      strengths[],weaknesses[],recentNews:[{date,headline,url,summary}],vsHandy }],
    opportunities[] }

Pages (left-nav Layout; header "Handy Portal" + per-section "updated X ago" badge from meta.json):
1. Release Notes (route /): range label, summary markdown, PR rows (type badge, #number
   link to url, date, author + avatar, description), Builders leaderboard (avatars,
   counts, medals for top 3).
2. Documentation (/docs): sub-nav grouped by category from docs-index.json; main pane
   renders the selected docs/<file>.md via react-markdown + remark-gfm.
3. Prioritization (/issues): ranked list; total score, three mini score bars
   (comments/severity/priority), labels, signals, rationale, recommendedAction, issue
   link; filters by label and min total score.
4. Competition (/competition): summary markdown, competitor cards, comparison table
   (local? open-source? price, platforms), opportunities list.

Robustness: empty states when data missing; nice date + relative-time formatting; clean,
modern, dark-mode-friendly UI.

Seed: create portal/public/data/ placeholders matching the contract (empty arrays,
lastUpdated all null, a stub docs/overview.md) so the app renders before any command runs.

When done: npm install, confirm npm run build passes, then run cd portal && npm run dev.
```

---

## Prompt B1: .claude/commands/h/release-notes.md

```markdown
---
description: Update the portal's release notes from merged Handy PRs (default last 7 days)
argument-hint: "[since]  e.g. 7d | 30d | 2026-05-01  (default 7d)"
allowed-tools: Bash(gh:*), Bash(date:*), Read, Write
---
Regenerate portal/public/data/release-notes.json for the Handy repo (cjpais/Handy).

1. Resolve the window from $ARGUMENTS: empty or "7d" => 7 days ago; "Nd" => N days ago;
   an ISO date => that date. Compute `since` (YYYY-MM-DD) and `until` = now.
2. Fetch merged PRs in window:
   gh pr list --repo cjpais/Handy --state merged --limit 200 \
     --search "merged:>=<since>" \
     --json number,title,author,mergedAt,url,body,labels,additions,deletions
3. Per PR: set `type` from the conventional-commit prefix in the title
   (feat, fix, docs, refactor, perf, chore, test, ci, build, style; else "other").
   Write a 1 to 2 sentence plain-English `description` of what it actually does
   (read title + body, do not just echo the title).
4. leaderboard: group by author.login; per builder set count (PRs), additions and
   deletions (summed line counts), name and prNumbers. Sort count desc.
5. summary: a friendly, NON-TECHNICAL narrative for a general audience (not developers).
   Nicely-formatted markdown: a one-line headline + short intro, then human-titled
   sections (### What's new / Things we fixed / More languages / Behind the scenes) with
   simple bullets describing impact in everyday terms. Avoid jargon, file/function names,
   and inline #PR references in the prose. End with a short "Who built it" credit line.
6. Write release-notes.json (schema in the portal data contract) and set
   meta.json -> lastUpdated.releaseNotes = now.

Only include PRs gh returns; never invent any. Report the count and date range when done.
```

---

## Prompt B2: .claude/commands/h/docs.md

```markdown
---
description: Analyze Handy's source and regenerate the code documentation for the portal
argument-hint: "[area]  optional focus: frontend | backend | audio  (default all)"
allowed-tools: Bash(find:*), Bash(ls:*), Read, Glob, Grep, Write
---
Regenerate portal/public/data/docs/*.md and docs-index.json from the REAL code in Handy/.
Ground every claim in actual files (inspect them, do not guess). Cite source files with
relative paths (e.g. Handy/src-tauri/src/transcription_coordinator.rs).

Map first:
- Frontend: Handy/src (React/TS): zustand stores in src/stores (settingsStore, modelStore),
  components (settings, onboarding, overlay, model-selector), hooks, i18n, src/overlay.
  Frontend talks to Rust via Tauri commands (src/bindings.ts).
- Backend: Handy/src-tauri/src (Rust): lib.rs (app setup, manager + plugin registration),
  managers/ (audio, model, transcription, history), commands/ (Tauri IPC),
  audio_toolkit/ (recorder, resampler, vad/silero.rs Silero VAD), transcription_coordinator.rs,
  actions.rs (record->VAD->transcribe->paste pipeline), settings.rs, llm_client.rs,
  clipboard.rs, input.rs, overlay.rs, shortcut/, apple_intelligence.rs, portable.rs, cli.rs.
- Core libs (from Cargo + README Architecture): whisper-rs, transcribe-rs (Parakeet),
  cpal, vad-rs/Silero, rdev, rubato.
- Also read AGENTS.md, README.md (Architecture), BUILD.md, src-tauri/tauri.conf.json,
  and .github/workflows/ for CI.

Produce these markdown sections (skip none unless $ARGUMENTS narrows the area):
- overview.md: what Handy is + architecture (React frontend and Rust backend via Tauri),
  and the control flow shortcut -> record -> VAD -> transcribe -> post-process -> paste.
- frontend.md: structure, zustand state, settings UI, overlay, i18n, Tauri command bridge.
- backend.md: Rust module map, managers, Tauri commands, transcription coordinator, actions.
- audio-pipeline.md: recording (cpal), Silero VAD, Whisper/Parakeet engines, GPU accel, resampling.
- settings-and-storage.md: settings.rs AppSettings, tauri-plugin-store persistence, portable mode.
- shortcuts-and-input.md: global shortcut (shortcut/), push-to-talk vs toggle, clipboard + input paste.
- post-processing.md: llm_client.rs providers (OpenAI/Claude/custom/Apple Intelligence), prompts.
- build-and-release.md: bun/vite/tauri, CI workflows, nix.
- contributing.md: how to extend/fork (from CONTRIBUTING.md + AGENTS.md).

Write docs-index.json listing each section { id, title, file, category, order }, then set
meta.json -> lastUpdated.docs = now. Keep docs-index.json consistent on partial runs.
```

---

## Prompt B3: .claude/commands/h/prioritize.md

```markdown
---
description: Score and rank open Handy issues for the portal (comments, severity, priority)
argument-hint: "[limit]  max issues to score (default 60)"
allowed-tools: Bash(gh:*), Read, Write
---
Regenerate portal/public/data/prioritization.json for cjpais/Handy.

1. Fetch open issues (issue list excludes PRs automatically):
   gh issue list --repo cjpais/Handy --state open --limit <limit|60> \
     --json number,title,body,author,labels,comments,reactionGroups,createdAt,updatedAt,url
2. Compute three 0 to 10 sub-scores per issue:
   - comments: engagement from comment count + distinct participants; count maintainer/OWNER
     replies (authorAssociation) as a strong signal. Normalize across the set.
   - severity: from labels + text. critical=10; bug~7 baseline; raise for
     crash/freeze/data-loss/build-break/regression keywords; platform labels add a little;
     enhancement/question/docs score lower.
   - priority (perceived): reactions (reactionGroups THUMBS_UP/HEART totals), recency
     (updatedAt), age, maintainer interest, good-first-issue / help-wanted.
3. total = 0.3*comments + 0.4*severity + 0.3*priority (1 decimal). Sort desc.
4. Per issue: a 1-sentence `rationale`, a `recommendedAction`, and raw `signals`
   (commentCount, participants, thumbsUp, maintainerEngaged, ageDays).
5. Write prioritization.json (include the `weights` used) and set
   meta.json -> lastUpdated.prioritization = now.

Scores are heuristic: be transparent and never fabricate signals not present in the data.
```

---

## Prompt B4: .claude/commands/h/competition.md

```markdown
---
description: Refresh competitive intelligence on speech-to-text rivals for the portal
argument-hint: "[focus]  optional competitor or angle (default full sweep)"
allowed-tools: WebSearch, WebFetch, Read, Write
---
Regenerate portal/public/data/competition.json.
Handy = free, open-source, fully-local, cross-platform dictation (Whisper/Parakeet),
positioned as the most forkable speech-to-text tool.

Cover these rivals (plus any you discover): superwhisper, MacWhisper, Wispr Flow,
Aqua Voice, Talon Voice, Otter.ai (adjacent), and built-in Apple/Windows dictation.

1. WebSearch each for recent (last ~3 months, prefer 2026) news, new features, pricing,
   platforms, and cloud-vs-local / open-source status. WebFetch a primary page
   (site / pricing / changelog) to confirm key facts.
2. Per competitor build: positioning, pricing, platforms[], openSource, local,
   strengths[], weaknesses[], recentNews[{date,headline,url,summary}], vsHandy.
3. Write a market `summary` (markdown) and an `opportunities[]` list (gaps Handy can
   exploit: privacy, forkability, price, Linux support, model choice).
4. Write competition.json (schema in the contract) and set
   meta.json -> lastUpdated.competition = now.

Cite real URLs. If a fact (e.g. exact price) cannot be verified, mark it "unverified".
```

---

## Prompt B5: .claude/commands/h/update-all.md

```markdown
---
description: Run all portal updates (release notes, docs, prioritization, competition)
allowed-tools: Bash(gh:*), Bash(date:*), Bash(find:*), Bash(ls:*), Read, Write, Glob, Grep, WebSearch, WebFetch
---
Run a full portal refresh by carrying out, in order, the work defined in each of these
command files (read them if needed): .claude/commands/h/release-notes.md, docs.md,
prioritize.md, competition.md.

Sequence:
1. release-notes (last 7 days)
2. docs (all sections)
3. prioritize
4. competition

After each step, confirm its JSON data file was written. At the end, print a table of
what was updated with the timestamps from meta.json, and remind me to run
`cd portal && npm run dev` to view the portal.
```
