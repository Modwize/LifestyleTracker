'use client';

// Mounted on the Log page. Watches connectivity + the IndexedDB queue and
// drains it whenever we come back online. Keeps a visible badge while items
// are pending so the user knows things haven't been lost.

import { useCallback, useEffect, useState } from 'react';
import { count, list, remove, type QueuedItem } from '@/lib/offline-queue';

export function OfflineQueueFlusher() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await count());
  }, []);

  const flush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setBusy(true);
    try {
      let items: QueuedItem[] = [];
      try { items = await list(); } catch { items = []; }
      for (const item of items) {
        try {
          const r = await fetch('/api/log', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ op: item.op, payload: item.payload, day: item.day }),
          });
          if (r.ok) await remove(item.id);
          // If the server returned 400 (bad payload), drop it — a stale queue
          // entry we can't fix by retrying.
          else if (r.status === 400) await remove(item.id);
          // 401 / 5xx → leave in queue for next attempt.
        } catch {
          // Network blip; stop processing and retry later.
          break;
        }
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    void flush();
    window.addEventListener('online', flush);
    // Light poll — cheap and covers the "still offline" case gracefully.
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    return () => {
      window.removeEventListener('online', flush);
      window.clearInterval(interval);
    };
  }, [flush, refresh]);

  if (pending === 0) return null;
  return (
    <div className="mx-3 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
      {pending} action{pending === 1 ? '' : 's'} queued{busy ? ' — syncing…' : ' — will sync when online.'}
    </div>
  );
}
