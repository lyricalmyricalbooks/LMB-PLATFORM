// The fair helper's till, pure parts. A helper's sale goes to the inbox (fairStore.addSale) and the owner's admin brings
// it into the records (fairInbox.ts). Each sale is also kept on this device until the server has it, so a phone that
// is closed or reloaded with no signal still sends it later; the menu is kept too, so the till opens with no signal.
import type { FairMenu, HelperSale } from "@stockroom/fair-helper.js";

const QUEUE_KEY = "colophon-helper-sales";
const MENU_KEY = "colophon-helper-menu";

export type QueuedSale = { id: string; doc: Omit<HelperSale, "id"> };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
const storage = (): Store => { try { return globalThis.localStorage; } catch { return undefined; } };

/** This helper's sales still to reach the server. */
export function readQueue(email: string, store: Store = storage()): QueuedSale[] {
  try {
    const all = JSON.parse(store?.getItem(QUEUE_KEY) || "{}");
    const mine = all && typeof all === "object" ? all[email.toLowerCase()] : null;
    return Array.isArray(mine) ? mine.filter((q) => q && typeof q.id === "string" && q.doc && typeof q.doc === "object") : [];
  } catch { return []; }
}

/** Keeps the queue; false when this device can't keep it (private mode), so the screen says to keep the page open. */
export function writeQueue(email: string, queue: QueuedSale[], store: Store = storage()): boolean {
  try {
    const all = JSON.parse(store?.getItem(QUEUE_KEY) || "{}") || {};
    if (queue.length) all[email.toLowerCase()] = queue.slice(-200);
    else delete all[email.toLowerCase()];
    if (Object.keys(all).length) store?.setItem(QUEUE_KEY, JSON.stringify(all));
    else store?.removeItem(QUEUE_KEY);
    return !!store;
  } catch { return false; }
}

/** The queue without the sales the server holds now (its copy, not this device's waiting one). */
export function pruneQueue(queue: QueuedSale[], server: HelperSale[]): QueuedSale[] {
  const stored = new Set(server.filter((s) => !s.pending).map((s) => s.id));
  return queue.filter((q) => !stored.has(q.id));
}

/** Queued sales the server hasn't heard of at all: to send again (only once the list came from the server). */
export function toResend(queue: QueuedSale[], server: HelperSale[]): QueuedSale[] {
  const known = new Set(server.map((s) => s.id));
  return queue.filter((q) => !known.has(q.id));
}

/** The helper's sales as the screen shows them: the server's, plus queued ones it hasn't got yet (waiting). */
export function mySales(server: HelperSale[], queue: QueuedSale[]): HelperSale[] {
  const known = new Set(server.map((s) => s.id));
  return [...server, ...queue.filter((q) => !known.has(q.id)).map((q) => ({ ...q.doc, id: q.id, pending: true }))];
}

export function readMenu(store: Store = storage()): FairMenu | null {
  try { const m = JSON.parse(store?.getItem(MENU_KEY) || "null"); return m && Array.isArray(m.books) ? m : null; } catch { return null; }
}
export function keepMenu(menu: FairMenu | null, store: Store = storage()) {
  try { if (menu) store?.setItem(MENU_KEY, JSON.stringify(menu)); } catch { /* the live menu still shows */ }
}

/** The sync line under the till. */
export function helperUploadLine(waiting: number, online: boolean, kept: boolean): { tone: "ok" | "wait" | "risk"; text: string } {
  const sales = `${waiting} ${waiting === 1 ? "sale" : "sales"}`;
  if (waiting && !kept) return { tone: "risk", text: `Keep this page open · ${sales} waiting to upload` };
  if (!online) return { tone: "wait", text: waiting ? `Offline · ${sales} waiting to upload` : "Offline · sales wait on this phone" };
  if (waiting) return { tone: "wait", text: `Uploading · ${sales} waiting` };
  return { tone: "ok", text: "All sales uploaded" };
}

/** A sale's state in the helper's list. */
export function saleStatus(s: HelperSale): string {
  if (s.cancelled) return "Undone";
  if (s.pending) return "Waiting for signal";
  return s.imported ? "In the records" : "Uploaded";
}

/** A sale's total per currency. */
export function linesTotals(lines: Array<{ qty: number; price: number; cur: string }> | undefined): Record<string, number> {
  const t: Record<string, number> = {};
  for (const l of lines || []) t[l.cur] = Math.round(((t[l.cur] || 0) + l.qty * l.price) * 100) / 100;
  return t;
}
