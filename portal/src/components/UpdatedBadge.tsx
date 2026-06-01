import { relativeTime } from "../lib/format";

export default function UpdatedBadge({ iso }: { iso: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-500 dark:border-zinc-800">
      <span
        className={`h-1.5 w-1.5 rounded-full ${iso ? "bg-emerald-500" : "bg-zinc-400"}`}
      />
      {iso ? `updated ${relativeTime(iso)}` : "not generated"}
    </span>
  );
}
