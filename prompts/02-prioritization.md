# 02 · Prioritization — rank every open issue

Build `prioritization.html`: Handy's open GitHub issues, scored and ranked into one
list you'd actually defend in a roadmap meeting. Audience: **the team** — you and
the devs.

**Get the data**

1. Fetch the open issues — all of them:
   ```
   gh issue list --repo cjpais/Handy --state open --limit 200 \
     --json number,title,labels,author,comments,reactionGroups,createdAt,updatedAt,url \
     --jq '[.[] | {number, title, url, createdAt, updatedAt,
                   labels: [.labels[].name], author: .author.login,
                   commentCount: (.comments | length),
                   reactions: ([.reactionGroups[].users.totalCount] | add // 0)}]'
   ```
   (The `--jq` filter matters: the raw response includes every comment's full text —
   hundreds of KB you don't need. This trims it to just the signals you score on.)

   No `gh`, or `gh` asks you to log in? Use the public search API (no auth needed),
   which returns only issues — no pull requests to filter:
   `https://api.github.com/search/issues?q=repo:cjpais/Handy+is:issue+is:open&per_page=100`
   The issues are in the `items` array; if `total_count` is bigger than what you got,
   fetch `&page=2` too. Comment counts are in `comments`, reactions in
   `reactions.total_count`, web links in `html_url`.
2. Only score issues the command returns — **never invent issues, and never fabricate
   signals** (comment counts, reactions) that aren't in the data.

**Score them**

3. Give every issue a 0–10 score from three sub-scores:
   ```
   total = 0.4 × severity + 0.3 × engagement + 0.3 × momentum
   ```
   - **severity** — from labels and title keywords (crash / freeze / data loss high;
     enhancement / docs low)
   - **engagement** — comments + reactions, normalized across the set
   - **momentum** — recently-updated issues score higher than stale ones
   This formula is a starting point — swap in RICE, impact/effort, or your own
   weights if you prefer. Whatever you choose, **state the formula on the page**.
4. Write a one-sentence rationale per issue: why does it rank where it does?

**Build the page**

5. Write `prioritization.html` as a single self-contained file (inline CSS, no
   frameworks, no build step). Match the style of your existing pages if any; if
   `index.html` exists, include a link back to it.
6. At the top, show the scoring formula. Then the ranked list: rank, score, title
   (linked to GitHub), labels, the rationale, and the raw signals (comments,
   reactions, age in days).
7. **Now / Next / Later.** After the list, add a three-column board: **Now** = top 5,
   **Next** = ranks 6–10, **Later** = ranks 11–15. Compact cards: rank, `#number`,
   title.

**Check**

8. Open the page. The formula is visible, the list is sorted by score, the board
   shows 5 / 5 / 5. Report how many issues you scored.
