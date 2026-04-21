// Bottom tab bar for the authenticated surface. Four destinations, labels only.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',         label: 'Today' },
  { href: '/week',     label: 'Week' },
  { href: '/log',      label: 'Log' },
  { href: '/labs',     label: 'Labs' },
  { href: '/timeline', label: 'Timeline' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 border-t border-zinc-200 bg-zinc-50/90 pb-safe backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname?.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex h-12 items-center justify-center text-[13px] font-medium tracking-tightish transition-colors ${
                  active
                    ? 'text-zinc-900 dark:text-zinc-50'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
