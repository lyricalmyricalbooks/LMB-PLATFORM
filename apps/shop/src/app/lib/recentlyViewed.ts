import { useEffect, useState, useCallback } from "react";

const KEY = "fm_recently_viewed_v1";
const MAX = 8;

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Valid JSON that isn't a list (e.g. "null") must not crash every product card.
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {}
}

const CHANGED = "fm-recently-viewed";

export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>(() => (typeof window === "undefined" ? [] : read()));
  // Product pages stay mounted while the shopper moves between books: follow every new view.
  useEffect(() => {
    const refresh = () => setIds(read());
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, []);

  const track = useCallback((id: string) => {
    if (!id) return;
    const current = read();
    const next = [id, ...current.filter(x => x !== id)].slice(0, MAX);
    write(next);
    setIds(next);
  }, []);

  return { ids, track };
}

export function trackBookView(id: string) {
  if (!id || typeof window === "undefined") return;
  write([id, ...read().filter(x => x !== id)]);
  window.dispatchEvent(new Event(CHANGED));
}
