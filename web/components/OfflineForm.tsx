'use client';

// Progressive-enhancement wrapper:
//   - When online, the form's native server-action submission runs unchanged.
//   - When navigator.onLine is false, we intercept, stash the FormData into
//     the IndexedDB queue, reset the form, and flash a "queued" indicator.
//
// The OfflineQueueFlusher (mounted higher in the tree) drains the queue
// whenever the window regains connectivity.

import { useRef, useState } from 'react';
import { enqueue } from '@/lib/offline-queue';

interface Props {
  op: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (formData: FormData) => any;
  children: React.ReactNode;
  className?: string;
}

export function OfflineForm({ op, action, children, className }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [queued, setQueued] = useState(false);

  return (
    <form
      ref={formRef}
      action={action}
      className={className}
      onSubmit={async (e) => {
        if (typeof navigator === 'undefined' || navigator.onLine) return;
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload = Object.fromEntries(fd.entries()) as Record<string, unknown>;
        try {
          await enqueue({
            op,
            payload,
            day: todayISO(),
            queued_at: Date.now(),
          });
          setQueued(true);
          e.currentTarget.reset();
          window.setTimeout(() => setQueued(false), 3000);
        } catch {
          // IDB unavailable — fall back to letting the browser show its own
          // network error when the user retries.
        }
      }}
    >
      {children}
      {queued && (
        <p className="mt-2 text-[12px] text-zinc-500">Queued offline — will sync when you're back online.</p>
      )}
    </form>
  );
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
