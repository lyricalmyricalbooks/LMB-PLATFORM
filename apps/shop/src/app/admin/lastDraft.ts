// Adding products, round 3, change 8 (plan https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL): a new product saves itself
// as a draft once it has a name, and the Add a product window offers "Continue where you left off". This remembers the
// newest such draft on this device. It is a convenience only: the draft itself is in the shop, so a cleared browser
// just loses the shortcut, never the product.

const KEY = "colophon.admin.lastNewDraft";
const KEEP_DAYS = 14;

export type LastDraft = { id: string; title: string; at: number };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

/** The draft to offer, or null when there is none or it is over two weeks old. */
export function readLastDraft(now = Date.now(), s: Store | null = store()): LastDraft | null {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.id !== "string" || !d.id || typeof d.at !== "number") return null;
    if (now - d.at > KEEP_DAYS * 86_400_000) return null;
    return { id: d.id, title: String(d.title || "").trim(), at: d.at };
  } catch { return null; }
}

export function rememberLastDraft(id: string, title: string, now = Date.now(), s: Store | null = store()): void {
  try { s?.setItem(KEY, JSON.stringify({ id, title: String(title || "").trim(), at: now })); } catch { /* private window: no shortcut */ }
}

/** Forget it once it's published, deleted or opened from the window. `id` limits it to that product. */
export function forgetLastDraft(id?: string, s: Store | null = store()): void {
  try {
    if (id) { const d = readLastDraft(Date.now(), s); if (d && d.id !== id) return; }
    s?.removeItem(KEY);
  } catch { /* nothing to forget */ }
}

/** "a few minutes ago", "earlier today", "yesterday", "3 days ago". */
export function whenWords(at: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
