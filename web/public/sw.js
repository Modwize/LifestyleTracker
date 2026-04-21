// Service worker: installable PWA shell + Web Push handler.
// Network-first for same-origin HTML; falls back to the cached root when
// offline so "/" still renders. Push events render a notification that
// deep-links into the relevant route on click.

const CACHE = 'healthwize-shell-v2';
const SHELL_URLS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((r) => r ?? Response.error())),
    );
  }
});

// ─── Web Push ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Healthwize', body: event.data?.text?.() ?? '' }; }
  const title = data.title || 'Healthwize';
  const body = data.body || '';
  const url = data.url || '/';
  const tag = data.tag || 'healthwize';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,                       // coalesce repeats of the same kind
    renotify: false,
    data: { url },
    badge: '/icon?size=96',
    icon: '/icon?size=192',
    requireInteraction: false,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => c.url.endsWith(url));
    if (existing) { existing.focus(); return; }
    if (all[0]) { all[0].focus(); all[0].navigate?.(url); return; }
    await self.clients.openWindow(url);
  })());
});
