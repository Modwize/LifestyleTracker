// Surface primitive: subtle border, no shadow. The whole UI stacks these.

import { type ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
      {children}
    </h2>
  );
}
