# Workshop prompts — build your own Handy portal

Teaching prompts for the **PM × Agent workshop** ("Build your tools"). In three
exercises you recreate the heart of this portal — release notes, prioritization,
and competition — as **three static HTML pages**, starting from a blank folder.

No backend, no database, no build step: every output is a single HTML file you can
open in a browser, drop in a folder, and host anywhere. You don't write the content —
you prompt the agent to.

## How to run

1. Start in an **empty folder** (a fresh `git init` repo is fine).
2. Paste each prompt into Claude Code, in order:

| # | Prompt | Output | Time |
|---|---|---|---|
| 0 | [00-init.md](00-init.md) *(optional)* | `index.html` hub + placeholder pages | 5 min |
| 1 | [01-release-notes.md](01-release-notes.md) | `release-notes.html` | 30 min |
| 2 | [02-prioritization.md](02-prioritization.md) | `prioritization.html` | 45 min |
| 3 | [03-competition.md](03-competition.md) | `competition.html` | 45 min |

Each prompt works on its own too — the order only matters for a consistent look.

## Prerequisites

- **[Claude Code](https://claude.com/claude-code)** (or any coding agent that can run shell commands and search the web).
- **[`gh`](https://cli.github.com/) authenticated** (`gh auth login`) — used by exercises 1 and 2.
  Each prompt includes a public-API fallback if `gh` is missing or not logged in
  (note: the no-auth API is rate-limited per IP, which a full room shares).
- **Web access** (search + fetch) — used by exercise 3.
- **No clone of Handy needed.** Everything reads the public GitHub repo and the open web.

## Make it yours

The structure carries over to any product: point exercise 1 and 2 at your own repo
and exercise 3 at your own competitors — only the inputs change. Then capture each
prompt as a slash command / skill so the pages regenerate on demand.

---

The prompts that built **this** repo's full portal (Vite + React app + `/h:` commands)
live in [original/](original/) for reference — same ideas, production-sized.
