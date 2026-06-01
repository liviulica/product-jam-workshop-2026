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
  const [champion, ...rest] = builders;
  const championPct =
    champion && champion.additions + champion.deletions
      ? (champion.additions / (champion.additions + champion.deletions)) * 100
      : 0;

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
              {champion && (
                <a
                  href={`https://github.com/${champion.login}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative mb-3 flex flex-col gap-4 overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-amber-50/40 to-transparent p-5 transition hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/10 sm:flex-row sm:items-center sm:gap-5 dark:border-amber-500/30 dark:from-amber-500/[0.12] dark:via-amber-500/[0.04] dark:to-transparent"
                >
                  <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl transition group-hover:bg-amber-400/30 dark:bg-amber-500/10" />
                  <div className="relative shrink-0">
                    <img
                      src={avatarUrl(champion.login)}
                      alt={champion.login}
                      className="h-16 w-16 rounded-full bg-zinc-200 ring-2 ring-amber-400/80"
                    />
                    <span className="absolute -left-2.5 -top-3 text-2xl drop-shadow-sm">
                      👑
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      🥇 Top contributor
                    </div>
                    <div className="mt-0.5 truncate text-lg font-bold tracking-tight">
                      {champion.name || champion.login}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      @{champion.login} · {champion.count} PR
                      {champion.count === 1 ? "" : "s"} merged
                    </div>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <div className="font-mono text-sm font-medium">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{fmt(champion.additions)}
                      </span>{" "}
                      <span className="text-red-500 dark:text-red-400">
                        −{fmt(champion.deletions)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 sm:ml-auto sm:w-44 dark:bg-zinc-700">
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${championPct}%` }}
                      />
                      <div className="flex-1 bg-red-400" />
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {fmt(champion.additions + champion.deletions)} lines changed
                    </div>
                  </div>
                </a>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {rest.map((b, idx) => {
                  const i = idx + 1;
                  return (
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
                  );
                })}
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
