'use client';

// Minimal Web Push enrollment UI. Prompts for notification permission,
// subscribes via the service worker's PushManager, and stores the
// subscription server-side. Unsubscribing is symmetric.
//
// iOS 16.4+ requires the PWA to be installed to the home screen before the
// browser will even offer Push; we detect that and surface a clear message.

import { useCallback, useEffect, useState } from 'react';
import { savePushSubscription, removePushSubscription } from '@/app/(app)/push-actions';

type State =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'subscribed'; endpoint: string }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function abToB64(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function PushToggle() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const detect = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState({ kind: 'unsupported', reason: 'Web Push not supported on this browser.' });
      return;
    }
    // iOS: Push only works in an installed PWA.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS-only prop
      window.navigator.standalone === true;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIOS && !isStandalone) {
      setState({ kind: 'unsupported', reason: 'Add Healthwize to your Home Screen first — iOS Push requires installed PWAs.' });
      return;
    }
    if (Notification.permission === 'denied') {
      setState({ kind: 'denied' });
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) setState({ kind: 'subscribed', endpoint: sub.endpoint });
    else setState({ kind: 'idle' });
  }, []);

  useEffect(() => { void detect(); }, [detect]);

  const subscribe = useCallback(async () => {
    setState({ kind: 'working' });
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('VAPID public key not configured');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState({ kind: 'denied' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyBytes = urlBase64ToUint8Array(publicKey);
      // Copy into a fresh ArrayBuffer so the TS BufferSource types accept it
      // (stricter recent lib.dom narrows Uint8Array<ArrayBufferLike>).
      const key = keyBytes.slice().buffer;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const raw = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
      await savePushSubscription({
        endpoint: raw.endpoint,
        p256dh: raw.keys?.p256dh ?? abToB64(sub.getKey('p256dh')),
        auth:   raw.keys?.auth   ?? abToB64(sub.getKey('auth')),
        user_agent: navigator.userAgent,
      });
      setState({ kind: 'subscribed', endpoint: sub.endpoint });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'subscribe failed' });
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState({ kind: 'working' });
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await removePushSubscription(sub.endpoint);
      }
      setState({ kind: 'idle' });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'unsubscribe failed' });
    }
  }, []);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        <p className="text-[14px]">Push notifications</p>
        <p className="text-[12px] text-zinc-500">
          {state.kind === 'subscribed' && 'This device is receiving nudges directly.'}
          {state.kind === 'idle' && 'Enable to get nudges without Telegram open.'}
          {state.kind === 'working' && 'Working…'}
          {state.kind === 'denied' && 'Permission denied — enable in browser settings.'}
          {state.kind === 'unsupported' && state.reason}
          {state.kind === 'error' && state.message}
        </p>
      </div>
      {state.kind === 'idle' && (
        <button
          onClick={subscribe}
          className="h-9 rounded-xl bg-zinc-900 px-3 text-[13px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Enable
        </button>
      )}
      {state.kind === 'subscribed' && (
        <button
          onClick={unsubscribe}
          className="h-9 rounded-xl border border-zinc-200 px-3 text-[13px] font-medium dark:border-zinc-800"
        >
          Disable
        </button>
      )}
    </div>
  );
}
