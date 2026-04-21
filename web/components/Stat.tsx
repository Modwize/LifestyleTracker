// Label-above-value stat block. Used on Week and elsewhere for dense readouts.

export function Stat({
  label, value, delta, subdued = false,
}: {
  label: string;
  value: string;
  delta?: string | null;
  subdued?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <span className={`text-[17px] font-semibold tabular-nums tracking-tightish ${subdued ? 'text-zinc-500' : ''}`}>
        {value}
      </span>
      {delta && (
        <span className="text-[12px] tabular-nums text-zinc-500">{delta}</span>
      )}
    </div>
  );
}
