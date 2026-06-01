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
4. leaderboard: group by author.login; per builder set `count` (PRs), `additions`
   (sum of additions), `deletions` (sum of deletions), keep `name` and `prNumbers`.
   Sort by count desc.
5. summary: a friendly, NON-TECHNICAL narrative for a general audience (think a curious
   user or stakeholder, not a developer). Write nicely-formatted markdown:
   - Open with a one-line headline (e.g. how many improvements shipped and the vibe of
     the period), then a short plain-language paragraph.
   - Group the rest under clear, human headings (e.g. "What's new", "Things we fixed",
     "More languages", "Behind the scenes") using `###` and simple bullet points.
   - Explain impact in everyday terms ("uses far less memory", "stops a crash when…",
     "now available in Hebrew"). Avoid jargon, file names, function names, and inline
     PR-number references (#123) in the prose — the PR list below already carries those.
   - Close with a short "Who built it" line crediting the most active contributors.
   Keep it skimmable: short sentences, bold for emphasis, no walls of text.
6. Write release-notes.json with this shape and set meta.json -> lastUpdated.releaseNotes = now:
   {
     "generatedAt": ISO, "range": { "since": ISO, "until": ISO, "label": "Last 7 days" },
     "summary": "markdown",
     "prs": [{ "number", "title", "type", "author": { "login", "name" },
               "mergedAt": ISO, "url", "description", "labels": [] }],
     "leaderboard": [{ "login", "name", "count", "additions", "deletions", "prNumbers": [] }]
   }
   (The portal renders avatars from https://github.com/{login}.png, so just store login + name.
    The portal shows the top 10 builders with a "view all" expander, and each builder's
    +additions / -deletions, so include those totals for every builder.)

Only include PRs gh returns; never invent any. Report the count and date range when done.
