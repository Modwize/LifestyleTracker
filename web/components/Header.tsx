import Link from 'next/link';
import { formatDateLong } from '@/lib/format';

export function Header({ today }: { today: Date }) {
  return (
    <header className="flex items-baseline justify-between px-5 pb-4 pt-safe">
      <Link href="/" className="text-[15px] font-semibold tracking-tightish text-zinc-900 dark:text-zinc-50">
        Healthwize
      </Link>
      <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
        {formatDateLong(today)}
      </span>
    </header>
  );
}
