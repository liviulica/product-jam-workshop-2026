# Prioritization board (Now / Next / Later) — design

**Date:** 2026-06-10
**Status:** Approved (user said "build")
**Author:** Claude (brainstormed with liviu)

## Goal

Add a kanban board to the portal's Prioritization page: 4 columns (Backlog, Now, Next,
Later), drag & drop via a kanban library, placements persisted in localStorage. Pure
client-side layer over the existing `prioritization.json` — no data-contract or command
changes.

## Decisions (locked during brainstorming)

1. **4 columns** — Backlog + Now/Next/Later. First visit auto-seeds by score:
   top 5 → Now, ranks 6–10 → Next, ranks 11–15 → Later, rest → Backlog.
2. **Placement** — `List | Board` segmented toggle at the top of the Prioritization page.
   Default List; choice persisted.
3. **Library** — `@hello-pangea/dnd` (maintained react-beautiful-dnd successor).
4. **Refresh reconciliation** — auto-sync: vanished issues silently drop from columns,
   new issues land in Backlog. Placements keyed by issue number survive refreshes.

## Behavior

- Now/Next/Later keep user-defined order (persisted). Backlog is always score-sorted;
  dropping a card there un-triages it back into score order (drop index ignored).
- Drag works within and across all 4 columns.
- "Reset board" button clears saved state and re-seeds 5/5/5.
- Cards: total-score chip, `#number` + title linked to GitHub, labels. Column headers show
  name, count, color (Now emerald / Next sky / Later zinc — matches Competition roadmap).
- List view and its filters are untouched; filters do not apply to the board.
- localStorage keys: `handy-portal:prioritization-view` (`"list" | "board"`),
  `handy-portal:prioritization-board:v1` (`{ now: number[], next: number[], later: number[] }`).

## Components

- `portal/src/lib/board.ts` (new) — `BoardState`, `loadBoard`/`saveBoard`,
  `seedBoard(issues)`, `reconcileBoard(saved, issues)`, `moveCard(state, src, dst)`.
  Pure functions, no React.
- `portal/src/components/PriorityBoard.tsx` (new) — `DragDropContext` + 4 `Droppable`
  columns of `Draggable` cards. Owns board state; calls lib functions; persists on change.
  `draggableId` = `String(issue.number)`.
- `portal/src/pages/Prioritization.tsx` (edited) — view toggle; renders existing list or
  `<PriorityBoard issues={data.issues} />`.

## Verification

`tsc --noEmit` + `vite build`; drive the board in the dev server. Adversarial review pass
over the diff (dnd wiring, localStorage edge cases, hook correctness) before done.

## Out of scope (YAGNI)

No backend sync, no export, no WIP limits, no score editing on the board, no extra mobile
drag polish.
