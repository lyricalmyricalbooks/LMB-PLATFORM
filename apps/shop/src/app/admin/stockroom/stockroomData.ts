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

export type StockBook = { id: string; title: string; isTest?: boolean; [key: string]: unknown };
export type StockroomRecords = {
  books: StockBook[];
  states: Record<string, Record<string, unknown>>;
  taxCenter: Record<string, unknown> | null;
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

function liveReads(): StockroomReads {
  const place = stockroomPlace();
  const fs = place.firestoreDatabase ? getFirestore(app, place.firestoreDatabase) : getFirestore(app);
  const home: DocumentReference = doc(fs, SHOP_FOLDER);
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
  const [catalog, taxCenter] = await Promise.all([readSetting(reads, "catalog", global), readSetting(reads, "taxCenter", global)]);
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
  return { books, states, taxCenter: taxCenter && typeof taxCenter === "object" ? taxCenter : null, submissions };
}

/** What the pages call, so the admin fixture (adminFixture/main.ts) can answer with sample records. */
export const stockroomApi = { load: () => loadStockroom() };
