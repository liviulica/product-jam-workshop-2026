import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import type { Issue } from "../lib/data";
import {
  backlogIssues,
  BOARD_STORAGE_KEY,
  clearBoard,
  loadBoard,
  moveCard,
  reconcileBoard,
  saveBoard,
  seedBoard,
  type BoardState,
  type ColumnId,
} from "../lib/board";

const COLUMNS: { id: ColumnId; title: string; dot: string; hint: string }[] = [
  {
    id: "backlog",
    title: "Backlog",
    dot: "bg-zinc-400",
    hint: "score order",
  },
  { id: "now", title: "Now", dot: "bg-emerald-500", hint: "do first" },
  { id: "next", title: "Next", dot: "bg-sky-500", hint: "queued up" },
  { id: "later", title: "Later", dot: "bg-zinc-500", hint: "someday" },
];

function Card({ issue, index }: { issue: Issue; index: number }) {
  return (
    <Draggable draggableId={String(issue.number)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`rounded-lg border bg-white p-3 dark:bg-zinc-900 ${
            snapshot.isDragging
              ? "border-indigo-400 shadow-lg dark:border-indigo-600"
              : "border-zinc-200 shadow-sm dark:border-zinc-800"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <a
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-400 hover:text-indigo-500"
            >
              #{issue.number}
            </a>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {issue.scores.total.toFixed(1)}
            </span>
          </div>
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block line-clamp-2 text-sm font-medium text-zinc-700 hover:text-indigo-500 dark:text-zinc-200"
          >
            {issue.title}
          </a>
          {issue.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {issue.labels.slice(0, 3).map((l) => (
                <span
                  key={l}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800"
                >
                  {l}
                </span>
              ))}
              {issue.labels.length > 3 && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                  +{issue.labels.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function PriorityBoard({ issues }: { issues: Issue[] }) {
  const [board, setBoard] = useState<BoardState>(() => {
    const saved = loadBoard();
    return saved ? reconcileBoard(saved, issues) : seedBoard(issues);
  });
  // Saves happen only on user actions (drag/reset), never on mere viewing —
  // a transient shrink of prioritization.json must not permanently erase placements.

  // Re-sync when another tab writes the board (last-write-wins on whole state).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BOARD_STORAGE_KEY) return;
      if (e.newValue === null) {
        clearBoard();
        setBoard(seedBoard(issues));
        return;
      }
      const saved = loadBoard();
      setBoard(saved ? reconcileBoard(saved, issues) : seedBoard(issues));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [issues]);

  // While a drag originates in Backlog, Backlog itself is not a drop target:
  // it is derived and score-sorted, so an in-column reorder could never stick.
  const [dragFromBacklog, setDragFromBacklog] = useState(false);

  const byNumber = useMemo(
    () => new Map(issues.map((i) => [i.number, i])),
    [issues],
  );

  const columnIssues = (id: ColumnId): Issue[] =>
    id === "backlog"
      ? backlogIssues(board, issues)
      : board[id]
          .map((n) => byNumber.get(n))
          .filter((i): i is Issue => i !== undefined);

  const onDragEnd = (result: DropResult) => {
    setDragFromBacklog(false);
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;
    const next = moveCard(
      board,
      Number(draggableId),
      source.droppableId as ColumnId,
      destination.droppableId as ColumnId,
      destination.index,
    );
    setBoard(next);
    saveBoard(next);
  };

  const reset = () => {
    if (!window.confirm("Reset the board to the default top-15 seeding?")) return;
    clearBoard();
    setBoard(seedBoard(issues));
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
        <span>
          Drag issues between columns — placements are saved in this browser.
          Backlog stays in score order.
        </span>
        <button
          onClick={reset}
          className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
        >
          Reset board
        </button>
      </div>
      <DragDropContext
        onDragStart={(start) =>
          setDragFromBacklog(start.source.droppableId === "backlog")
        }
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = columnIssues(col.id);
            return (
              <div
                key={col.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="flex items-center gap-2 px-3 pt-3">
                  <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                  <span className="text-sm font-semibold">{col.title}</span>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {items.length}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-400">
                    {col.hint}
                  </span>
                </div>
                <Droppable
                  droppableId={col.id}
                  isDropDisabled={col.id === "backlog" && dragFromBacklog}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex min-h-[80px] flex-col gap-2 p-3 transition-colors ${
                        snapshot.isDraggingOver
                          ? "rounded-b-xl bg-indigo-50 dark:bg-indigo-950/30"
                          : ""
                      }`}
                    >
                      {items.map((issue, index) => (
                        <Card key={issue.number} issue={issue} index={index} />
                      ))}
                      {provided.placeholder}
                      {items.length === 0 && !snapshot.isDraggingOver && (
                        <p className="py-4 text-center text-xs text-zinc-400">
                          Drop issues here
                        </p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
