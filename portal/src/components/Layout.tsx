import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { loadMeta, emptyMeta, type Meta } from "../lib/data";
import { relativeTime } from "../lib/format";

const NAV = [
  { to: "/", label: "Release Notes", key: "releaseNotes", icon: "📰" },
  { to: "/docs", label: "Documentation", key: "docs", icon: "📚" },
  { to: "/issues", label: "Prioritization", key: "prioritization", icon: "🎯" },
  { to: "/competition", label: "Competition", key: "competition", icon: "⚔️" },
] as const;

export default function Layout() {
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-zinc-200 p-5 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎙️</span>
            <span className="text-lg font-bold tracking-tight">Handy Portal</span>
          </div>
          <a
            href={`https://github.com/${meta.repo}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 hover:text-indigo-500"
          >
            {meta.repo}
          </a>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const updated = meta.lastUpdated[item.key];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `group rounded-lg px-3 py-2 transition-colors ${
                    isActive
                      ? "bg-indigo-500 text-white"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  }`
                }
              >
                {({ isActive }) => (
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span>{item.icon}</span>
                      {item.label}
                    </span>
                    <span
                      className={`text-[11px] ${
                        isActive ? "text-indigo-100" : "text-zinc-400"
                      }`}
                    >
                      {updated ? `updated ${relativeTime(updated)}` : "not generated"}
                    </span>
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto text-[11px] leading-relaxed text-zinc-400">
          Run{" "}
          <code className="rounded bg-zinc-100 px-1 text-zinc-500 dark:bg-zinc-800">
            /h:update-all
          </code>{" "}
          to refresh, then reload this page.
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
