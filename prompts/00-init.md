# 00 · Init — portal hub (optional)

Create the skeleton of a tiny "Handy Portal" that the next three prompts will fill in.
Handy (github.com/cjpais/Handy) is a free, open-source, fully local speech-to-text app.

**Build**

1. In the current folder, create `index.html` — one self-contained page (all CSS inline,
   no frameworks, no build step, no external assets) titled **Handy Portal**:
   - Subtitle: "Release notes, priorities, and competitive intel — researched and written by an agent."
   - Three link cards, each with a one-line description:
     - **Release Notes** → `release-notes.html` — what changed, in plain English
     - **Prioritization** → `prioritization.html` — every open issue, scored and ranked
     - **Competition** → `competition.html` — the field, mapped; the gap, found
2. For each of `release-notes.html`, `prioritization.html`, and `competition.html`
   that does **not already exist**, create a placeholder in the same style: the page
   title, a "Not generated yet — run prompt 01 / 02 / 03" note, and a link back to
   `index.html`. Never overwrite an existing page.
3. Style: clean and modern. System font stack, one accent color, max-width ~900px
   centered, generous spacing. Looks good without any JavaScript.

**Check**

4. Open `index.html` in a browser. All three cards link to their page, and every
   placeholder links back home. No content is invented anywhere — placeholders stay
   empty until their prompt runs, and pages that already have real content are left
   untouched.
