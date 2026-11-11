// Saving the stockroom's records from the admin, exactly as the old stockroom app saves them, without ever replacing
// another device's work. No page uses this yet; read WRITING.md before the first one does.
//
// Where the records go (the same places and shapes as apps/stockroom/src/firebase.js, so both apps read each other's):
//  - a book in the new store: one document per part, `shops/<id>/books/<book>/data/<part>` = `{ data: <JSON text>, ts }`
//  - a book still in the older store: `shops/<id>/lyrical/books/<book>` in the Realtime Database = `{ data, ts }`
//  - settings: `shops/<id>/settings/<key>` = `{ data, ts }` (or `lyrical/settings/<key>` in the older store)
// Which store holds a book is `settings/modeFlags` (`fs_mode_<book>` for a book, `fs_mode_global` for settings),
// read fresh from the server before every save, never remembered.
//
// How a save stays safe: the page reads a book (its "base"), the layer applies the page's change to a private copy,
// then in ONE atomic commit (a transaction) re-reads the cloud's parts, three-way merges them with the page's
// version against the base (`planSave`, the stockroom's own merge rules) and writes the result. If another device
// wrote in between, its rows are merged in, never overwritten. Nothing is written when the cloud copy can't be read.
// The old app writes the parts with a plain batch after a separate read; a transaction closes the gap between them.
import { ALL_PARTS, MERGED_SETTING_KEYS, assembleParts, mergeSettingDoc, splitState, stitchState } from "@stockroom/merge-state.js";
import { BOOKKEEPER_COPY_KEY, bookkeeperCopyKey, bookkeeperTaxCopy } from "@stockroom/bookkeeper-copy.js";
import { bookSizeMessage, bookSizeReport } from "@stockroom/book-size.js";
import { collection, doc, getDocFromServer, getDocsFromServer, getFirestore, runTransaction } from "firebase/firestore";
import { get, getDatabase, ref, runTransaction as runRealtimeTransaction } from "firebase/database";

import { app } from "../../../lib/firebase";
import { SHOP_FOLDER } from "../../../lib/shopFolder";
import { deriveStock, partTextsOf, planSave, UnreadablePartError, type BookLike, type BookState, type Derive, type PartTexts, type SaveConflict } from "./planSave";
import { isRefusal, stockroomPlace, type StockroomReads } from "./stockroomData";

// ── What the writer needs from the database (the tests pass an in-memory one) ─────────────────────────────────────

/** Atomic commit helpers. `decide` gets what is stored right now and returns what to write (null: write nothing). It
 *  may run more than once (a transaction retries on contention), so it must not do anything but compute. */
export type StockroomIO = StockroomReads & {
  /** `platform/plan` (null: not on a plan, so open). */
  plan(): Promise<{ access?: unknown } | null>;
  commitBookParts(bookId: string, decide: (stored: Record<string, string | null>) => Record<string, string> | null): Promise<void>;
  commitOldBook(bookId: string, decide: (stored: string | null) => string | null): Promise<void>;
  commitSetting(key: string, decide: (stored: string | null) => string | null): Promise<void>;
  commitOldSetting(key: string, decide: (stored: string | null) => string | null): Promise<void>;
};

// ── Results: every outcome is one of these; nothing is silent ─────────────────────────────────────────────────────

export type RefusalReason = "no-permission" | "plan-paused" | "unknown-book" | "preview-copy";
export type FailureReason = "offline" | "read-failed" | "write-failed" | "too-big" | "unreadable" | "two-copies" | "moved" | "needs-base";

/** A change that was made on a private copy and not yet stored: enough to try again later (an offline queue can keep it). */
export type PendingBookSave = { kind: "book"; bookId: string; store: "parts" | "old"; base: PartTexts; local: BookState };

export type SaveRefused = { status: "refused"; reason: RefusalReason; message: string };
export type SaveFailed = { status: "failed"; reason: FailureReason; message: string; pending?: PendingBookSave };
export type BookSaved = {
  /** `saved`: something was written. `unchanged`: the cloud already held this (the page may still adopt `state`). */
  status: "saved" | "unchanged";
  /** The book as it is now. A page must show this, not the version it asked to save. */
  state: BookState;
  /** Another device had written meanwhile and its rows were merged in. */
  merged: boolean;
  /** Rows both devices changed. This page's version was kept; `remote` is the other device's version. Tell the person. */
  conflicts: SaveConflict[];
  /** The parts written (a page can say "sales history"). */
  written: string[];
};
export type BookSaveResult = BookSaved | SaveRefused | SaveFailed;

export type SettingSaved = { status: "saved" | "unchanged"; value: unknown; merged: boolean; conflicts: SaveConflict[] };
export type SettingSaveResult = SettingSaved | SaveRefused | SaveFailed;

const REFUSAL_WORDS = "Your sign-in can't change the stockroom's records here (only the shop owner can, and not while the plan is paused). Nothing was changed.";

class TooBigError extends Error {
  constructor(readonly words: string) { super(words); this.name = "TooBigError"; }
}

function classify(error: unknown, phase: "read" | "write"): SaveRefused | SaveFailed {
  if (error instanceof UnreadablePartError) return { status: "failed", reason: "unreadable", message: `${error.message} Ask for help before saving again.` };
  if (error instanceof TooBigError) return { status: "failed", reason: "too-big", message: error.words };
  if (isRefusal(error)) return { status: "refused", reason: "no-permission", message: REFUSAL_WORDS };
  const text = `${(error as { code?: string })?.code ?? ""} ${(error as { message?: string })?.message ?? ""}`;
  if (/unavailable|deadline|offline|network|failed to fetch|timed? ?out/i.test(text)) {
    return { status: "failed", reason: "offline", message: "The stockroom can't be reached right now, so nothing was changed. Try again when you're back online." };
  }
  return phase === "read"
    ? { status: "failed", reason: "read-failed", message: "The stockroom's records couldn't be read, so nothing was changed. Try again." }
    : { status: "failed", reason: "write-failed", message: "The change couldn't be stored, so nothing was changed. Try again." };
}

type Attempt<T> = { ok: true; value: T } | { ok: false; result: SaveRefused | SaveFailed };
async function attempt<T>(phase: "read" | "write", run: () => Promise<T>): Promise<Attempt<T>> {
  try { return { ok: true, value: await run() }; } catch (error) { return { ok: false, result: classify(error, phase) }; }
}

/** One plain sentence for what a result means, and how loudly to say it. A page shows this; it never hides a result. */
export function describeResult(result: BookSaveResult | SettingSaveResult): { tone: "ok" | "warn" | "error"; text: string } {
  if (result.status === "refused" || result.status === "failed") return { tone: "error", text: result.message };
  if (result.conflicts.length) {
    const n = result.conflicts.length;
    return { tone: "warn", text: `Saved. ${n === 1 ? "One entry was" : `${n} entries were`} changed on another device at the same moment; your version was kept and theirs is listed so you can check it.` };
  }
  if (result.merged) return { tone: "ok", text: "Saved, together with changes another device made meanwhile." };
  return { tone: "ok", text: result.status === "unchanged" ? "Already up to date." : "Saved." };
}

// ── Reading before a write ───────────────────────────────────────────────────────────────────────────────────────

const parseText = (text: string | null) => { if (text == null) return null; try { return JSON.parse(text); } catch { return undefined; } };
/** The older store being closed to a shop that never used it is "nothing there"; any other failure is a failure. */
const quiet = <T,>(read: Promise<T>) => read.catch((error) => { if (isRefusal(error)) return null as T; throw error; });

async function readSettingText(io: StockroomIO, key: string, global: boolean): Promise<string | null> {
  const first = global ? await io.setting(key) : await quiet(io.oldSetting(key));
  if (first != null) return String(first);
  const second = global ? await quiet(io.oldSetting(key)) : await io.setting(key);
  return second == null ? null : String(second);
}

async function findBook(io: StockroomIO, global: boolean, bookId: string): Promise<BookLike | null> {
  const text = await readSettingText(io, "catalog", global);
  const stored = parseText(text);
  if (!stored || typeof stored !== "object") return null;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (key.startsWith("_") || !value || typeof value !== "object") continue;
    if (key === bookId || String((value as { id?: unknown }).id) === bookId) return { ...(value as object), id: bookId } as BookLike;
  }
  return null;
}

type Loaded = { state: BookState; base: PartTexts; store: "parts" | "old" };

// A stored old-style book can lack parts or hold extra keys; fold it through the same split the new store uses.
const splitBack = (state: BookState) => splitState(state);

const emptyBase = (): PartTexts => partTextsOf(stitchState({}));

// assembleParts throws on a stored part that isn't JSON; that is a damaged record, not an empty one.
function assemble(raw: Record<string, unknown>) {
  try { return assembleParts(raw); } catch (error) { throw new UnreadablePartError("book", error); }
}

async function loadBook(io: StockroomIO, bookId: string, store: "parts" | "old"): Promise<Loaded | "two-copies"> {
  if (store === "parts") {
    const raw = await io.bookParts(bookId);
    const { parts, present } = assemble(raw);
    if (present.length) {
      const base: PartTexts = {};
      // The merge base is the stored text of each part, or "known empty" for a part with no document (as `_fbLoad`).
      for (const name of ALL_PARTS) base[name] = present.includes(name) ? String(raw[name]) : JSON.stringify(parts[name]);
      return { state: stitchState(parts), base, store };
    }
    // Flagged for the new store but nothing there yet: the older copy is the book (the old app copies it across on its
    // first save). Starting from it with an all-empty base writes every part, once.
    const old = parseText((await quiet(io.oldBook(bookId))) as string | null);
    if (old === undefined) throw new UnreadablePartError("book");
    return { state: old ? stitchState(splitBack(old as BookState)) : stitchState({}), base: emptyBase(), store };
  }
  // Older store: if the new store also holds parts, the admin's readers (which prefer the new store) and this write
  // would disagree about which copy is the book. The old app calls this "kept"; it is left for a person to settle.
  const { present } = assemble(await io.bookParts(bookId));
  if (present.length) return "two-copies";
  const text = (await quiet(io.oldBook(bookId))) as string | null;
  const parsed = parseText(text);
  if (parsed === undefined) throw new UnreadablePartError("book");
  const state = stitchState(splitBack((parsed as BookState) ?? {}));
  return { state, base: parsed ? partTextsOf(state) : emptyBase(), store };
}


// ── The writer ───────────────────────────────────────────────────────────────────────────────────────────────────

export type WriterOptions = {
  /** Recompute values derived from the rows. The default sets the on-hand count (see `Derive` in planSave.ts). */
  derive?: Derive;
};

export function createStockroomWriter(io: StockroomIO, options: WriterOptions = {}) {
  const derive = options.derive ?? deriveStock;

  /** Plan, flags and book lookup: the checks every write starts with, read fresh. */
  async function route(bookId: string): Promise<{ refused: SaveRefused } | { book: BookLike; store: "parts" | "old" }> {
    const plan = await io.plan();
    if (plan && typeof plan === "object" && plan.access !== undefined && plan.access !== "open") {
      return { refused: { status: "refused", reason: "plan-paused", message: "Your plan is paused, so the stockroom is read-only. Nothing was changed." } as SaveRefused };
    }
    const flags = await io.flags();
    const global = flags.fs_mode_global === true;
    const book = await findBook(io, global, bookId);
    if (!book) {
      return { refused: { status: "refused", reason: "unknown-book", message: "That item isn't in the stockroom's catalogue, so nothing was changed." } as SaveRefused };
    }
    return { book, store: (flags[`fs_mode_${bookId}`] === true ? "parts" : "old") as "parts" | "old" };
  }

  /** Commit a prepared change. Also the entry point for trying a kept change again later (`SaveFailed.pending`). */
  async function commitBookState(pending: PendingBookSave): Promise<BookSaveResult> {
    const routed = await attempt("read", () => route(pending.bookId));
    if (!routed.ok) return routed.result;
    if ("refused" in routed.value) return routed.value.refused;
    const { book, store } = routed.value;
    if (store !== pending.store) {
      return { status: "failed", reason: "moved", message: "This item moved to different storage on another device. Reload, then make the change again.", pending };
    }

    let plan: ReturnType<typeof planSave> | null = null;
    const title = String(book.title ?? pending.bookId);
    const check = (state: BookState, firestore: boolean) => {
      const report = bookSizeReport(state, { firestore });
      if (report.level === "over") throw new TooBigError(bookSizeMessage(report, title));
    };
    const written = await attempt("write", async () => {
      if (store === "parts") {
        await io.commitBookParts(pending.bookId, (stored) => {
          plan = planSave({ base: pending.base, remote: stored, local: pending.local, book, derive });
          if (Object.keys(plan.writes).length) check(plan.state, true);
          return Object.keys(plan.writes).length ? plan.writes : null;
        });
      } else {
        await io.commitOldBook(pending.bookId, (stored) => {
          const parsed = parseText(stored);
          if (parsed === undefined) throw new UnreadablePartError("book");
          const remote = parsed ? partTextsOf(stitchState(splitBack(parsed as BookState))) : emptyBase();
          plan = planSave({ base: pending.base, remote, local: pending.local, book, derive });
          if (!Object.keys(plan.writes).length) return null;
          check(plan.state, false);
          return JSON.stringify(plan.state);
        });
      }
    });
    if (!written.ok) {
      const result = written.result;
      return result.status === "failed" ? { ...result, pending } : result;
    }
    const done = plan as ReturnType<typeof planSave> | null;
    if (!done) return { status: "failed", reason: "write-failed", message: "The change couldn't be stored, so nothing was changed. Try again.", pending };
    const wrote = Object.keys(done.writes);
    return { status: wrote.length ? "saved" : "unchanged", state: done.state, merged: done.merged, conflicts: done.conflicts, written: wrote };
  }

  /**
   * Change one item's records. `mutate` gets a private copy of the book as it is now and returns the new version (edit
   * the copy and return it, or return a new object). It runs once, before anything is stored; if it throws, nothing
   * is written and the error reaches the caller. The result says what happened: see `describeResult`.
   */
  async function saveBookState(bookId: string, mutate: (state: BookState) => BookState | Promise<BookState>): Promise<BookSaveResult> {
    const routed = await attempt("read", () => route(bookId));
    if (!routed.ok) return routed.result;
    if ("refused" in routed.value) return routed.value.refused;
    const { store } = routed.value;
    const loaded = await attempt("read", () => loadBook(io, bookId, store));
    if (!loaded.ok) return loaded.result;
    if (loaded.value === "two-copies") {
      return { status: "failed", reason: "two-copies", message: "This item has records in both the old and the new storage, so it isn't safe to change from here. Nothing was changed." };
    }
    const next = await mutate(JSON.parse(JSON.stringify(loaded.value.state)) as BookState);
    if (!next || typeof next !== "object") throw new Error("mutate must return the book's records");
    return commitBookState({ kind: "book", bookId, store, base: loaded.value.base, local: next });
  }

  async function writeSetting(key: string, value: unknown, base: string | null | undefined, global: boolean): Promise<SettingSaveResult> {
    // A Tax Centre still showing the device's startup copy may be missing what another device added.
    if (key === "taxCenter" && value && typeof value === "object" && (value as { _preview?: unknown })._preview) {
      return { status: "refused", reason: "preview-copy", message: "That copy hasn't finished loading from the cloud, so it wasn't saved." };
    }
    const merges = MERGED_SETTING_KEYS.has(key);
    if (merges && base === undefined) {
      return { status: "failed", reason: "needs-base", message: `"${key}" is shared by every device, so it can only be saved with the text it was read as. Nothing was changed.` };
    }
    let outcome: SettingSaved | null = null;
    const decide = (stored: string | null): string | null => {
      const localText = JSON.stringify(value);
      if (merges && base != null && localText === base) { outcome = { status: "unchanged", value, merged: false, conflicts: [] }; return null; }
      let out: unknown = value;
      let merged = false;
      let conflicts: SaveConflict[] = [];
      if (merges && base != null) {
        const result = mergeSettingDoc(base, stored, value);
        out = result.value; merged = result.merged; conflicts = result.conflicts;
      }
      const text = JSON.stringify(out);
      if (text === stored) { outcome = { status: "unchanged", value: out, merged, conflicts }; return null; }
      outcome = { status: "saved", value: out, merged, conflicts };
      return text;
    };
    const stored = await attempt("write", () => (global ? io.commitSetting(key, decide) : io.commitOldSetting(key, decide)));
    if (!stored.ok) return stored.result;
    const result = outcome as SettingSaved | null;
    if (!result) return { status: "failed", reason: "write-failed", message: "The change couldn't be stored, so nothing was changed. Try again." };
    if (key === "taxCenter" && result.status === "saved") await saveBookkeeperCopy(result.value, global);
    return result;
  }

  // The bookkeeper reads a key-free copy of the Tax Centre; the old app refreshes it after each Tax Centre save. A
  // failure here never fails the save (the copy catches up on the next one).
  async function saveBookkeeperCopy(taxCenter: unknown, global: boolean) {
    try {
      const copy = bookkeeperTaxCopy(taxCenter);
      const decide = (stored: string | null) => {
        const before = parseText(stored);
        if (before && bookkeeperCopyKey(before) === bookkeeperCopyKey(copy)) return null;
        return JSON.stringify(copy);
      };
      await (global ? io.commitSetting(BOOKKEEPER_COPY_KEY, decide) : io.commitOldSetting(BOOKKEEPER_COPY_KEY, decide));
    } catch (error) {
      console.warn("[stockroom] the bookkeeper's copy of the Tax Centre was not saved", error);
    }
  }

  /**
   * Change a shared setting from what is stored now: reads it, applies `mutate` (current value or null, returns the
   * new one) and stores it, merging with anything another device saved in between. Use this for `catalog` and
   * `taxCenter`.
   */
  async function updateSetting(key: string, mutate: (current: unknown) => unknown | Promise<unknown>): Promise<SettingSaveResult> {
    const prepared = await attempt("read", async () => {
      const plan = await io.plan();
      if (plan && typeof plan === "object" && plan.access !== undefined && plan.access !== "open") return { paused: true as const };
      const global = (await io.flags()).fs_mode_global === true;
      const text = await readSettingText(io, key, global);
      const current = parseText(text);
      if (current === undefined) throw new UnreadablePartError(key);
      return { paused: false as const, global, text, current };
    });
    if (!prepared.ok) return prepared.result;
    if (prepared.value.paused) return { status: "refused", reason: "plan-paused", message: "Your plan is paused, so the stockroom is read-only. Nothing was changed." };
    const { global, text, current } = prepared.value;
    const next = await mutate(current == null ? null : JSON.parse(JSON.stringify(current)));
    return writeSetting(key, next, text, global);
  }

  /**
   * Store a setting as given. For `catalog` and `taxCenter` pass `base`, the exact text the value was read as
   * (`null` if there was none), so a change on another device is merged and not overwritten; without it those two
   * are refused. Other settings are a plain overwrite, as in the old app.
   */
  async function saveSetting(key: string, value: unknown, opts: { base?: string | null } = {}): Promise<SettingSaveResult> {
    const prepared = await attempt("read", async () => {
      const plan = await io.plan();
      if (plan && typeof plan === "object" && plan.access !== undefined && plan.access !== "open") return null;
      return (await io.flags()).fs_mode_global === true;
    });
    if (!prepared.ok) return prepared.result;
    if (prepared.value === null) return { status: "refused", reason: "plan-paused", message: "Your plan is paused, so the stockroom is read-only. Nothing was changed." };
    return writeSetting(key, value, opts.base, prepared.value);
  }

  return { saveBookState, commitBookState, updateSetting, saveSetting };
}

// ── The live database ────────────────────────────────────────────────────────────────────────────────────────────

/** The stockroom's real records, reached the way stockroomData.ts reaches them, but always from the server. */
export function liveStockroomIO(): StockroomIO {
  const place = stockroomPlace();
  const fs = place.firestoreDatabase ? getFirestore(app, place.firestoreDatabase) : getFirestore(app);
  const home = doc(fs, SHOP_FOLDER);
  const rt = getDatabase(app, place.databaseURL);
  const root = `${SHOP_FOLDER}/lyrical`;
  const old = async (path: string) => { const snap = await get(ref(rt, `${root}/${path}`)); return snap.exists() ? snap.val()?.data : null; };
  const settingDoc = (key: string) => doc(home, "settings", key);
  const bookPart = (bookId: string, part: string) => doc(home, "books", bookId, "data", part);

  const commitOld = async (path: string, decide: (stored: string | null) => string | null) => {
    await runRealtimeTransaction(ref(rt, `${root}/${path}`), (current) => {
      const next = decide(current && typeof current === "object" && typeof current.data === "string" ? current.data : null);
      return next == null ? undefined : { data: next, ts: Date.now() };
    });
  };

  return {
    setting: async (key) => { const snap = await getDocFromServer(settingDoc(key)); return snap.exists() ? snap.data()?.data : null; },
    oldSetting: (key) => old(`settings/${key}`),
    flags: async () => { const snap = await getDocFromServer(settingDoc("modeFlags")); return snap.exists() ? snap.data() || {} : {}; },
    bookParts: async (bookId) => {
      const raw: Record<string, unknown> = {};
      (await getDocsFromServer(collection(home, "books", bookId, "data"))).forEach((d) => { raw[d.id] = d.data()?.data; });
      return raw;
    },
    oldBook: (bookId) => old(`books/${bookId}`),
    plan: async () => { const snap = await getDocFromServer(doc(home, "platform", "plan")); return snap.exists() ? snap.data() : null; },
    commitBookParts: async (bookId, decide) => {
      await runTransaction(fs, async (tx) => {
        const stored: Record<string, string | null> = {};
        const snaps = await Promise.all(ALL_PARTS.map((part) => tx.get(bookPart(bookId, part))));
        ALL_PARTS.forEach((part, i) => { stored[part] = snaps[i].exists() ? (snaps[i].data()?.data ?? null) : null; });
        const writes = decide(stored);
        if (!writes) return;
        const ts = Date.now();
        for (const [part, data] of Object.entries(writes)) tx.set(bookPart(bookId, part), { data, ts });
      });
    },
    commitOldBook: (bookId, decide) => commitOld(`books/${bookId}`, decide),
    commitSetting: async (key, decide) => {
      await runTransaction(fs, async (tx) => {
        const snap = await tx.get(settingDoc(key));
        const next = decide(snap.exists() ? (snap.data()?.data ?? null) : null);
        if (next != null) tx.set(settingDoc(key), { data: next, ts: Date.now() });
      });
    },
    commitOldSetting: (key, decide) => commitOld(`settings/${key}`, decide),
  };
}

let live: ReturnType<typeof createStockroomWriter> | null = null;
const liveWriter = () => (live ??= createStockroomWriter(liveStockroomIO()));

/** What the pages call (the admin fixture can swap `stockroomWriteApi` for sample data, as it does for reads). */
export const stockroomWriteApi = {
  saveBookState: (bookId: string, mutate: (state: BookState) => BookState | Promise<BookState>) => liveWriter().saveBookState(bookId, mutate),
  commitBookState: (pending: PendingBookSave) => liveWriter().commitBookState(pending),
  updateSetting: (key: string, mutate: (current: unknown) => unknown | Promise<unknown>) => liveWriter().updateSetting(key, mutate),
  saveSetting: (key: string, value: unknown, opts?: { base?: string | null }) => liveWriter().saveSetting(key, value, opts),
};
