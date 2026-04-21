import Link from 'next/link';
import { formatDateLong } from '@/lib/format';

export function Header({ today, phaseMode }: { today: Date; phaseMode?: string | null }) {
  return (
    <header className="flex items-start justify-between px-5 pb-4 pt-safe">
      <Link href="/" className="text-[15px] font-semibold tracking-tightish text-zinc-900 dark:text-zinc-50">
        Healthwize
      </Link>
      <div className="flex flex-col items-end">
        <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {formatDateLong(today)}
        </span>
        {phaseMode && phaseMode !== 'normal' && (
          <span className="text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
            {phaseMode.replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </header>
  );
}
