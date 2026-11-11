// The website link's documents in memory, for tests and the admin fixture: the website's inbox (`websiteOrders`),
// the link's status, the stock feeds, and a publish that runs the same decision as the live transaction
// (`decidePublish`) against what a MemoryStockroom has actually stored, so "marked done" here means what it means on
// the server: the saved rows show the order.
import type { WebDoc } from "@stockroom/website-link.js";

import type { MemoryStockroom } from "./stockroomMemory";
import { decidePublish, involvedBooks, orderIdsOf, PUBLISH_PARTS, type LinkStatus, type PublishResult, type WebsiteLinkIO } from "./websiteLinkStore";

type Doc = Record<string, any>;
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export class MemoryWebsiteLink {
  docs: Record<string, Doc> = {};
  feeds: Record<string, Doc> = {};
  status: LinkStatus = { website: { at: "2026-11-01T00:00:00.000Z" }, app: { importConsentAt: "2026-10-01T00:00:00.000Z" } };
  publishes: Array<Record<string, unknown>> = [];
  /** Snapshots are from the server unless a test says otherwise. */
  fromCache = false;
  private orderListeners = new Set<(docs: WebDoc[], meta: { fromCache: boolean }) => void>();
  private statusListeners = new Set<(s: LinkStatus) => void>();

  constructor(private stockroom: MemoryStockroom) {}

  /** The website pushes (or re-pushes) an order: it lands in the inbox, pending. */
  push(web: Doc) {
    this.docs[web.orderId] = { ...(this.docs[web.orderId] || {}), web: copy(web), pending: true };
    this.deliver();
  }

  deliver() {
    const pending = Object.entries(this.docs).filter(([, d]) => d.pending).map(([id, d]) => ({ id, ...copy(d) }) as WebDoc);
    this.orderListeners.forEach((fn) => fn(pending, { fromCache: this.fromCache }));
  }

  setStatus(status: LinkStatus) {
    this.status = copy(status);
    this.statusListeners.forEach((fn) => fn(copy(this.status)));
  }

  io(): WebsiteLinkIO {
    return {
      watchPending: (cb) => {
        this.orderListeners.add(cb);
        queueMicrotask(() => this.deliver());
        return () => { this.orderListeners.delete(cb); };
      },
      watchStatus: (cb) => {
        this.statusListeners.add(cb);
        queueMicrotask(() => cb(copy(this.status)));
        return () => { this.statusListeners.delete(cb); };
      },
      markSwitchedOn: async (at) => {
        const existing = this.status.app?.importConsentAt;
        if (typeof existing === "string" && existing) return existing;
        this.setStatus({ ...this.status, app: { ...(this.status.app || {}), importConsentAt: at } });
        return at;
      },
      publish: async (args): Promise<PublishResult> => {
        this.publishes.push(copy(args) as Record<string, unknown>);
        const now = new Date().toISOString();
        const orderDocs: Record<string, WebDoc | null> = {};
        for (const id of orderIdsOf(args)) orderDocs[id] = this.docs[id] ? (copy(this.docs[id]) as WebDoc) : null;
        const ids = involvedBooks(args, orderDocs);
        const flags = this.stockroom.flags;
        const inNew = (id: string) => flags.fs_mode_global === true || flags[`fs_mode_${id}`] === true;
        const bookTexts: Record<string, Record<string, string | null>> = {};
        for (const id of ids.filter(inNew)) {
          const stored = this.stockroom.parts.get(id) ?? {};
          bookTexts[id] = Object.fromEntries(PUBLISH_PARTS.map((p) => [p, stored[p] ?? null]));
        }
        const { plan, unavailable } = decidePublish(args, { orderDocs, catalogText: this.stockroom.settings.get("catalog") ?? null, bookTexts }, now);
        for (const f of plan.feeds) this.feeds[f.bookId] = copy(f.doc);
        for (const u of plan.orderUpdates) {
          const d = this.docs[u.orderId];
          if (!d) continue;
          for (const [key, value] of Object.entries(u.data)) {
            const path = key.split(".");
            let at = d;
            for (const step of path.slice(0, -1)) at = at[step] = { ...(at[step] || {}) };
            at[path[path.length - 1]] = copy(value);
          }
        }
        const app: Doc = { ...(this.status.app || {}), build: String(args.build || "") };
        if (plan.feeds.length) app.lastFeedAt = now;
        if (plan.accepted.length) app.lastImportAt = now;
        this.status = { ...this.status, app };
        if (plan.orderUpdates.length) queueMicrotask(() => this.deliver());
        return { at: now, feeds: plan.feeds.length, accepted: plan.accepted, refused: plan.refused, sent: plan.sent, current: plan.current, blocked: ids.filter((id) => !inNew(id)), unavailable };
      },
    };
  }
}
