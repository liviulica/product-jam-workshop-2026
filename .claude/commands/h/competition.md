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
2. Per competitor build a record: positioning, pricing, platforms[], openSource (bool),
   local (bool), strengths[], weaknesses[], recentNews[{date,headline,url,summary}], vsHandy.
3. Write a market `summary` (markdown) and an `opportunities[]` list (gaps Handy can
   exploit: privacy, forkability, price, Linux support, model choice).
4. Write competition.json with this shape and set meta.json -> lastUpdated.competition = now:
   {
     "generatedAt": ISO,
     "summary": "markdown",
     "competitors": [{
       "name", "url", "positioning", "pricing", "platforms": [],
       "openSource": false, "local": false, "strengths": [], "weaknesses": [],
       "recentNews": [{ "date", "headline", "url", "summary" }],
       "vsHandy": "how Handy compares"
     }],
     "opportunities": []
   }

Cite real URLs. If a fact (e.g. exact price) cannot be verified, mark it "unverified".
