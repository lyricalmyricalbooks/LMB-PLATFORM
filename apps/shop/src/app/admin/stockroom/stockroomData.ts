// The stockroom's records, read straight into the admin (no second app, no frame). Read-only for now: the pages built
// on it show what the stockroom holds, and every figure comes from the stockroom's own rules (`@stockroom/*`).
//
// Where the records live (apps/stockroom/src/firebase.js): the shop's folder in the stockroom's Firestore database
// (`shops/<id>/settings/…`, `shops/<id>/books/<book>/data/<part>`), with an older copy in the Realtime Database under
// `shops/<id>/lyrical`. `settings/modeFlags` says which store holds the catalogue and each item; a store that turns
// out empty falls back to the other, exactly as the stockroom reads them.
import { getDatabase, get, ref } from "firebase/database";
import { collection, doc, getDoc, getDocs, getFirestore, type DocumentReference } from "firebase/firestore";
import { assembleParts, stitchState } from "@stockroom/merge-state.js";

import { app } from "../../../lib/firebase";
import { SHOP_FOLDER } from "../../../lib/shopFolder";
import { shopProfile } from "../../../lib/shopProfile";
import { homeCurrency } from "../moneySign";

export type StockBook = { id: string; title: string; isTest?: boolean; [key: string]: unknown };
export type StockroomRecords = {
  books: StockBook[];
  states: Record<string, Record<string, unknown>>;
  taxCenter: Record<string, unknown> | null;
  /** Till-only items (the catalogue's `_posExtra`): a zine or a friend's title sold at the till, with no stock count. */
  extras?: StockBook[];
  /** The press's invoice details (name, address, terms, bank): the setting `invoiceSettings`, null when never saved. */
  invoiceSettings?: Record<string, unknown> | null;
  /** Author entries waiting for approval, per book (`submissions/<book>/{sales,expenses}/<id>`): only the ids matter. */
  submissions?: Record<string, { sales?: Record<string, unknown>; expenses?: Record<string, unknown> }>;
};

/** The stockroom's own place in the shop's project, as the page's profile names it (missing: the project's defaults). */
export function stockroomPlace(source: unknown = typeof window === "undefined" ? undefined : window.__SHOP_PROFILE__, projectId = shopProfile.firebase.projectId) {
  const raw = (source && typeof source === "object" ? source : {}) as { stockroom?: { firestoreDatabase?: unknown; storageBucket?: unknown }; firebase?: { databaseURL?: unknown } };
  const named = raw.stockroom?.firestoreDatabase;
  const bucket = raw.stockroom?.storageBucket;
  const url = raw.firebase?.databaseURL;
  return {
    firestoreDatabase: typeof named === "string" && named ? named : undefined,
    // The stockroom's own file bucket (receipts live there, as the stockroom saves them); missing: the project's default.
    storageBucket: typeof bucket === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(bucket) ? bucket : undefined,
    databaseURL: typeof url === "string" && /^https:\/\/[^/\s]+\/?$/.test(url) ? url : `https://${projectId}-default-rtdb.firebaseio.com`,
  };
}

const parse = (text: unknown) => { try { return typeof text === "string" ? JSON.parse(text) : text ?? null; } catch { return null; } };

/** The test items the stockroom keeps out of every report (its `isTestBook`). */
export function isTestBook(book: { id?: unknown; title?: unknown; isTest?: unknown }): boolean {
  const names = ["test", "test1", "testpage", "test-page", "test page"];
  const lower = (v: unknown) => String(v || "").toLowerCase().trim();
  return book.isTest === true || names.includes(lower(book.id)) || names.includes(lower(book.title));
}

/** The catalogue as stored (`{ <id>: item, _deletedDefaults, _posExtra }`) as a list, test items left out. */
export function catalogBooks(stored: unknown): StockBook[] {
  if (!stored || typeof stored !== "object") return [];
  return Object.entries(stored as Record<string, unknown>)
    .filter(([key, value]) => !key.startsWith("_") && value && typeof value === "object")
    .map(([key, value]) => ({ ...(value as object), id: String((value as { id?: unknown }).id || key) }) as StockBook)
    .filter((book) => !isTestBook(book));
}

/** The till-only items kept with the catalogue (`_posExtra`): sold at the till, never in stock or the ledger. */
export function tillOnlyItems(stored: unknown): StockBook[] {
  const extra = stored && typeof stored === "object" ? (stored as Record<string, unknown>)._posExtra : null;
  if (!extra || typeof extra !== "object") return [];
  return Object.entries(extra as Record<string, unknown>)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => ({ ...(value as object), id: String((value as { id?: unknown }).id || key) }) as StockBook);
}

/** What the reads need; the tests pass their own. */
export type StockroomReads = {
  setting(key: string): Promise<unknown>;
  oldSetting(key: string): Promise<unknown>;
  flags(): Promise<Record<string, unknown>>;
  bookParts(bookId: string): Promise<Record<string, unknown>>;
  oldBook(bookId: string): Promise<unknown>;
  /** The author entries waiting on one book, from the store the book lives in (absent: not read). */
  submissions?(bookId: string, inFirestore: boolean): Promise<Record<string, Record<string, unknown>> | null>;
};

/** The shop's folder in the stockroom's own database: every stockroom document lives under it. */
export function stockroomHome(): DocumentReference {
  const place = stockroomPlace();
  const fs = place.firestoreDatabase ? getFirestore(app, place.firestoreDatabase) : getFirestore(app);
  return doc(fs, SHOP_FOLDER);
}

function liveReads(): StockroomReads {
  const place = stockroomPlace();
  const home = stockroomHome();
  const rt = getDatabase(app, place.databaseURL);
  const root = `${SHOP_FOLDER}/lyrical`;
  const old = async (path: string) => { const snap = await get(ref(rt, `${root}/${path}`)); return snap.exists() ? snap.val()?.data : null; };
  return {
    setting: async (key) => { const snap = await getDoc(doc(home, "settings", key)); return snap.exists() ? snap.data()?.data : null; },
    oldSetting: (key) => old(`settings/${key}`),
    flags: async () => { const snap = await getDoc(doc(home, "settings", "modeFlags")); return snap.exists() ? snap.data() || {} : {}; },
    bookParts: async (bookId) => {
      const raw: Record<string, unknown> = {};
      (await getDocs(collection(home, "books", bookId, "data"))).forEach((d) => { raw[d.id] = d.data()?.data; });
      return raw;
    },
    oldBook: (bookId) => old(`books/${bookId}`),
    submissions: async (bookId, inFirestore) => {
      if (!inFirestore) {
        const snap = await get(ref(rt, `${root}/submissions/${bookId}`));
        return snap.exists() ? snap.val() : null;
      }
      const out: Record<string, Record<string, unknown>> = {};
      await Promise.all(["sales", "expenses"].map(async (type) => {
        const ids: Record<string, unknown> = {};
        (await getDocs(collection(home, "submissions", bookId, type))).forEach((d) => { ids[d.id] = true; });
        if (Object.keys(ids).length) out[type] = ids;
      }));
      return out;
    },
  };
}

/** A refusal by the database's rules, as Firestore ("permission-denied") and the Realtime Database ("PERMISSION_DENIED") say it. */
export const isRefusal = (error: unknown) => /permission[-_ ]denied/i.test(`${(error as { code?: string })?.code ?? ""} ${(error as { message?: string })?.message ?? ""}`);

// The older store is closed to a shop that never used it: only that refusal counts as empty. Any other failure (offline,
// a timeout) is not an empty record, so the load fails and the page says it didn't load, never "all caught up".
const quiet = <T,>(read: Promise<T>) => read.catch((error) => { if (isRefusal(error)) return null; throw error; });

async function readSetting(reads: StockroomReads, key: string, newFirst: boolean) {
  const first = newFirst ? await reads.setting(key) : await quiet(reads.oldSetting(key));
  if (first != null) return parse(first);
  return parse(newFirst ? await quiet(reads.oldSetting(key)) : await reads.setting(key));
}

async function readBook(reads: StockroomReads, bookId: string, newFirst: boolean) {
  const fromParts = async () => {
    const { parts, present } = assembleParts(await reads.bookParts(bookId));
    return present.length ? stitchState(parts) : null;
  };
  const fromOld = async () => parse(await quiet(reads.oldBook(bookId))) as Record<string, unknown> | null;
  return newFirst ? (await fromParts()) ?? (await fromOld()) : (await fromOld()) ?? (await fromParts());
}

/** Everything the stockroom pages read: the catalogue, each item's records, and the money settings. */
export async function loadStockroom(reads: StockroomReads = liveReads()): Promise<StockroomRecords> {
  const flags = await reads.flags();
  const global = flags.fs_mode_global === true;
  const [catalog, taxCenter, invoiceSettings] = await Promise.all([readSetting(reads, "catalog", global), readSetting(reads, "taxCenter", global), readSetting(reads, "invoiceSettings", global)]);
  const books = catalogBooks(catalog);
  const states: StockroomRecords["states"] = {};
  const submissions: NonNullable<StockroomRecords["submissions"]> = {};
  await Promise.all(books.map(async (book) => {
    const inFirestore = flags[`fs_mode_${book.id}`] === true || global;
    const state = await readBook(reads, book.id, inFirestore);
    if (state) states[book.id] = state;
    // The stockroom watches the store the book lives in; the older one is closed to a shop that never used it.
    if (reads.submissions) {
      const waiting = inFirestore ? await reads.submissions(book.id, true) : await quiet(reads.submissions(book.id, false));
      if (waiting && typeof waiting === "object") submissions[book.id] = waiting;
    }
  }));
  const asObject = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  return { books, states, taxCenter: asObject(taxCenter), invoiceSettings: asObject(invoiceSettings), submissions, extras: tillOnlyItems(catalog) };
}

/** The Tax centre as the Team's accountant (role "bookkeeper") reads it: the key-free copy the owner's saves keep
 *  (`settings/taxCentreForBookkeeper`, @stockroom/bookkeeper-copy.js), shaped like the Tax centre the money pages read. */
export function taxCenterFromCopy(copy: unknown): Record<string, unknown> | null {
  if (!copy || typeof copy !== "object") return null;
  const c = copy as Record<string, unknown>;
  const rates = c.rates && typeof c.rates === "object" ? c.rates : {};
  return {
    settings: { baseCurrency: homeCurrency(c.baseCurrency), rates },
    businessExpenses: Array.isArray(c.businessExpenses) ? c.businessExpenses : [],
  };
}

/** What the accountant's desk reads (BookkeeperDesk.tsx): the catalogue and each item's records, as the owner's pages
 *  read them, and the Tax centre from its key-free copy. Never the Tax centre itself (it holds the AI keys), the
 *  invoice settings or the authors' waiting entries: the stockroom's rules open none of them to the role. */
export async function loadForBookkeeper(reads: StockroomReads = liveReads()): Promise<StockroomRecords> {
  const flags = await reads.flags();
  const global = flags.fs_mode_global === true;
  const [catalog, copy] = await Promise.all([readSetting(reads, "catalog", global), readSetting(reads, "taxCentreForBookkeeper", global)]);
  const books = catalogBooks(catalog);
  const states: StockroomRecords["states"] = {};
  await Promise.all(books.map(async (book) => {
    const state = await readBook(reads, book.id, flags[`fs_mode_${book.id}`] === true || global);
    if (state) states[book.id] = state;
  }));
  return { books, states, taxCenter: taxCenterFromCopy(copy), invoiceSettings: null, extras: tillOnlyItems(catalog) };
}

/** One setting a bookkeeper may read (the mode flags say which store holds it): `reportsForBookkeeper`. */
export async function loadBookkeeperSetting(key: string, reads: StockroomReads = liveReads()): Promise<unknown> {
  const flags = await reads.flags();
  return readSetting(reads, key, flags.fs_mode_global === true);
}

/** What the pages call, so the admin fixture (adminFixture/main.ts) can answer with sample records. */
export const stockroomApi = { load: () => loadStockroom(), loadForBookkeeper: () => loadForBookkeeper() };

/** Everything a stockroom copy holds (stockroomCopies.ts): the catalogue as stored, every item's records (test items
 * too) and the settings the stockroom keeps in the cloud. Read the same way as the pages read. */
export type StockroomWhole = {
  catalog: Record<string, unknown>;
  states: Record<string, Record<string, unknown>>;
  settings: Record<string, unknown>;
};
export const COPIED_SETTINGS = ["taxCenter", "productionCosts", "paymentLinks", "mailingList", "customerSuppress", "invoiceSettings"] as const;

export async function loadStockroomWhole(reads: StockroomReads = liveReads()): Promise<StockroomWhole> {
  const flags = await reads.flags();
  const global = flags.fs_mode_global === true;
  const raw = await readSetting(reads, "catalog", global);
  const catalog = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ids = Object.keys(catalog).filter((key) => !key.startsWith("_") && catalog[key] && typeof catalog[key] === "object");
  const states: StockroomWhole["states"] = {};
  const settings: StockroomWhole["settings"] = {};
  await Promise.all([
    ...ids.map(async (id) => {
      const state = await readBook(reads, id, flags[`fs_mode_${id}`] === true || global);
      if (state) states[id] = state as Record<string, unknown>;
    }),
    ...COPIED_SETTINGS.map(async (key) => {
      const value = await readSetting(reads, key, global);
      if (value != null) settings[key] = value;
    }),
  ]);
  return { catalog, states, settings };
}

/** What the website link reads (websiteLinkRun.ts): the whole catalogue as stored, test items too, the mode flags (a
 * book in the older store can't be checked when its orders are marked) and every item's records. */
export async function loadLinkBooks(reads: StockroomReads = liveReads()) {
  const [flags, whole] = await Promise.all([reads.flags(), loadStockroomWhole(reads)]);
  const catalog: Record<string, Record<string, any>> = {};
  for (const [key, value] of Object.entries(whole.catalog)) {
    if (!key.startsWith("_") && value && typeof value === "object") catalog[key] = { ...(value as object), id: String((value as { id?: unknown }).id || key) };
  }
  const taxCenter = whole.settings.taxCenter;
  const records: StockroomRecords = { books: catalogBooks(whole.catalog), states: whole.states, taxCenter: taxCenter && typeof taxCenter === "object" ? (taxCenter as Record<string, unknown>) : null };
  return { catalog, flags, records };
}
