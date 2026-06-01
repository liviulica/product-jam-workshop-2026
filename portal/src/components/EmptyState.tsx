export default function EmptyState({
  label,
  command,
}: {
  label: string;
  command: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="font-medium text-zinc-600 dark:text-zinc-300">No {label} yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Run{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
          {command}
        </code>{" "}
        to generate this section, then reload.
      </p>
    </div>
  );
}
