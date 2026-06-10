// Pure logic for the Prioritization Now/Next/Later board.
// Placements are stored in localStorage as ordered arrays of issue numbers;
// the Backlog column is derived (every issue not placed), so it always follows
// the score order of prioritization.json and never needs storing.

import type { Issue } from "./data";

export const BOARD_STORAGE_KEY = "handy-portal:prioritization-board:v1";
export const VIEW_STORAGE_KEY = "handy-portal:prioritization-view";

export const TRIAGE_COLUMNS = ["now", "next", "later"] as const;
export type TriageColumnId = (typeof TRIAGE_COLUMNS)[number];
export type ColumnId = TriageColumnId | "backlog";

export type BoardState = Record<TriageColumnId, number[]>;

const SEED_PER_COLUMN = 5;

export function seedBoard(issues: Issue[]): BoardState {
  // issues arrive sorted by total score desc (the prioritization.json order)
  const top = issues.map((i) => i.number);
  return {
    now: top.slice(0, SEED_PER_COLUMN),
    next: top.slice(SEED_PER_COLUMN, SEED_PER_COLUMN * 2),
    later: top.slice(SEED_PER_COLUMN * 2, SEED_PER_COLUMN * 3),
  };
}

function isValidState(value: unknown): value is BoardState {
  if (typeof value !== "object" || value === null) return false;
  return TRIAGE_COLUMNS.every((col) => {
    const arr = (value as Record<string, unknown>)[col];
    return Array.isArray(arr) && arr.every((n) => typeof n === "number");
  });
}

// Degraded path when localStorage is unavailable (private mode/quota): saves land
// here so the arrangement survives view toggles and route changes within the session.
// Reads prefer localStorage so a fresher write from another tab is never shadowed.
let memoryFallback: BoardState | null = null;

export function loadBoard(): BoardState | null {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    // fall through to memory
  }
  return memoryFallback;
}

export function saveBoard(state: BoardState): void {
  memoryFallback = state;
  try {
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // memoryFallback already holds the state for this session
  }
}

export function clearBoard(): void {
  memoryFallback = null;
  try {
    localStorage.removeItem(BOARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Drop placements whose issues no longer exist in the data, and dedupe a number
// that somehow appears in more than one column (first occurrence wins).
export function reconcileBoard(saved: BoardState, issues: Issue[]): BoardState {
  const present = new Set(issues.map((i) => i.number));
  const seen = new Set<number>();
  const clean = (col: number[]) =>
    col.filter((n) => {
      if (!present.has(n) || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  return { now: clean(saved.now), next: clean(saved.next), later: clean(saved.later) };
}

// Issues not placed in any triage column, in data (score) order.
export function backlogIssues(state: BoardState, issues: Issue[]): Issue[] {
  const placed = new Set<number>([...state.now, ...state.next, ...state.later]);
  return issues.filter((i) => !placed.has(i.number));
}

// Apply a drag result. Backlog is derived/score-sorted, so moves into it only
// remove the card from its triage column and the destination index is ignored.
export function moveCard(
  state: BoardState,
  issueNumber: number,
  source: ColumnId,
  destination: ColumnId,
  destinationIndex: number,
): BoardState {
  if (source === destination && source === "backlog") return state;

  const next: BoardState = {
    now: [...state.now],
    next: [...state.next],
    later: [...state.later],
  };

  if (source !== "backlog") {
    const col = next[source];
    const at = col.indexOf(issueNumber);
    if (at !== -1) col.splice(at, 1);
  }

  if (destination !== "backlog") {
    const col = next[destination];
    const at = Math.max(0, Math.min(destinationIndex, col.length));
    col.splice(at, 0, issueNumber);
  }

  return next;
}
