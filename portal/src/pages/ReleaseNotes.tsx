import { useEffect, useState } from "react";
import {
  loadReleaseNotes,
  loadMeta,
  avatarUrl,
  emptyMeta,
  type Meta,
  type ReleaseNotes as RN,
} from "../lib/data";
import { formatDate } from "../lib/format";
import Markdown from "../components/Markdown";
import EmptyState from "../components/EmptyState";
import UpdatedBadge from "../components/UpdatedBadge";

const TYPE_STYLES: Record<string, string> = {
  feat: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  fix: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  docs: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  refactor: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  perf: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

const fallbackStyle =
  "bg-zinc-100 text-zinc-600 dark:bg-zinc-700/40 dark:text-zinc-300";

const medal = (i: number) =>
  i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

const TOP_BUILDERS = 10;

const fmt = (n: number) => n.toLocaleString();

export default function ReleaseNotes() {
  const [data, setData] = useState<RN | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [showAllBuilders, setShowAllBuilders] = useState(false);

  useEffect(() => {
    loadReleaseNotes().then(setData);
    loadMeta().then(setMeta);
  }, []);

  if (!data) return <p className="text-zinc-400">Loading…</p>;

  const empty = data.prs.length === 0 && !data.summary.trim();
  const builders = showAllBuilders
    ? data.leaderboard
    : data.leaderboard.slice(0, TOP_BUILDERS);

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Release Notes</h1>
          <p className="text-sm text-zinc-500">
            {data.range ? data.range.label : "Recent merged pull requests"}
            {data.range
              ? ` · ${formatDate(data.range.since)} to ${formatDate(data.range.until)}`
              : ""}
          </p>
        </div>
        <UpdatedBadge iso={meta.lastUpdated.releaseNotes} />
      </header>

      {empty ? (
        <EmptyState label="release notes" command="/h:release-notes" />
      ) : (
        <div className="space-y-8">
          {data.summary.trim() && (
            <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              <Markdown>{data.summary}</Markdown>
            </section>
          )}

          {data.leaderboard.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Builders ({data.leaderboard.length})
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {builders.map((b, i) => (
                  <a
                    key={b.login}
                    href={`https://github.com/${b.login}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 hover:border-indigo-400 dark:border-zinc-800"
                  >
                    <span className="w-6 text-center text-lg">{medal(i)}</span>
                    <img
                      src={avatarUrl(b.login)}
                      alt={b.login}
                      className="h-9 w-9 rounded-full bg-zinc-200"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {b.name || b.login}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {b.count} PR{b.count === 1 ? "" : "s"}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px]">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{fmt(b.additions)}
                        </span>{" "}
                        <span className="text-red-500 dark:text-red-400">
                          −{fmt(b.deletions)}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
              {data.leaderboard.length > TOP_BUILDERS && (
                <button
                  type="button"
                  onClick={() => setShowAllBuilders((v) => !v)}
                  className="mt-3 text-sm font-medium text-indigo-500 hover:text-indigo-400"
                >
                  {showAllBuilders
                    ? "Show top 10"
                    : `View all ${data.leaderboard.length} builders`}
                </button>
              )}
            </section>
          )}

          {data.prs.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Merged pull requests ({data.prs.length})
              </h2>
              <ul className="space-y-2">
                {data.prs.map((pr) => (
                  <li
                    key={pr.number}
                    className="rounded-xl border border-zinc-200 p-4 hover:border-indigo-400 dark:border-zinc-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                              TYPE_STYLES[pr.type] || fallbackStyle
                            }`}
                          >
                            {pr.type}
                          </span>
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium hover:text-indigo-500"
                          >
                            {pr.title}
                          </a>
                        </div>
                        {pr.description && (
                          <p className="mt-1 text-sm text-zinc-500">
                            {pr.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                          <img
                            src={avatarUrl(pr.author.login)}
                            alt={pr.author.login}
                            className="h-4 w-4 rounded-full"
                          />
                          <span>{pr.author.name || pr.author.login}</span>
                          <span>·</span>
                          <span>{formatDate(pr.mergedAt)}</span>
                        </div>
                      </div>
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-sm text-zinc-400 hover:text-indigo-500"
                      >
                        #{pr.number}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
