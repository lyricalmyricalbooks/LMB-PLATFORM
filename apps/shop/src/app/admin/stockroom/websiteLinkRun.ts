// The website link's running part in the owner's admin: watches the website's pending orders, brings each ready one
// into its books, and publishes the stock the website follows, as the old app's `startWebsiteLink` / `importOnce` /
// `doPublish` did. The card (WebsiteOrdersCard.tsx) reads `linkView()` and calls `decide`. One runner per admin tab.
import type { WebDoc, WebPlan } from "@stockroom/website-link.js";

import {
  actionsByBook, applyWebsiteAction, heldOrders, markFor, planImport, ratesWanted, shipmentCandidates,
  STRIPE_CHARGE_PI_KEY, type Decision, type Decisions,
} from "./websiteLink";
import type { LinkStatus, PublishResult, WebsiteLinkIO } from "./websiteLinkStore";
import type { BookState } from "./planSave";
import type { StockroomRecords } from "./stockroomData";
import type { BookSaveResult } from "./stockroomWrite";

export type LinkBooks = { catalog: Record<string, Record<string, any>>; flags: Record<string, unknown>; records: StockroomRecords };

export type RunDeps = {
  link: WebsiteLinkIO;
  /** The whole catalogue (test items too), the mode flags and every book's records, fresh. */
  loadBooks(): Promise<LinkBooks>;
  saveBook(bookId: string, mutate: (state: BookState) => BookState): Promise<BookSaveResult>;
  /** A dated rate (FROM → CAD on a day), null when no service answered. */
  rate(cur: string, day: string): Promise<number | null>;
  /** The dated rates known now. */
  rates(): Record<string, number>;
  chargeIntents?(): Record<string, string>;
  /** Hears about every save of the stockroom's records made in this admin (to send the stock again). */
  onSaved?(fn: () => void): () => void;
  now?(): Date;
  build?: string;
};

export type LinkView = {
  /** False until the website's pending orders were first read. */
  ready: boolean;
  running: boolean;
  error: string;
  publishError: string;
  status: LinkStatus;
  review: WebPlan[];
  tests: WebPlan[];
  blocked: string[];
  waitingOnLoad: number;
  more: number;
  lastRun: { at: string; added: number; linked: number; updated: number } | null;
  lastImportAt: string;
  lastFeedAt: string;
  /** Pre-orders promised, per book id (copies, orders), from the last read of the books. */
  books: LinkBooks | null;
};

const PUBLISH_DEBOUNCE_MS = 2500;
const RETRY_MS = 60_000;

const blank = (): LinkView => ({
  ready: false, running: false, error: "", publishError: "", status: { website: null, app: null }, review: [], tests: [], blocked: [],
  waitingOnLoad: 0, more: 0, lastRun: null, lastImportAt: "", lastFeedAt: "", books: null,
});

let view: LinkView = blank();
const listeners = new Set<() => void>();
const set = (patch: Partial<LinkView>) => { view = { ...view, ...patch }; listeners.forEach((fn) => { try { fn(); } catch { /* a listener never stops the link */ } }); };

/** What the card shows; `subscribe` for changes. */
export const linkView = () => view;
export function subscribeLink(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

let current: ReturnType<typeof createWebsiteLinkRunner> | null = null;
/** The owner's choice on an order waiting for one (remembered with the order once it is brought in). */
export function decide(orderId: string, bookId: string, choice: "same" | "different", key = "") { current?.decide(orderId, bookId, choice, key); }
/** Look again now (the card's Try again). */
export function lookAgain() { current?.lookAgain(); }

const denied = (e: unknown) => /permission[-_ ]denied/i.test(`${(e as { code?: string })?.code ?? ""}`);
const readChargeIntents = (): Record<string, string> => {
  try { const raw = localStorage.getItem(STRIPE_CHARGE_PI_KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

export function createWebsiteLinkRunner(deps: RunDeps) {
  const now = () => deps.now?.() ?? new Date();
  let docs: WebDoc[] = [];
  let fromCache = true;
  let statusKnown = false;
  let decisions: Decisions = {};
  let running = false;
  let again = false;
  let stopped = false;
  let publishTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let publishAll = true;
  let publishBooks = new Set<string>();
  let publishing: Promise<unknown> = Promise.resolve();
  const sentLabels: Record<string, string> = {};

  async function publish(opts: { marks?: unknown[]; books?: string[] } = {}): Promise<PublishResult | null> {
    const run = async () => {
      const loaded = view.books ?? await deps.loadBooks();
      const ids = new Set(opts.books ?? []);
      if (publishAll) Object.keys(loaded.catalog).forEach((id) => ids.add(id));
      publishBooks.forEach((id) => ids.add(id));
      publishAll = false;
      publishBooks = new Set();
      const bookIds = [...ids].filter((id) => loaded.catalog[id] && loaded.records.states[id]);
      const shipments = shipmentCandidates(loaded.records, sentLabels);
      const marks = opts.marks ?? [];
      if (!bookIds.length && !marks.length && !shipments.length) return null;
      try {
        const res = await deps.link.publish({ bookIds, marks, shipments, heldOrders: heldOrders(docs), build: deps.build ?? "admin", device: "Admin" });
        [...res.sent, ...res.current].forEach((s) => { sentLabels[s.orderId] = s.hash; });
        set({
          publishError: "",
          lastFeedAt: res.feeds ? res.at : view.lastFeedAt,
          lastImportAt: res.accepted.length ? res.at : view.lastImportAt,
          blocked: [...new Set([...view.blocked, ...res.blocked])],
        });
        return res;
      } catch (e) {
        bookIds.forEach((id) => publishBooks.add(id));
        set({ publishError: denied(e) ? "The website link isn’t allowed to save. Ask us to check the shop’s database rules." : "Couldn’t send the stock to the website just now. It tries again after your next change." });
        return null;
      }
    };
    const next = publishing.then(run, run);
    publishing = next.catch(() => null);
    return next;
  }

  function schedulePublish(bookId?: string) {
    if (bookId) publishBooks.add(bookId); else publishAll = true;
    clearTimeout(publishTimer);
    publishTimer = setTimeout(() => { void publish(); }, PUBLISH_DEBOUNCE_MS);
  }

  async function importOnce() {
    const app = view.status.app || {};
    let consentAt = String(app.importConsentAt || "");
    // The first time, record when orders started coming in: tracking already on a hand-entered sale from before that
    // day stays the sale's own, never sent to the website as a label.
    if (statusKnown && !consentAt) {
      try { consentAt = await deps.link.markSwitchedOn(now().toISOString()); } catch (e) { console.warn("Website link: day not recorded", e); }
    }
    const loaded = await deps.loadBooks();
    const real = docs.filter((d) => d.web && d.web.test !== true);
    for (const { cur, day } of ratesWanted(real, loaded.catalog, deps.rates())) await deps.rate(cur, day);
    const src = { records: loaded.records, catalog: loaded.catalog, flags: loaded.flags, consentAt, rates: deps.rates(), chargeIntents: deps.chargeIntents?.() ?? readChargeIntents() };
    const plan = planImport(docs, src, decisions);
    set({ books: loaded, review: plan.review, tests: plan.tests, blocked: plan.blocked, waitingOnLoad: plan.waitingOnLoad, more: plan.more });
    if (!statusKnown) return; // wait for the link's own status (it holds the day the link was switched on)
    // A cached snapshot can be behind books already saved: wait for the server's.
    if (fromCache || !plan.go.length) return;

    const counts = { added: 0, linked: 0, updated: 0 };
    const saved = new Set<string>();
    const failed = new Set<string>();
    for (const [bookId, items] of actionsByBook(plan.go)) {
      const book = loaded.catalog[bookId];
      const tally = { added: 0, linked: 0, updated: 0 };
      const result = await deps.saveBook(bookId, (state) => {
        tally.added = tally.linked = tally.updated = 0; // a retried commit runs this again from what is stored
        for (const { action, plan: p } of items) {
          const kind = applyWebsiteAction(state, book, action, p, now());
          if (kind) tally[kind]++;
        }
        return state;
      });
      if (result.status === "saved" || result.status === "unchanged") {
        saved.add(bookId);
        counts.added += tally.added; counts.linked += tally.linked; counts.updated += tally.updated;
      } else failed.add(bookId);
    }
    for (const p of plan.go) delete decisions[p.orderId];
    // Orders whose every book was saved are offered to the server to mark; it checks the saved rows itself.
    const marks = plan.go.filter((p) => p.actions.every((a) => !failed.has(a.bookId))).map(markFor);
    // The card counts orders from the books: show what was just saved.
    if (saved.size) set({ books: await deps.loadBooks() });
    const res = await publish({ marks, books: [...saved] });
    if (counts.added || counts.linked || counts.updated) set({ lastRun: { at: now().toISOString(), ...counts } });
    if (failed.size || res?.refused.some((r) => r.reason === "not-saved" || r.reason === "book-unavailable")) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => lookAgain(), RETRY_MS);
    }
  }

  async function lookAgain() {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    set({ running: true });
    try {
      do { again = false; await importOnce(); } while (again && !stopped);
      set({ error: "" });
    } catch (e) {
      console.error("Website link: import failed", e);
      set({ error: "Something went wrong bringing in website orders. It tries again by itself; reload if it keeps happening." });
    } finally {
      running = false;
      set({ running: false });
    }
  }

  function decideOne(orderId: string, bookId: string, choice: "same" | "different", key = "") {
    if (!orderId || !bookId) return;
    const d: Decision = choice === "same" ? { choice: "same", key } : { choice: "different" };
    decisions = { ...decisions, [orderId]: { ...(decisions[orderId] || {}), [bookId]: d } };
    void lookAgain();
  }

  function start() {
    view = blank();
    current = api;
    const stopOrders = deps.link.watchPending((next, meta) => {
      docs = next.filter((d) => d && d.id);
      fromCache = meta.fromCache;
      set({ ready: true, error: "" });
      void lookAgain();
    }, (e) => set({ ready: true, error: denied(e) ? "The admin isn’t allowed to read the website’s orders. Ask us to check the shop’s database rules." : "The connection to the website’s orders dropped. Reload once you’re back online." }));
    const stopStatus = deps.link.watchStatus((status) => {
      const first = !statusKnown;
      statusKnown = true;
      set({ status, lastImportAt: view.lastImportAt || String(status.app?.lastImportAt || ""), lastFeedAt: view.lastFeedAt || String(status.app?.lastFeedAt || "") });
      if (first) void lookAgain();
    }, (e) => console.warn("Website link: status not watched", e));
    // A save anywhere in the admin: the next publish reads the books afresh, and the card gets the new copy too.
    const refreshBooks = () => { deps.loadBooks().then((books) => { if (!stopped && view.books === null) set({ books }); }, () => {}); };
    const stopSaved = deps.onSaved?.(() => { set({ books: null }); schedulePublish(); refreshBooks(); }) ?? (() => {});
    const online = () => { void lookAgain(); schedulePublish(); };
    if (typeof window !== "undefined") window.addEventListener("online", online);
    schedulePublish();
    return () => {
      stopped = true;
      stopOrders(); stopStatus(); stopSaved();
      clearTimeout(publishTimer); clearTimeout(retryTimer);
      if (typeof window !== "undefined") window.removeEventListener("online", online);
      if (current === api) current = null;
    };
  }

  const api = { start, decide: decideOne, lookAgain, publish, idle: () => publishing };
  return api;
}
