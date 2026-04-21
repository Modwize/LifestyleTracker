// One row in the "today's actions" list.
// Status is conveyed by a small dot — no emoji, no icons.

type Status = 'done' | 'pending' | 'missed' | 'none';

const DOT: Record<Status, string> = {
  done:    'bg-emerald-500',
  pending: 'border border-zinc-400 dark:border-zinc-500',
  missed:  'bg-zinc-300 dark:bg-zinc-700',
  none:    'bg-transparent border border-dashed border-zinc-300 dark:border-zinc-700',
};

export function ActionRow({
  label, value, status,
}: { label: string; value: string; status: Status }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[status]}`} />
        <span className="text-[15px] text-zinc-900 dark:text-zinc-100">{label}</span>
      </div>
      <span className="text-[15px] tabular-nums text-zinc-600 dark:text-zinc-400">{value}</span>
    </div>
  );
}
