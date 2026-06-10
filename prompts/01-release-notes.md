# 01 · Release notes — what changed, in plain English

Build `release-notes.html`: a human-readable summary of what changed in Handy
(github.com/cjpais/Handy) in the **last 60 days**, written for the app's **users** —
not developers.

**Get the data**

1. Fetch the merged PRs of the last 60 days (compute the date first):
   ```
   gh pr list --repo cjpais/Handy --state merged --limit 200 \
     --search "merged:>=YYYY-MM-DD" \
     --json number,title,author,mergedAt,url,body
   ```
   No `gh`, or `gh` asks you to log in? Use the public API instead (no auth needed):
   `https://api.github.com/search/issues?q=repo:cjpais/Handy+is:pr+is:merged+merged:>=YYYY-MM-DD&per_page=100`
   Field names differ in this fallback JSON: the author is `user.login`, the merge
   date is `pull_request.merged_at`, and the PR's web link is `html_url` (the
   top-level `url` is the API endpoint, not the page). On shared Wi-Fi the no-auth
   API allows ~10 search calls/minute for the whole room — on a 403, wait a minute
   and retry.
2. Only use PRs the command actually returns — **never invent any**. If the window is
   quiet, say so honestly on the page; a small week is a fine story too.

**Write the content**

3. Open with one friendly headline (how much shipped + the vibe of the period) and a
   2–3 sentence plain-language intro.
4. Group the changes into three sections:
   - **What's New** — features users can feel
   - **Fixes** — bugs we squashed
   - **Misc** — docs and everything else
   One plain-English sentence per change, about impact ("uses far less memory",
   "now available in Hebrew"). Read the PR title *and* body to understand what it
   really does — don't just echo titles. No jargon, no file names, no commit hashes,
   no PR numbers in the prose.
5. Close with a **Built by** leaderboard: contributors ranked by merged-PR count,
   each with avatar (`https://github.com/LOGIN.png?size=80`), name, and count.

**Build the page**

6. Write `release-notes.html` as a single self-contained file: all CSS inline, no
   frameworks, no build step. If `index.html` exists, match its style and keep a
   link back to it; otherwise pick one clean look (system fonts, one accent color,
   max-width ~900px) — the next prompts will follow it.
7. Below the prose, add a collapsible "All merged PRs" list (`<details>` works) with
   each PR's title, link, author, and date — so a curious reader can verify everything.

**Check**

8. Open the page in a browser. Headline, the three sections, and the leaderboard are
   all visible; no placeholder text; every PR in the list is real and linked. Report
   the PR count and the exact date range you covered.
