import { useLocation } from "react-router";
import { consentAllows, CONSENT_EVENT } from "../../lib/consent";
import { isLiveBook } from "./liveBook";
import { resolveSurfaceDesign } from "./surfaceDesign";
import { useCallback, useEffect, useMemo, useState } from "react";
import { publicApi } from "../../lib/publicApi";
import { funnelApi } from "../../lib/commerce";
import { DEFAULT_SETTINGS } from "./constants";
import { subscribePreview } from "./previewTab";
import { readSiteCache, writeSiteCache, SITE_CACHE_EVENT } from "./siteCache";
import type { Book, SiteSettings, Page } from "./types";
import { RISO_NOIR_TOKENS, withRisoNoirDefault } from "./risoNoir";
import { setSiteIdentity } from "../../lib/seo";
import { applyFavicon } from "./favicon";
import { applyCustomCode } from "./customCode";
import { configureGa4 } from "../../lib/ga4";
import { configureClarity } from "../../lib/clarity";
import { applyBackorderPolicy } from "./backorder";
import { withBundleStock } from "./bundleStock";
import { resolveProductRoutes } from "./productRoutes";
import { loadCatalog, newestFirst } from "./loadCatalog";
import { currentStorefrontData, fetchStorefrontDataFile } from "./storefrontDataFile";
import { inThemePreview, loadThemePreview } from "./themePreview";

const isPreviewUrl = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";

/**
 * Latest Studio snapshot (preview only). Kept on window so components that mount later (cart drawer,
 * product page after navigation) start from the unsaved state, and so the late Firestore load never
 * overwrites what Studio sent.
 */
type PreviewSnapshot = { settings?: any; books?: Book[]; pages?: Page[] };
const previewSnapshot = (): PreviewSnapshot | null => (isPreviewUrl() ? (window as any).__studioPreviewState || null : null);

// One bootstrap request for the whole storefront, including route changes and
// StrictMode remounts. This is display data only; checkout still validates on the server.
const SITE_DATA_FRESH_MS = 30_000;
let siteDataRequest: Promise<[any[], any, any]> | null = null;
let siteDataLoadedAt = 0;
// The last successful read, so a page mounting just after it (the server-rendered landing page) starts with it.
let lastSiteData: [any[], any, any] | null = null;
function loadSiteData() {
  if (!siteDataRequest || Date.now() - siteDataLoadedAt >= SITE_DATA_FRESH_MS) {
    // Infinity marks an in-flight request, which every consumer should join.
    siteDataLoadedAt = Infinity;
    siteDataRequest = readSiteData().then(result => {
      siteDataLoadedAt = Date.now();
      lastSiteData = result;
      return result;
    }, error => {
      siteDataRequest = null;
      siteDataLoadedAt = 0;
      throw error;
    });
  }
  return siteDataRequest;
}

/**
 * The catalog file on Hosting when nothing changed since it was built (one Firestore read), else the Firestore
 * reads as always. Both give the same books, settings and pages (features/site/storefrontDataFile.ts).
 */
async function readSiteData(): Promise<[any[], any, any]> {
  const file = await currentStorefrontData(fetchStorefrontDataFile, publicApi.getCatalogVersion);
  if (file) return [newestFirst(file.books as any[]), publicApi.publicSettingsFrom(file.settings), publicApi.sortPages(file.pages)];
  return Promise.all([
    loadCatalog((size, cursor) => publicApi.getStorefrontBooks(size, cursor)).then(newestFirst),
    publicApi.getPublicSettings(),
    publicApi.getPublishedPages(),
  ]);
}

/**
 * Starts the shop data read early (main.tsx, landing on a server-rendered page). Null when nothing needs waiting
 * for: the Studio preview, a share preview, or this tab already has the data cached.
 */
export function preloadSiteData(): Promise<unknown> | null {
  if (typeof window === "undefined" || isPreviewUrl() || inThemePreview() || readSiteCache()) return null;
  return loadSiteData();
}

/** Data a just-finished early read already has, in the session cache's shape (never for previews). */
function preloadedSiteData() {
  if (!lastSiteData || isPreviewUrl() || inThemePreview()) return null;
  const [books, settings, pages] = lastSiteData;
  if (!Array.isArray(books) || !Array.isArray(pages) || !settings || typeof settings !== "object") return null;
  return { books, settings: { ...settings }, pages };
}

export function useSiteData() {
  const location = useLocation();
  const [cached] = useState(() => typeof window !== "undefined" ? readSiteCache() || preloadedSiteData() : null);
  const snap = previewSnapshot();
  const [books, setBooks] = useState<Book[]>(snap?.books || cached?.books || []);
  const [settings, setSettings] = useState<SiteSettings>(() => {
    const base = { ...(cached?.settings || DEFAULT_SETTINGS), ...(snap?.settings || {}) };
    const preview = isPreviewUrl() ? (window as any).__studioPreviewDesign : null;
    return preview ? { ...base, design: preview } : base;
  });
  const [pages, setPages] = useState<Page[]>(snap?.pages || cached?.pages || []);
  const [loading, setLoading] = useState(!cached && !snap);
  // True once this mount's own load has finished (cached content may be shown before that).
  const [fresh, setFresh] = useState(false);
  // The read failed (offline, blocked, refused): shown as an error with Retry, never as "not found".
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setLoadError(false); setFresh(false); setLoading(true); setAttempt(a => a + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    let failed = false;

    async function loadData() {
      try {
        // A shared preview link (Studio 3.4) loads alongside the shop data.
        const sharedPreview = loadThemePreview(publicApi.getThemePreview);
        const [bookResponse, settingsResponse, pagesResponse] = await loadSiteData();

        if (cancelled) return;

        const safeBooks = Array.isArray(bookResponse) ? (bookResponse as unknown as Book[]) : [];
        const isPreview = typeof window !== 'undefined' && window.location.search.includes('preview=true');
        const safeSettings = { ...(settingsResponse || DEFAULT_SETTINGS) } as any;
        
        // Never let the late Firestore load overwrite what the Studio has already sent.
        if (isPreview) {
          safeSettings.design = (window as any).__studioPreviewDesign || safeSettings.design;
        }

        // Scheduled publishing and campaigns are published into `design` by the server (Studio 3.5); nothing to apply here.
        // Share preview: this visitor sees the shared, unpublished design instead (never cached, never counted).
        const shared = isPreview ? null : await sharedPreview;
        if (cancelled) return;
        if (shared) safeSettings.design = withRisoNoirDefault(shared.design);
        const sharing = inThemePreview();

        const safePages = Array.isArray(pagesResponse) ? (pagesResponse as Page[]) : [];

        // Preview: whatever Studio already sent (all books, unsaved page edits, settings) wins.
        const snapNow = previewSnapshot();
        setBooks(snapNow?.books || safeBooks);
        setSettings(snapNow?.settings ? { ...safeSettings, ...snapNow.settings, design: safeSettings.design } : safeSettings);
        setPages(snapNow?.pages || safePages);
        if (!isPreview && !sharing) writeSiteCache({
          books: safeBooks, 
          settings: safeSettings, 
          pages: safePages,
          cachedAt: new Date().toISOString() 
        });

        const sessionKey = `fm_visit_${new Date().toISOString().split("T")[0]}`;
        if (!isPreview && !sharing && consentAllows("analytics") && !sessionStorage.getItem(sessionKey)) {
          publicApi.recordVisit();
          // Where the session came from and on what kind of screen (its own best-effort write).
          funnelApi.trackSession();
          sessionStorage.setItem(sessionKey, "true");
        }
      } catch {
        if (cancelled) return;
        failed = true;
        console.warn("Using fallback data - backend connection unavailable.");
        setLoadError(true);
      } finally {
        // A failed read is not a fresh answer: pages must not turn into "not found" (and noindex) because of it.
        if (!cancelled) { setLoading(false); setFresh(!failed); }
      }
    }

    loadData();

    // Live Preview Listener
    const handleMessage = (event: MessageEvent) => {
      // BroadcastChannel events have an empty origin; only enforce the origin
      // check for window postMessage events.
      if (new URLSearchParams(window.location.search).get("preview") !== "true") return;
      if (event.origin && (event.origin !== window.location.origin || (window.parent !== window && event.source !== window.parent))) return;
      if (!event.data) return;

      if (event.data.type === "BOOK_PREVIEW_UPDATE" && event.data.book) {
        setBooks((prev) => {
          const updatedBook = event.data.book;
          const index = prev.findIndex(b => b.id === updatedBook.id);
          if (index !== -1) {
            const newBooks = [...prev];
            newBooks[index] = { ...newBooks[index], ...updatedBook };
            return newBooks;
          } else {
            return [updatedBook, ...prev];
          }
        });
      }
    };

    window.addEventListener("message", handleMessage);
    // Studio's unsaved snapshot (previewTab.ts keeps it on window for pages that mount later).
    const stopPreview = subscribePreview((preview) => {
      if (preview.type === "STUDIO_PREVIEW_STATE") {
        setSettings((prev) => ({ ...prev, ...(preview.settings || {}), design: preview.design }));
        if (preview.books) setBooks(preview.books);
        if (preview.pages) setPages(preview.pages);
        setLoading(false);
      } else {
        setSettings((prev) => ({ ...prev, design: preview.design }));
      }
    });

    // BroadcastChannel for cross-tab updates. Preview only (shoppers never need it), and guarded
    // because some browsers have no BroadcastChannel — a throw here would take down the whole page.
    let bc: BroadcastChannel | null = null;
    if (isPreviewUrl() && typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("site_preview_updates");
        bc.onmessage = (event) => {
          handleMessage(event);
        };
      } catch {
        bc = null;
      }
    }

    return () => {
      cancelled = true;
      stopPreview();
      window.removeEventListener("message", handleMessage);
      try { bc?.close(); } catch { /* already closed */ }
    };
  }, [attempt]);

  // Site name / default title / share image (Studio › Text & labels › Site & sharing) feed every page's <head>.
  useEffect(() => { setSiteIdentity(settings.design); }, [settings.design]);
  // Studio › Style › Favicon on every storefront page, not only Home.
  useEffect(() => { applyFavicon(settings.design); }, [settings.design]);
  // Studio › Style › Custom code (public pages only; see customCode.ts).
  // Custom snippets are usually trackers: they wait for the shopper's analytics choice
  // and are re-applied the moment that choice changes.
  const [consentVersion, setConsentVersion] = useState(0);
  useEffect(() => {
    const bump = () => setConsentVersion(v => v + 1);
    window.addEventListener(CONSENT_EVENT, bump);
    return () => window.removeEventListener(CONSENT_EVENT, bump);
  }, []);
  useEffect(() => {
    applyCustomCode(consentAllows("analytics") ? settings.design : null, location.pathname);
  }, [settings.design, location.pathname, consentVersion]);
  // Google Analytics 4 (Settings › General › Google Analytics); lib/ga4.ts decides whether this visit may be counted.
  const ga4Id = (settings as any)?.analytics?.ga4MeasurementId;
  useEffect(() => { configureGa4(ga4Id); }, [ga4Id]);
  // Microsoft Clarity (Settings › General › Microsoft Clarity): same rule as Google, never on checkout/account/tracking.
  const clarityId = (settings as any)?.analytics?.clarityProjectId;
  useEffect(() => { configureClarity(clarityId); }, [clarityId]);

  // Shoppers only ever see live books. Drafts/scheduled books show only inside a real
  // Studio preview (the editor's snapshot is present) — "?preview=true" alone isn't enough.
  const studioPreview = isPreviewUrl() && Boolean((window as any).__studioPreviewState);
  const sellableBooks = useMemo(() => {
    const now = new Date().toISOString();
    const visible = studioPreview ? books : books.filter(book => isLiveBook(book as any, now));
    // Box sets show the stock their books allow (parts are read from the whole catalog, drafts included, like the server).
    return resolveProductRoutes(withBundleStock(visible, books)).map(applyBackorderPolicy);
  }, [books, studioPreview]);

  return { books: sellableBooks, settings: { ...settings, design: resolveSurfaceDesign(settings.design, location.pathname) }, pages, loading, fresh, loadError, retry };
}

/**
 * Design for chrome that renders outside the site-data pipeline (boot splash, cookie banner).
 * Reads the session cache written by useSiteData — no extra Firestore reads — and falls back
 * to the Riso Noir defaults on a first-ever visit.
 */
export function readCachedDesign(): Record<string, any> {
  const previewDesign = isPreviewUrl() ? (window as any).__studioPreviewDesign : null;
  const design = (previewDesign || readSiteCache()?.settings?.design) as Record<string, any> | undefined;
  const base = design && typeof design === "object" ? design : RISO_NOIR_TOKENS;
  return withRisoNoirDefault(base) || RISO_NOIR_TOKENS;
}

/**
 * readCachedDesign() that also follows Studio's unsaved design while previewing (cookie banner,
 * boot splash). Outside preview it is the cached published design, exactly as before.
 */
export function useLiveDesign(): Record<string, any> {
  const [design, setDesign] = useState<Record<string, any>>(() => readCachedDesign());
  // Live site: follow fresh settings as soon as they load (a first visit has no cache
  // yet, and a stale one could keep the under-construction wall up after it's switched off).
  useEffect(() => {
    if (isPreviewUrl()) return;
    const refresh = () => setDesign(readCachedDesign());
    window.addEventListener(SITE_CACHE_EVENT, refresh);
    return () => window.removeEventListener(SITE_CACHE_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (!isPreviewUrl()) return;
    const stop = subscribePreview((preview) => setDesign(withRisoNoirDefault(preview.design) || preview.design));
    // A snapshot that arrived between the first render and this effect is already on window.
    setDesign(readCachedDesign());
    return stop;
  }, []);
  return design;
}
