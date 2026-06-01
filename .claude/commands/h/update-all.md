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

After each step, confirm its JSON data file was written under portal/public/data/.
At the end, print a table of what was updated with the timestamps from
portal/public/data/meta.json, and remind me to run `cd portal && npm run dev` to view
the portal.
