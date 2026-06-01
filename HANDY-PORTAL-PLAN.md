# Handy Portal: Implementation Plan

## Context

We are building a **local portal for the open-source app Handy** (`github.com/cjpais/Handy`, a Tauri speech-to-text app cloned at `Handy/`). The portal gives the team four always-current views of the project:

1. **Release Notes** (default: last 7 days) from merged PRs, with a human summary, a linked PR list, and a builders leaderboard.
2. **Documentation** generated from the actual code.
3. **Prioritization** of open issues scored by comments, severity, and perceived priority.
4. **Competition** intelligence on rival speech-to-text tools.

Core design decision: **the `/h:` slash commands are data generators, the portal is a dumb renderer.** They never touch each other's code; they agree only on a JSON **data contract**. This keeps the Handy clone read-only, lets the portal run fully offline, and means re-running a command needs no rebuild (Vite serves `portal/public/data/` as static files).

## Decisions (resolved)

- **Scope**: all four sections. Release Notes + Prioritization are pure `gh` data; Docs reads `Handy/` source; Competition uses web search.
- **Stack**: Vite + React + TS + Tailwind v4, mirroring Handy's own known-good wiring.
- **Location**: everything under `product-jam/` root. `Handy/` stays pristine (read-only source + `gh` data).
- **Routing**: `HashRouter` (zero server config for a local tool, deep links work on refresh).
- **Data flow**: commands write JSON/Markdown into `portal/public/data/`; the React app fetches it at runtime. No rebuild on data refresh.

## Verified facts (from exploration)

- `gh` CLI is authenticated (`repo` scope) and reads `cjpais/Handy` PRs/issues live.
- Issue labels usable for severity: `critical`, `bug`, `enhancement`, `documentation`, `question`, `platform: windows|linux|macOS`, `good first issue`, `help wanted`, `code quality`, `wontfix`.
- Engagement signals: `comments` (array), `reactionGroups` (THUMBS_UP/HEART totals), `authorAssociation` (OWNER = maintainer engaged).
- PR titles follow conventional-commit prefixes (`feat`/`fix`/`docs`/`refactor`/`perf`/`chore`).
- Avatars: `https://github.com/{login}.png` (no API call).
- Slash-command format: `description` / `argument-hint` / `allowed-tools`, subfolder namespacing (`h/<name>.md` -> `/h:<name>`), `$ARGUMENTS`, `Bash(gh:*)` granular allow.

## Target file tree

```
product-jam/
  HANDY-PORTAL-PLAN.md             # this file
  HANDY-PORTAL-PROMPTS.md          # the saved prompts (reference)
  .claude/commands/h/              # the durable /h: prompts
    release-notes.md  docs.md  prioritize.md  competition.md  update-all.md
  portal/                          # Vite + React + TS + Tailwind v4
    package.json  vite.config.ts  tsconfig.json  tsconfig.node.json  index.html
    src/
      main.tsx  App.tsx  index.css
      lib/data.ts            # typed fetch helpers + data contract types
      lib/format.ts          # relative-time + date formatting
      components/  Layout, NavSidebar, UpdatedBadge, EmptyState, Markdown
      pages/  ReleaseNotes, Documentation, Prioritization, Competition
    public/data/                   # the data contract (seeded placeholders)
      meta.json  release-notes.json  prioritization.json  competition.json
      docs-index.json  docs/overview.md
```

## Step 1: Save the prompts and this plan to the project root

`HANDY-PORTAL-PLAN.md` (this file) and `HANDY-PORTAL-PROMPTS.md` (Prompt A + the five command bodies) live at the project root as reference docs.

## Step 2: Create the five `/h:` command files

Markdown files under `.claude/commands/h/` (full bodies in `HANDY-PORTAL-PROMPTS.md`):
`release-notes.md`, `docs.md`, `prioritize.md`, `competition.md`, `update-all.md`. Each uses `gh`/web tools, writes its JSON into `portal/public/data/`, and stamps `meta.json`.

## Step 3: Scaffold the portal

Vite + React + TS + Tailwind v4 in `portal/`, mirroring Handy's wiring (`@vitejs/plugin-react` + `@tailwindcss/vite`, `@import "tailwindcss"` in CSS, `tsconfig` jsx `react-jsx` / `moduleResolution` `bundler`). Extra deps: `react-router-dom`, `react-markdown`, `remark-gfm`. Four pages behind a left-nav `Layout` with a header showing per-section "updated X ago" badges. Pages read the contract via `src/lib/data.ts` and show empty states when data is missing.

## Data contract (`portal/public/data/`)

```
meta.json: { repo, lastUpdated:{ releaseNotes, docs, prioritization, competition } }  // ISO or null
release-notes.json: { generatedAt, range:{since,until,label}, summary,
  prs:[{ number,title,type,author:{login,name},mergedAt,url,description,labels[] }],
  leaderboard:[{ login,name,count,prNumbers[] }] }
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

## Step 4: Seed placeholder data

`portal/public/data/` placeholders matching the contract (empty arrays, `lastUpdated` null, stub `docs/overview.md`) so the app renders empty states before any command runs.

## Step 5: Verification (end to end)

1. `npm install` then `npm run build` in `portal/` with no errors.
2. `npm run dev`: all four pages load with friendly empty states (no crashes) against seeded data.
3. Run `/h:release-notes 30d` and `/h:prioritize`; confirm JSON written, reload, see real PRs + leaderboard and ranked issues.
4. Run `/h:docs` and `/h:competition`; confirm docs sections render and competitor cards show.
5. Run `/h:update-all`; confirm the summary table and fresh `meta.json` timestamps.

## Residual risks

- `/h:update-all` relies on the model executing the four sibling command files in sequence (no literal "call another command" primitive); written to inline the work.
- Competition depends on working `WebSearch`/`WebFetch`.
- Tailwind v4 needs no `tailwind.config.js`; tokens live in CSS `@theme`.
