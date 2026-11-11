// The website link's own documents in the stockroom's folder, read and written the way the old app's firebase.js did
// (_fbWatchWebsiteOrders, _fbWatchWebsiteLinkStatus, _fbMarkLinkSwitchedOn, _fbPublishWebsiteLink). The books themselves
// are never written here: their rows go through the admin write layer (stockroomWrite.ts); this file only publishes the
// stock feed and marks orders done, in ONE transaction that re-reads the books from the server, so a stale screen can't
// send the count backwards or mark an order it never saved. Tests use `MemoryWebsiteLink`.
import {
  collection, doc, onSnapshot, query, runTransaction, where, type Firestore, type Unsubscribe,
} from "firebase/firestore";
import { planWebsitePublish, type PublishInput, type WebDoc } from "@stockroom/website-link.js";

import { stockroomHome } from "./stockroomData";

/** The parts the publish decision reads for each book. */
export const PUBLISH_PARTS = ["hist", "ledger", "metadata"] as const;

export type LinkStatus = { website: Record<string, any> | null; app: Record<string, any> | null };
export type PublishArgs = Omit<PublishInput, "books" | "catalog" | "orderDocs" | "now"> & { bookIds: string[] };
export type PublishResult = {
  at: string; feeds: number; accepted: string[]; refused: Array<{ orderId: string; reason: string }>;
  sent: Array<{ orderId: string; hash: string }>; current: Array<{ orderId: string; hash: string }>;
  blocked: string[]; unavailable: string[];
};

export type WebsiteLinkIO = {
  watchPending(cb: (docs: WebDoc[], meta: { fromCache: boolean }) => void, onError: (e: unknown) => void): Unsubscribe;
  watchStatus(cb: (status: LinkStatus) => void, onError: (e: unknown) => void): Unsubscribe;
  /** Records, once, when orders started coming in; returns the day on record. */
  markSwitchedOn(at: string): Promise<string>;
  publish(args: PublishArgs): Promise<PublishResult>;
};

const parse = (text: unknown) => { try { return typeof text === "string" ? JSON.parse(text) : null; } catch { return null; } };

/** What the store hands the decision: the involved books' stored texts, the catalogue text and the order docs. */
export type StoredForPublish = {
  orderDocs: Record<string, WebDoc | null>;
  catalogText: string | null;
  /** Per readable book: per part, its stored text (null: no document). Absent book: nothing stored at all. */
  bookTexts: Record<string, Record<string, string | null>>;
};

/** Which books a publish involves: the asked ones, the marked orders' books and those the orders name. */
export function involvedBooks(args: PublishArgs, orderDocs: Record<string, WebDoc | null>) {
  const involved = new Set(args.bookIds);
  for (const m of (args.marks || []) as Array<{ effect?: Record<string, number> }>) Object.keys(m?.effect || {}).forEach((id) => involved.add(id));
  for (const d of Object.values(orderDocs)) if (d?.web?.books && typeof d.web.books === "object") Object.keys(d.web.books).forEach((id) => involved.add(id));
  return [...involved];
}

export function orderIdsOf(args: PublishArgs) {
  const ids = [
    ...((args.marks || []) as Array<{ orderId?: string }>).map((m) => m?.orderId),
    ...((args.shipments || []) as Array<{ orderId?: string }>).map((s) => s?.orderId),
    ...((args.testShipments || []) as Array<{ orderId?: string }>).map((t) => t?.orderId),
  ];
  return [...new Set(ids.filter(Boolean).map(String))];
}

/** The publish transaction's decision from what is stored (the old `_fbPublishWebsiteLink` body). Pure. */
export function decidePublish(args: PublishArgs, stored: StoredForPublish, now: string) {
  const books: Record<string, { hist: unknown[]; ledger: unknown[]; metadata: Record<string, unknown> }> = {};
  const unavailable: string[] = [];
  for (const [id, texts] of Object.entries(stored.bookTexts)) {
    // No documents at all: the book's records are still in the older store; nothing trustworthy here yet.
    if (!PUBLISH_PARTS.some((p) => texts[p] != null)) { unavailable.push(id); continue; }
    const parts: Record<string, unknown> = {};
    let ok = true;
    for (const p of PUBLISH_PARTS) {
      if (texts[p] == null) { parts[p] = p === "metadata" ? {} : []; continue; }
      const value = parse(texts[p]);
      if (value == null) ok = false; else parts[p] = value;
    }
    if (ok) books[id] = parts as (typeof books)[string]; else unavailable.push(id);
  }
  const catalog = (parse(stored.catalogText) || {}) as Record<string, unknown>;
  const plan = planWebsitePublish({ ...args, books, catalog, orderDocs: stored.orderDocs, now });
  return { plan, unavailable };
}

/** The live documents, in the shop's stockroom folder. */
export function liveWebsiteLinkIO(): WebsiteLinkIO {
  const home = () => stockroomHome();
  return {
    watchPending(cb, onError) {
      const pending = query(collection(home(), "websiteOrders"), where("pending", "==", true));
      return onSnapshot(pending, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })), { fromCache: snap.metadata.fromCache }), onError);
    },
    watchStatus(cb, onError) {
      return onSnapshot(collection(home(), "websiteLink"), (snap) => {
        const out: LinkStatus = { website: null, app: null };
        snap.forEach((d) => { if (d.id === "website" || d.id === "app") out[d.id] = d.data() || {}; });
        cb(out);
      }, onError);
    },
    markSwitchedOn(at) {
      const ref = doc(home(), "websiteLink", "app");
      return runTransaction(ref.firestore, async (tx) => {
        const snap = await tx.get(ref);
        const existing = snap.exists() ? (snap.data() || {}).importConsentAt : "";
        if (typeof existing === "string" && existing) return existing;
        tx.set(ref, { importConsentAt: String(at) }, { merge: true });
        return String(at);
      });
    },
    publish(args) {
      const fs = home().firestore as Firestore;
      return runTransaction(fs, async (tx) => {
        const now = new Date().toISOString();
        const orderIds = orderIdsOf(args);
        const snaps = await Promise.all(orderIds.map((id) => tx.get(doc(home(), "websiteOrders", id))));
        const orderDocs: Record<string, WebDoc | null> = {};
        orderIds.forEach((id, i) => { orderDocs[id] = snaps[i].exists() ? (snaps[i].data() as WebDoc) : null; });
        const ids = involvedBooks(args, orderDocs);
        const flagsSnap = await tx.get(doc(home(), "settings", "modeFlags"));
        const flags = flagsSnap.exists() ? flagsSnap.data() || {} : {};
        const inNew = (id: string) => flags.fs_mode_global === true || flags[`fs_mode_${id}`] === true;
        const blocked = ids.filter((id) => !inNew(id));
        const readable = ids.filter(inNew);
        const catalogSnap = await tx.get(doc(home(), "settings", "catalog"));
        const partSnaps = await Promise.all(readable.flatMap((id) => PUBLISH_PARTS.map((p) => tx.get(doc(home(), "books", id, "data", p)))));
        const bookTexts: StoredForPublish["bookTexts"] = {};
        readable.forEach((id, i) => {
          const texts: Record<string, string | null> = {};
          PUBLISH_PARTS.forEach((p, j) => { const s = partSnaps[i * PUBLISH_PARTS.length + j]; texts[p] = s.exists() ? (s.data()?.data ?? null) : null; });
          bookTexts[id] = texts;
        });
        const { plan, unavailable } = decidePublish(args, {
          orderDocs, catalogText: catalogSnap.exists() ? (catalogSnap.data()?.data ?? null) : null, bookTexts,
        }, now);
        for (const f of plan.feeds) tx.set(doc(home(), "websiteStockFeed", f.bookId), f.doc);
        for (const u of plan.orderUpdates) tx.update(doc(home(), "websiteOrders", u.orderId), u.data);
        const app: Record<string, string> = { build: String(args.build || "") };
        if (plan.feeds.length) app.lastFeedAt = now;
        if (plan.accepted.length) app.lastImportAt = now;
        tx.set(doc(home(), "websiteLink", "app"), app, { merge: true });
        return { at: now, feeds: plan.feeds.length, accepted: plan.accepted, refused: plan.refused, sent: plan.sent, current: plan.current, blocked, unavailable };
      });
    },
  };
}
