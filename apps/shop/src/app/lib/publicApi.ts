import { lite } from "../../lib/lite";
import { functionFetch } from "./functionsBase";
import { orderAccessHeaders, savedOrderAccess } from "./orderAccessClient";
import { defaultSettings } from "../admin/defaultSettings";
import { withRisoNoirDefault } from "../features/site/risoNoir";
import type { Page } from "../features/site/types";
import { cleanRedirects, REDIRECTS_DOC, type Redirect } from "../features/site/redirects";

/**
 * The shopper-side reads the storefront needs to render. Kept apart from `admin/api.ts` so the public
 * bundle never downloads the admin API, Firebase Auth or the theme store; `adminApi` re-exports these.
 */
export const publicApi = {
  // Document-ID ordering includes legacy books without createdAt and gives
  // public pagination the same membership as the sitemap, without writes.
  getStorefrontBooks: async (limitCount = 100, lastVisible: any = null) => {
    // firestore.rules serve the public only books with status "published", so a list query must say so (a
    // book saved before statuses existed is stamped "published" by scripts/migrate-book-private-fields.mjs).
    const { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, liteDb } = await lite();
    const constraints = [where("status", "==", "published"), orderBy(documentId()), ...(lastVisible ? [startAfter(lastVisible)] : []), limit(limitCount)];
    const snap = await getDocs(query(collection(liteDb, "books"), ...constraints));
    return snap.docs.map(d => ({ ...d.data(), id: d.id, _lastDoc: d }));
  },

  // A shopper's read of one book: null for a missing book and for one that is not published (the rules refuse
  // the read of a draft or archived book, which is the same answer to a shopper).
  getBook: async (id: string) => {
    const { doc, getDoc, liteDb } = await lite();
    let snap;
    try { snap = await getDoc(doc(liteDb, "books", id)); }
    catch (err: any) { if (err?.code === "permission-denied") return null; throw err; }
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  getShippingProfiles: async () => {
    const { collection, getDocs, liteDb } = await lite();
    const snap = await getDocs(collection(liteDb, "shipping-profiles"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Shopper read of settings/website: no admin-only lookups, never writes, and never keeps the
  // unpublished draft or My themes (older documents may still carry them) in shopper state or cache.
  getPublicSettings: async () => {
    const { doc, getDoc, liteDb } = await lite();
    const snap = await getDoc(doc(liteDb, "settings", "website"));
    return publicApi.publicSettingsFrom(snap.exists() ? snap.data() : null);
  },

  /** settings/website's data (null when there is none) as shoppers get it; shared by the catalog file path. */
  publicSettingsFrom: (data: Record<string, any> | null) => {
    const merged: any = { ...defaultSettings(), ...(data || {}) };
    delete merged.draftDesign;
    delete merged.savedThemes;
    delete merged.scheduledPublish; // older client-side schedules; the server scheduler publishes now (Studio 3.5)
    if (merged.design) merged.design = withRisoNoirDefault(merged.design);
    return merged;
  },

  /** When a book, page or settings/website last changed (functions/catalogVersion.js); decides if the catalog file is current. */
  getCatalogVersion: async () => {
    const { doc, getDoc, liteDb } = await lite();
    const snap = await getDoc(doc(liteDb, "settings", "catalogVersion"));
    return snap.exists() ? snap.data() : null;
  },

  /** A shared preview link (Studio 3.4): readable by its exact token while unexpired (firestore.rules), never listed. */
  getThemePreview: async (token: string) => {
    const { doc, getDoc, liteDb } = await lite();
    const snap = await getDoc(doc(liteDb, "previewTokens", token));
    return snap.exists() ? snap.data() : null;
  },

  // Today's CAD→USD/EUR rates, saved by the scheduled refreshExchangeRates Function; checkout charges the same numbers.
  getExchangeRates: async () => {
    const { doc, getDoc, liteDb } = await lite();
    const snap = await getDoc(doc(liteDb, "settings", "exchangeRates"));
    return snap.exists() ? snap.data() : null;
  },

  // URL redirects (Settings › General): read only when a shopper lands on a missing page; one small public doc.
  getRedirects: async (): Promise<Redirect[]> => {
    const { doc, getDoc, liteDb } = await lite();
    const snap = await getDoc(doc(liteDb, "settings", REDIRECTS_DOC));
    return cleanRedirects(snap.exists() ? (snap.data() as any).items : []);
  },

  getPublishedPages: async (): Promise<Page[]> => {
    const { collection, getDocs, query, where, liteDb } = await lite();
    const q = query(collection(liteDb, "pages"), where("status", "==", "published"));
    const snap = await getDocs(q);
    return publicApi.sortPages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  },

  sortPages: (docs: any[]): Page[] => {
    return [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  // Storefront (thank-you page, /track): the order record only. Guests may read an
  // order by ID, but order-operations is admin-only and would deny the whole read.
  // Guest order lookup. Orders aren't publicly readable: the server returns one
  // only with its customer email or the emailed link key. Resolves null when
  // there is no such order; throws an error whose `code` is "email_mismatch",
  // "too_many" or "failed" otherwise.
  getPublicOrder: async (id: string, proof: { email?: string; key?: string }) => {
    const response = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: await orderAccessHeaders(id, proof.key),
      body: JSON.stringify({ action: "track", orderId: id, key: proof.key || savedOrderAccess(id) }),
    });
    if (response.status === 404 || response.status === 400) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = response.status === 403 ? "email_mismatch" : response.status === 429 ? "too_many" : "failed";
      throw Object.assign(new Error(code), { code });
    }
    return data.order || null;
  },

  // One counter bump per shopper session. `increment` is applied by Firestore itself, so two shoppers arriving at
  // once can't overwrite each other's count (the old read-then-write could).
  recordVisit: async () => {
    // Same rules as every other storefront signal: not the signed-in owner, not the preview, analytics not declined.
    const { trackingAllowed } = await import("./trackingGuard");
    if (!(await trackingAllowed())) return;
    try {
      // Queued with the session's source/device (funnelApi.trackSession) so both land in one write.
      const { queueVisit } = await import("./commerce");
      await queueVisit();
    } catch (e) {
      console.warn("Analytics failed", e);
    }
  },
};
