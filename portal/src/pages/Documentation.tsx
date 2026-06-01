import { useEffect, useMemo, useState } from "react";
import {
  loadDocsIndex,
  loadDocContent,
  loadMeta,
  emptyMeta,
  type DocsIndex,
  type DocSection,
  type Meta,
} from "../lib/data";
import Markdown from "../components/Markdown";
import EmptyState from "../components/EmptyState";
import UpdatedBadge from "../components/UpdatedBadge";

export default function Documentation() {
  const [index, setIndex] = useState<DocsIndex | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  useEffect(() => {
    loadMeta().then(setMeta);
    loadDocsIndex().then((idx) => {
      const sorted: DocsIndex = {
        ...idx,
        sections: [...idx.sections].sort((a, b) => a.order - b.order),
      };
      setIndex(sorted);
      if (sorted.sections.length > 0) setActiveId(sorted.sections[0].id);
    });
  }, []);

  const active = useMemo(
    () => index?.sections.find((s) => s.id === activeId) || null,
    [index, activeId],
  );

  useEffect(() => {
    if (!active) {
      setContent(null);
      return;
    }
    setLoadingDoc(true);
    loadDocContent(active.file).then((c) => {
      setContent(c);
      setLoadingDoc(false);
    });
  }, [active]);

  const groups = useMemo(() => {
    const map = new Map<string, DocSection[]>();
    (index?.sections || []).forEach((s) => {
      const arr = map.get(s.category) || [];
      arr.push(s);
      map.set(s.category, arr);
    });
    return Array.from(map.entries());
  }, [index]);

  if (!index) return <p className="text-zinc-400">Loading…</p>;

  const empty = index.sections.length === 0;

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentation</h1>
          <p className="text-sm text-zinc-500">
            Generated from the Handy source code
          </p>
        </div>
        <UpdatedBadge iso={meta.lastUpdated.docs} />
      </header>

      {empty ? (
        <EmptyState label="documentation" command="/h:docs" />
      ) : (
        <div className="flex gap-8">
          <nav className="w-56 shrink-0">
            {groups.map(([cat, items]) => (
              <div key={cat} className="mb-4">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {cat}
                </div>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setActiveId(s.id)}
                        className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                          s.id === activeId
                            ? "bg-indigo-500 text-white"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        }`}
                      >
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <article className="min-w-0 flex-1">
            {loadingDoc ? (
              <p className="text-zinc-400">Loading…</p>
            ) : content ? (
              <Markdown>{content}</Markdown>
            ) : (
              <p className="text-zinc-400">Could not load this document.</p>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
