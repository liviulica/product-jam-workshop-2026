# 03 · Competition — know the field, find the gap

Build `competition.html`: one battle card per rival tool, plus the gaps Handy can own.
Position to defend: **Handy is free, open-source, fully local, and cross-platform**
speech-to-text (handy.computer · github.com/cjpais/Handy).

**Get the data**

1. First, confirm Handy's own capabilities from its site or repo README — every
   "vs Handy" sentence and Opportunities bullet must rest on what Handy actually
   does, not on guesses.
2. Research these rivals, plus 1–2 more you discover along the way (at least one
   discovery should be open-source or Linux-capable — those are Handy's closest
   substitutes): superwhisper, MacWhisper, Wispr Flow, Aqua Voice, and the built-in
   Apple Dictation / Windows Voice Typing.
3. Web-search each for current pricing, platforms, recent news, and whether it runs
   locally or in the cloud. Then open at least **one primary page** per rival (its
   site, pricing page, or changelog) to confirm the key facts.
4. Cite only URLs you actually opened — a fact backed by nothing but a search
   snippet counts as unverified. If a fact can't be verified (an exact price, a
   rumored feature), write **"unverified"** next to it — never guess silently.

**Write the content**

5. One **battle card** per rival:
   - name (linked) · platforms · pricing, dated and in a fixed format:
     "free tier? + cheapest paid plan" with currency and billing period
     (e.g. "Free tier + $15/mo", "€59 one-time", "Free")
   - two badges: **open source?** and **local or cloud?**
   - 2–3 strengths, 2–3 weaknesses
   - one **"vs Handy"** sentence: where Handy wins or loses against it
   - a **sources** line linking the page(s) the pricing and platform facts came from
6. A short **market summary** at the top — 3–4 sentences on the state of the field
   and where Handy sits.
7. End with **Opportunities**: 4–6 bullet gaps Handy can exploit (think privacy,
   price, Linux support, forkability, model choice).

**Build the page**

8. Write `competition.html` as a single self-contained file (inline CSS, no
   frameworks, no build step). Battle cards in a responsive grid; match the style of
   your existing pages if any; if `index.html` exists, include a link back to it.
9. Above the cards, add an **at a glance** table: tool · local · open source ·
   pricing · platforms (same pricing format as the cards).

**Check**

10. Open the page. Every card is complete; every fact is either backed by a source
    you opened or marked unverified. Report which rivals you covered.
