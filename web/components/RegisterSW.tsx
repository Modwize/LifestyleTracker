'use client';

// Registers the service worker once on mount. Quietly no-ops if unsupported.

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {/* ignore */});
  }, []);
  return null;
}
