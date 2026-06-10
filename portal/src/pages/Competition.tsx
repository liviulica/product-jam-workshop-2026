import { useEffect, useState } from "react";
import {
  loadCompetition,
  loadMeta,
  emptyMeta,
  emptySwot,
  type Competition as C,
  type Meta,
} from "../lib/data";
import Markdown from "../components/Markdown";
import EmptyState from "../components/EmptyState";
import UpdatedBadge from "../components/UpdatedBadge";

const yn = (b: boolean) => (b ? "Yes" : "No");

// SWOT quadrant styling, keyed by quadrant.
const swotStyles = {
  strengths: {
    title: "Strengths",
    box: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20",
    label: "text-emerald-700 dark:text-emerald-300",
  },
  weaknesses: {
    title: "Weaknesses",
    box: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20",
    label: "text-red-700 dark:text-red-300",
  },
  opportunities: {
    title: "Opportunities",
    box: "border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20",
    label: "text-indigo-700 dark:text-indigo-300",
  },
  threats: {
    title: "Threats",
    box: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
    label: "text-amber-700 dark:text-amber-300",
  },
} as const;

const horizonStyles: Record<string, string> = {
  Now: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Next: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  Later: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700/40 dark:text-zinc-300",
};

export default function Competition() {
  const [data, setData] = useState<C | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);

  useEffect(() => {
    loadCompetition().then(setData);
    loadMeta().then(setMeta);
  }, []);

  if (!data) return <p className="text-zinc-400">Loading…</p>;

  const empty = data.competitors.length === 0 && !data.summary.trim();

  // v2 fields may be absent in an older competition.json — default defensively.
  const swot = data.swot ?? emptySwot;
  const roadmap = data.roadmap ?? [];
  const latestNews = data.latestNews ?? [];
  const hasSwot =
    swot.strengths.length > 0 ||
    swot.weaknesses.length > 0 ||
    swot.opportunities.length > 0 ||
    swot.threats.length > 0;

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Competition</h1>
          <p className="text-sm text-zinc-500">
            How Handy compares to other speech-to-text tools
          </p>
        </div>
        <UpdatedBadge iso={meta.lastUpdated.competition} />
      </header>

      {empty ? (
        <EmptyState label="competitive intel" command="/h:competition" />
      ) : (
        <div className="space-y-8">
          {data.summary.trim() && (
            <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              <Markdown>{data.summary}</Markdown>
            </section>
          )}

          {hasSwot && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                SWOT — Handy
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {(["strengths", "weaknesses", "opportunities", "threats"] as const).map(
                  (key) =>
                    swot[key].length > 0 && (
                      <div
                        key={key}
                        className={`rounded-xl border p-5 ${swotStyles[key].box}`}
                      >
                        <div
                          className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${swotStyles[key].label}`}
                        >
                          {swotStyles[key].title}
                        </div>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                          {swot[key].map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                )}
              </div>
            </section>
          )}

          {roadmap.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Proposed roadmap
              </h2>
              <p className="mb-3 text-xs text-zinc-400">
                A suggested strategy to defend Handy's edge, grounded in the gaps
                above — not the maintainer's committed plan.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {roadmap.map((phase, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          horizonStyles[phase.horizon] ??
                          "bg-zinc-200 text-zinc-600 dark:bg-zinc-700/40 dark:text-zinc-300"
                        }`}
                      >
                        {phase.horizon}
                      </span>
                      <span className="text-sm font-semibold">{phase.theme}</span>
                    </div>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                      {phase.items.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                    {phase.rationale && (
                      <p className="mt-3 text-xs italic text-zinc-400">
                        {phase.rationale}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.competitors.length > 0 && (
            <section className="overflow-x-auto">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                At a glance
              </h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-zinc-400">
                    <th className="border-b border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      Tool
                    </th>
                    <th className="border-b border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      Local
                    </th>
                    <th className="border-b border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      Open source
                    </th>
                    <th className="border-b border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      Pricing
                    </th>
                    <th className="border-b border-zinc-200 py-2 dark:border-zinc-800">
                      Platforms
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.competitors.map((c) => (
                    <tr key={c.name}>
                      <td className="border-b border-zinc-100 py-2 pr-4 font-medium dark:border-zinc-900">
                        {c.name}
                      </td>
                      <td className="border-b border-zinc-100 py-2 pr-4 dark:border-zinc-900">
                        {yn(c.local)}
                      </td>
                      <td className="border-b border-zinc-100 py-2 pr-4 dark:border-zinc-900">
                        {yn(c.openSource)}
                      </td>
                      <td className="border-b border-zinc-100 py-2 pr-4 dark:border-zinc-900">
                        {c.pricing}
                      </td>
                      <td className="border-b border-zinc-100 py-2 dark:border-zinc-900">
                        {c.platforms.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            {data.competitors.map((c) => (
              <div
                key={c.name}
                className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-lg font-semibold hover:text-indigo-500"
                  >
                    {c.name}
                  </a>
                  <div className="flex gap-1">
                    {c.local && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        local
                      </span>
                    )}
                    {c.openSource && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        open source
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-zinc-500">{c.positioning}</p>
                {c.vsHandy && (
                  <p className="mt-3 text-sm">
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      vs Handy:{" "}
                    </span>
                    <span className="text-zinc-500">{c.vsHandy}</span>
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {c.strengths.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-emerald-600">
                        Strengths
                      </div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-500">
                        {c.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.weaknesses.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-red-600">
                        Weaknesses
                      </div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-500">
                        {c.weaknesses.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {c.recentNews.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold uppercase text-zinc-400">
                      Recent
                    </div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {c.recentNews.map((n, i) => (
                        <li key={i}>
                          <a
                            href={n.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-500 hover:underline"
                          >
                            {n.headline}
                          </a>
                          <span className="text-zinc-400"> · {n.date}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </section>

          {latestNews.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Latest news across the field
              </h2>
              <ol className="space-y-3">
                {latestNews.map((n, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-1 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <div className="flex shrink-0 items-center gap-2 sm:w-56">
                      <span className="font-mono text-xs text-zinc-400">{n.date}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {n.competitor}
                      </span>
                    </div>
                    <div className="text-sm">
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-indigo-500 hover:underline"
                      >
                        {n.headline}
                      </a>
                      {n.summary && (
                        <span className="text-zinc-500"> — {n.summary}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
