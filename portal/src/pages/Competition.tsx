import { useEffect, useState } from "react";
import {
  loadCompetition,
  loadMeta,
  emptyMeta,
  type Competition as C,
  type Meta,
} from "../lib/data";
import Markdown from "../components/Markdown";
import EmptyState from "../components/EmptyState";
import UpdatedBadge from "../components/UpdatedBadge";

const yn = (b: boolean) => (b ? "Yes" : "No");

export default function Competition() {
  const [data, setData] = useState<C | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);

  useEffect(() => {
    loadCompetition().then(setData);
    loadMeta().then(setMeta);
  }, []);

  if (!data) return <p className="text-zinc-400">Loading…</p>;

  const empty = data.competitors.length === 0 && !data.summary.trim();

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

          {data.opportunities.length > 0 && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                Opportunities for Handy
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                {data.opportunities.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
