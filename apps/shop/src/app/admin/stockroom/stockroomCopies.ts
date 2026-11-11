// Online copies of the stockroom's own records, made by the admin now that the old stockroom app (which made them) is
// going. Same place and shape as the old app's "system backups", so either side reads the other's copies:
//   settings/systemBackups = { data: JSON [{ id, dayKey, type: "auto" | "manual", createdAt, bookCount }], ts }
//   backups/<id>           = { data: JSON snapshot (version 2.6), ts }
// One "auto" copy per local day, the newest 30 kept (older copies' documents are deleted). A copy made here holds the
// invoice settings (now a stockroom setting; bringing back an old app's copy restores them, without its card key) but no
// Sheets link (that lived only in the old app's browser).
// Bringing something back first makes a fresh copy, so it can always be undone from the list.
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

import { COPIED_SETTINGS, loadStockroomWhole, stockroomHome, type StockroomWhole } from "./stockroomData";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

export const KEEP_COPIES = 30;
/** Firestore keeps up to 1 MiB in one document; leave room for the wrapper. */
export const MAX_COPY_BYTES = 1_000_000;
const MANIFEST = "systemBackups";

export type CopyEntry = { id: string; dayKey: string; type: "auto" | "manual"; createdAt: number; bookCount: number };
export type Snapshot = {
  version: string; timestamp: string; source?: string;
  BOOKS: Record<string, unknown>; posExtra?: Record<string, unknown>; deletedDefaults?: unknown[];
  states: Record<string, unknown>;
  TAX_CENTER?: unknown; productionCosts?: unknown; paymentLinks?: unknown; mailingList?: unknown; customerSuppress?: unknown;
  invoiceSettings?: unknown;
};

/** Invoice settings from a copy, without the card key the old app kept beside them (keys never go into the records). */
export function invoiceSettingsFromCopy(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { stripeKey: _key, ...rest } = value as Record<string, unknown>;
  return Object.keys(rest).length ? rest : undefined;
}

export const dayKeyOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The list as stored, cleaned: entries with an id and a time, newest first. */
export function readManifest(raw: unknown): CopyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && Number.isFinite(Number((e as { createdAt?: unknown }).createdAt)))
    .map((e) => ({
      id: String(e.id), createdAt: Number(e.createdAt), dayKey: typeof e.dayKey === "string" ? e.dayKey : dayKeyOf(Number(e.createdAt)),
      type: e.type === "manual" ? "manual" as const : "auto" as const, bookCount: Number(e.bookCount) || 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** The stockroom as a copy, in the old app's v2.6 shape. */
export function snapshotOf(whole: StockroomWhole, now = Date.now()): Snapshot {
  const { catalog, states, settings } = whole;
  const BOOKS = Object.fromEntries(Object.entries(catalog).filter(([key]) => !key.startsWith("_")));
  const suppress = settings.customerSuppress as { emails?: unknown } | unknown[] | undefined;
  const snap: Snapshot = {
    version: "2.6", timestamp: new Date(now).toISOString(), source: "admin",
    BOOKS, posExtra: (catalog._posExtra as Record<string, unknown>) ?? {},
    deletedDefaults: Array.isArray(catalog._deletedDefaults) ? catalog._deletedDefaults : [],
    states,
    TAX_CENTER: settings.taxCenter ?? null,
    productionCosts: settings.productionCosts ?? {},
    paymentLinks: settings.paymentLinks ?? {},
  };
  if (settings.mailingList) snap.mailingList = settings.mailingList;
  if (settings.invoiceSettings) snap.invoiceSettings = settings.invoiceSettings;
  if (suppress) snap.customerSuppress = Array.isArray(suppress) ? suppress : Array.isArray(suppress.emails) ? suppress.emails : [];
  return snap;
}

/** Where a new copy goes in the list, and which old copies drop off; null when today's automatic copy is made. */
export function planCopy(list: CopyEntry[], type: CopyEntry["type"], bookCount: number, now = Date.now()) {
  const day = dayKeyOf(now);
  if (type === "auto" && list.some((e) => dayKeyOf(e.createdAt) === day)) return null;
  const entry: CopyEntry = { id: `sb-${now}`, dayKey: day, type, createdAt: now, bookCount };
  const next = [entry, ...list].sort((a, b) => b.createdAt - a.createdAt);
  return { entry, keep: next.slice(0, KEEP_COPIES), drop: next.slice(KEEP_COPIES).map((e) => e.id) };
}

/** A copy's catalogue entry and records for one item, or null when the copy doesn't hold it. */
export function itemInCopy(snap: Snapshot, id: string) {
  const book = snap.BOOKS?.[id];
  const state = snap.states?.[id];
  return book && typeof book === "object" && state && typeof state === "object" ? { book, state: state as Record<string, unknown> } : null;
}

/** The items a copy holds, by name, for the "which item" choice. */
export function itemsInCopy(snap: Snapshot): { id: string; title: string }[] {
  return Object.entries(snap.BOOKS || {})
    .filter(([id, b]) => b && typeof b === "object" && snap.states?.[id])
    .map(([id, b]) => ({ id, title: String((b as { title?: unknown }).title || id) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** The catalogue after bringing everything back: the copy's items, its till-only items and hidden starters when it has them. */
export function catalogFromCopy(snap: Snapshot, current: unknown): Record<string, unknown> {
  const cur = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  return { ...snap.BOOKS, _posExtra: snap.posExtra ?? cur._posExtra ?? {}, _deletedDefaults: snap.deletedDefaults ?? cur._deletedDefaults ?? [] };
}

// ── Reads and writes (the fixture and tests stand in for these) ──────────────────────────────────────────────────────

const parse = (text: unknown) => { try { return typeof text === "string" ? JSON.parse(text) : text ?? null; } catch { return null; } };

export const copiesIO = {
  list: async (): Promise<CopyEntry[]> => {
    const snap = await getDoc(doc(stockroomHome(), "settings", MANIFEST));
    return readManifest(snap.exists() ? parse(snap.data()?.data) : null);
  },
  whole: () => loadStockroomWhole(),
  writeCopy: (id: string, text: string) => setDoc(doc(stockroomHome(), "backups", id), { data: text, ts: Date.now() }),
  readCopy: async (id: string): Promise<Snapshot | null> => {
    const snap = await getDoc(doc(stockroomHome(), "backups", id));
    return snap.exists() ? (parse(snap.data()?.data) as Snapshot | null) : null;
  },
  deleteCopy: (id: string) => deleteDoc(doc(stockroomHome(), "backups", id)),
  saveList: async (change: (list: CopyEntry[]) => CopyEntry[]) => {
    const result = await stockroomWriteApi.updateSetting(MANIFEST, (current) => change(readManifest(current)));
    if (result.status === "refused" || result.status === "failed") throw new Error(result.message);
  },
  saveSetting: (key: string, change: (current: unknown) => unknown) => stockroomWriteApi.updateSetting(key, change),
  saveBook: (id: string, state: Record<string, unknown>) => stockroomWriteApi.saveBookState(id, () => JSON.parse(JSON.stringify(state))),
};

/** Make a copy now. `auto` makes one only when today has none; the answer is the new entry, or null when none was due. */
export async function makeCopy(type: CopyEntry["type"], io = copiesIO, now = Date.now()): Promise<CopyEntry | null> {
  const list = await io.list();
  if (type === "auto" && !planCopy(list, "auto", 0, now)) return null;
  const snap = snapshotOf(await io.whole(), now);
  const text = JSON.stringify(snap);
  if (text.length > MAX_COPY_BYTES) throw new Error("Your stockroom is too big for one online copy. Use Download all your data instead.");
  const plan = planCopy(list, type, Object.keys(snap.BOOKS).length, now);
  if (!plan) return null;
  // The copy is written first, so the list never names a copy that isn't there.
  await io.writeCopy(plan.entry.id, text);
  let dropped: string[] = [];
  await io.saveList((stored) => {
    const next = [plan.entry, ...stored.filter((e) => e.id !== plan.entry.id)].sort((x, y) => y.createdAt - x.createdAt);
    dropped = next.slice(KEEP_COPIES).map((e) => e.id);
    return next.slice(0, KEEP_COPIES);
  });
  await Promise.all(dropped.map((id) => io.deleteCopy(id).catch(() => {})));
  return plan.entry;
}

export type BringBackResult = { ok: boolean; text: string };
const failed = (r: { status: string }) => r.status === "refused" || r.status === "failed";

/**
 * Bring one item back from a copy, or everything (`id` null): the catalogue entry first (the stockroom only changes
 * items it lists), then the records, then for everything the settings the copy holds. A fresh copy is made first, so
 * the list always has the stockroom as it was just before.
 */
export async function bringBack(copyId: string, id: string | null, io = copiesIO): Promise<BringBackResult> {
  const snap = await io.readCopy(copyId);
  if (!snap || !snap.BOOKS || !snap.states) return { ok: false, text: "That copy couldn't be read, so nothing was changed." };
  if (id && !itemInCopy(snap, id)) return { ok: false, text: "That item isn't in this copy, so nothing was changed." };
  try { await makeCopy("manual", io); } catch {
    return { ok: false, text: "A copy of the stockroom as it is now couldn't be made first, so nothing was changed." };
  }

  const cat = await io.saveSetting("catalog", (current) => {
    const cur = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
    return id ? (cur[id] ? cur : { ...cur, [id]: snap.BOOKS[id] }) : catalogFromCopy(snap, cur);
  });
  if (failed(cat)) return { ok: false, text: describeResult(cat).text };

  const ids = id ? [id] : itemsInCopy(snap).map((i) => i.id);
  const missed: string[] = [];
  for (const each of ids) {
    const r = await io.saveBook(each, itemInCopy(snap, each)!.state);
    if (failed(r)) missed.push(String((snap.BOOKS[each] as { title?: unknown })?.title || each));
  }
  if (!id) {
    const values: Record<string, unknown> = { taxCenter: snap.TAX_CENTER, productionCosts: snap.productionCosts, paymentLinks: snap.paymentLinks, mailingList: snap.mailingList,
      customerSuppress: Array.isArray(snap.customerSuppress) ? { emails: snap.customerSuppress } : undefined,
      invoiceSettings: invoiceSettingsFromCopy(snap.invoiceSettings) };
    for (const key of COPIED_SETTINGS) {
      if (values[key] == null) continue;
      const r = await io.saveSetting(key, () => values[key]);
      if (failed(r)) missed.push(key === "taxCenter" ? "the tax centre" : key === "mailingList" ? "the mailing list" : key === "customerSuppress" ? "the unsubscribe list" : key === "paymentLinks" ? "the payment links" : key === "invoiceSettings" ? "the invoice details" : "the production costs");
    }
  }
  if (missed.length) return { ok: false, text: `Brought back, except ${missed.slice(0, 3).join(", ")}${missed.length > 3 ? ` and ${missed.length - 3} more` : ""}. Try again for those.` };
  return { ok: true, text: id ? "Brought back. A copy from just before is at the top of the list." : `Everything brought back (${ids.length} items). A copy from just before is at the top of the list.` };
}
