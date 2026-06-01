import { useEffect, useMemo, useState } from "react";
import {
  loadPrioritization,
  loadMeta,
  emptyMeta,
  type Prioritization as P,
  type Meta,
} from "../lib/data";
import { formatDate } from "../lib/format";
import EmptyState from "../components/EmptyState";
import UpdatedBadge from "../components/UpdatedBadge";

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-[11px] tabular-nums text-zinc-500">
        {value.toFixed(0)}
      </span>
    </div>
  );
}

export default function Prioritization() {
  const [data, setData] = useState<P | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [labelFilter, setLabelFilter] = useState("");
  const [minScore, setMinScore] = useState(0);

  useEffect(() => {
    loadPrioritization().then(setData);
    loadMeta().then(setMeta);
  }, []);

  const allLabels = useMemo(() => {
    const set = new Set<string>();
    (data?.issues || []).forEach((i) => i.labels.forEach((l) => set.add(l)));
    return Array.from(set).sort();
  }, [data]);

  const issues = useMemo(() => {
    return (data?.issues || [])
      .filter((i) => (labelFilter ? i.labels.includes(labelFilter) : true))
      .filter((i) => i.scores.total >= minScore);
  }, [data, labelFilter, minScore]);

  if (!data) return <p className="text-zinc-400">Loading…</p>;

  const empty = data.issues.length === 0;

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prioritization</h1>
          <p className="text-sm text-zinc-500">
            Open issues scored by comments, severity, and perceived priority
          </p>
        </div>
        <UpdatedBadge iso={meta.lastUpdated.prioritization} />
      </header>

      {empty ? (
        <EmptyState label="prioritized issues" command="/h:prioritize" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
            >
              <option value="">All labels</option>
              {allLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-zinc-500">
              Min score:
              <span className="w-6 text-right tabular-nums">{minScore}</span>
              <input
                type="range"
                min={0}
                max={10}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
              />
            </label>
            <span className="text-zinc-400">{issues.length} shown</span>
            <span className="ml-auto text-xs text-zinc-400">
              weights: comments {data.weights.comments} · severity{" "}
              {data.weights.severity} · priority {data.weights.priority}
            </span>
          </div>

          <ol className="space-y-3">
            {issues.map((issue, idx) => (
              <li
                key={issue.number}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex gap-4">
                  <div className="flex w-12 shrink-0 flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums">
                      {issue.scores.total.toFixed(1)}
                    </span>
                    <span className="text-[10px] uppercase text-zinc-400">
                      rank {idx + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:text-indigo-500"
                    >
                      {issue.title}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-indigo-500"
                      >
                        #{issue.number}
                      </a>
                      <span>·</span>
                      <span>{issue.author}</span>
                      <span>·</span>
                      <span>opened {formatDate(issue.createdAt)}</span>
                      {issue.labels.map((l) => (
                        <span
                          key={l}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-1.5 sm:max-w-md">
                      <ScoreBar
                        label="comments"
                        value={issue.scores.comments}
                        color="bg-sky-500"
                      />
                      <ScoreBar
                        label="severity"
                        value={issue.scores.severity}
                        color="bg-red-500"
                      />
                      <ScoreBar
                        label="priority"
                        value={issue.scores.priority}
                        color="bg-amber-500"
                      />
                    </div>
                    {issue.rationale && (
                      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                        {issue.rationale}
                      </p>
                    )}
                    {issue.recommendedAction && (
                      <p className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
                        → {issue.recommendedAction}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                      <span>{issue.signals.commentCount} comments</span>
                      <span>{issue.signals.participants} participants</span>
                      <span>{issue.signals.thumbsUp} 👍</span>
                      {issue.signals.maintainerEngaged && (
                        <span className="text-emerald-500">maintainer engaged</span>
                      )}
                      <span>{issue.signals.ageDays}d old</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
