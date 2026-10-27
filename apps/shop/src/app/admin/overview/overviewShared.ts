// One read per source for the whole Overview board: several widgets can show the same carts, back-in-stock
// sign-ups or Search Console report, and each mounts on its own, so they share the promise instead of each
// reading Firestore (or Google) again. A copy is kept for SHARED_MAX_AGE_MS, so leaving the Overview and coming
// straight back reads nothing again; an older copy is read again on next use. Refresh clears it.
export const SHARED_MAX_AGE_MS = 5 * 60_000;

const cache = new Map<string, { p: Promise<unknown>; at: number }>();

export function sharedLoad<T>(key: string, load: () => Promise<T>, fresh = false, now = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && !fresh && now - hit.at < SHARED_MAX_AGE_MS) return hit.p as Promise<T>;
  const p = load();
  const entry = { p, at: now };
  cache.set(key, entry);
  // A failed read is not kept, so Try again really tries again.
  p.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
  return p;
}

export const clearShared = () => cache.clear();
