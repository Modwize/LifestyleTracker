// IndexedDB-backed FIFO queue for offline Log submissions. No dependencies —
// the API surface is four functions (enqueue / list / remove / count) over
// a single auto-incrementing object store.
//
// Schema:
//   { id: number (auto), op: string, payload: object, day: string, queued_at: number }

'use client';

const DB_NAME = 'healthwize';
const STORE = 'log_queue';
const VERSION = 1;

export interface QueuedItem {
  id: number;
  op: string;
  payload: Record<string, unknown>;
  day: string;
  queued_at: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(item: Omit<QueuedItem, 'id'>): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const id = await promisify(tx.objectStore(STORE).add(item));
  db.close();
  return Number(id);
}

export async function list(): Promise<QueuedItem[]> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const rows = await promisify(tx.objectStore(STORE).getAll());
  db.close();
  return (rows ?? []) as QueuedItem[];
}

export async function remove(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  await promisify(tx.objectStore(STORE).delete(id));
  db.close();
}

export async function count(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const n = await promisify(tx.objectStore(STORE).count());
    db.close();
    return n;
  } catch {
    return 0;
  }
}
