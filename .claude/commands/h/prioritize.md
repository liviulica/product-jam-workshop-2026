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
4. Write prioritization.json with this shape and set meta.json -> lastUpdated.prioritization = now:
   {
     "generatedAt": ISO,
     "weights": { "comments": 0.3, "severity": 0.4, "priority": 0.3 },
     "issues": [{
       "number", "title", "url", "author",
       "createdAt": ISO, "updatedAt": ISO, "labels": [],
       "scores": { "comments", "severity", "priority", "total" },
       "rationale": "1 sentence why it ranks here",
       "recommendedAction": "what to do next",
       "signals": { "commentCount", "participants", "thumbsUp", "maintainerEngaged", "ageDays" }
     }]   // sorted by scores.total desc
   }

Scores are heuristic: be transparent and never fabricate signals not present in the data.
