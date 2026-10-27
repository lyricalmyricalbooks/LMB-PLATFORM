// Studio › "View website" (also Find anything › View website): a full-screen, top-level storefront window showing the UNSAVED draft.
// Studio posts the same STUDIO_PREVIEW_STATE snapshot it sends its iframe onto a BroadcastChannel;
// this module re-dispatches it into the window as a same-origin message, so every existing preview
// receiver (useSiteData, MainSite, Checkout, useLiveDesign) works unchanged. At top level
// `window.parent === window`, so their `event.source === window.parent` checks hold.
// Only runs when the page is top-level AND the URL has ?preview=true — shoppers never receive anything,
// because nothing posts on the channel unless Studio is open in the same browser.

export const PREVIEW_CHANNEL = "studio_preview";

type Win = Window & typeof globalThis & { __studioPreviewTab?: boolean; __studioPreviewDesign?: any; __studioPreviewStatus?: StudioDraftStatus };

/** What the draft in Studio is compared with the live shop, sent with each snapshot for the tab's banner. */
export type StudioDraftStatus = "unsaved" | "draft" | "live";
const DRAFT_STATUSES: StudioDraftStatus[] = ["unsaved", "draft", "live"];

/** The status Studio last sent this tab (undefined until Studio has answered). */
export function studioDraftStatus(win: Window = window): StudioDraftStatus | undefined {
  return (win as Win).__studioPreviewStatus;
}

export function isPreviewTab(win: Window = window): boolean {
  try {
    return win.parent === win && new URLSearchParams(win.location.search).get("preview") === "true";
  } catch {
    return false;
  }
}

/** Keep ?preview=true on in-app navigation so the tab never drops back to the live design. */
function keepPreviewParam(win: Win) {
  (["pushState", "replaceState"] as const).forEach((method) => {
    const original = win.history[method].bind(win.history);
    win.history[method] = (state: any, title: string, url?: string | URL | null) => {
      if (url != null) {
        const next = new URL(String(url), win.location.href);
        if (next.origin === win.location.origin) {
          next.searchParams.set("preview", "true");
          url = next.pathname + next.search + next.hash;
        }
      }
      return original(state, title, url);
    };
  });
}

/** One Studio message the preview accepted: the full snapshot (STUDIO_PREVIEW_STATE) or a design-only update (THEME_UPDATE). */
export type PreviewMessage = {
  type: "STUDIO_PREVIEW_STATE" | "THEME_UPDATE";
  design: Record<string, any>;
  /** STUDIO_PREVIEW_STATE only. */
  settings?: Record<string, any>;
  books?: any[];
  pages?: any[];
  status?: StudioDraftStatus;
};
type PreviewListener = (message: PreviewMessage) => void;

const listeners = new Set<PreviewListener>();
const installed = new WeakSet<object>();
let latest: PreviewMessage | null = null;

const previewUrl = (win: Window) => {
  try { return new URLSearchParams(win.location.search).get("preview") === "true"; } catch { return false; }
};

/**
 * The one check every preview receiver shares: a same-origin message from the window that hosts this preview
 * (Studio's frame parent, or this tab itself when previewTab re-dispatches the BroadcastChannel copy), carrying a design.
 */
export function readPreviewMessage(event: MessageEvent, win: Window = window): PreviewMessage | null {
  if (!previewUrl(win) || event.origin !== win.location.origin || event.source !== win.parent) return null;
  const data = event.data;
  if (!data || (data.type !== "STUDIO_PREVIEW_STATE" && data.type !== "THEME_UPDATE") || !data.design || typeof data.design !== "object") return null;
  if (data.type === "THEME_UPDATE") return { type: data.type, design: data.design };
  return {
    type: data.type,
    design: data.design,
    settings: data.settings,
    books: Array.isArray(data.books) ? data.books : undefined,
    pages: Array.isArray(data.pages) ? data.pages : undefined,
    status: DRAFT_STATUSES.includes(data.studioStatus) ? data.studioStatus : undefined,
  };
}

function listen(win: Win): () => void {
  if (installed.has(win)) return () => {};
  installed.add(win);
  const onMessage = (event: MessageEvent) => {
    const message = readPreviewMessage(event, win);
    if (!message) return;
    if (message.type === "STUDIO_PREVIEW_STATE") {
      (win as any).__studioPreviewState = { settings: message.settings, books: message.books, pages: message.pages };
    }
    win.__studioPreviewDesign = message.design;
    if (win === (globalThis as any).window) {
      latest = message;
      listeners.forEach((fn) => fn(message));
    }
  };
  // Capture phase on window: runs before any component's own listener, so stored state is never behind.
  win.addEventListener("message", onMessage, true);
  return () => { win.removeEventListener("message", onMessage, true); installed.delete(win); };
}

/**
 * Studio preview (iframe or new tab): remember the newest snapshot from the very first message, before
 * React has mounted anything. Lazy pages (product, custom page, tracking, 404…) mount after the iframe's
 * load event — after Studio's first snapshot — and start from `__studioPreviewState`/`__studioPreviewDesign`,
 * so without this they showed the published design until the next edit. Returns a cleanup function.
 */
export function rememberPreviewSnapshot(win: Win = window as Win): () => void {
  if (!previewUrl(win)) return () => {};
  return listen(win);
}

/**
 * Every storefront part that follows Studio's unsaved design subscribes here instead of adding its own
 * `message` listener (one origin/sender check, one copy of the snapshot). The listener runs for each accepted
 * snapshot or design update; returns an unsubscribe function. Shoppers never receive anything.
 */
export function subscribePreview(fn: PreviewListener): () => void {
  if (typeof window !== "undefined") listen(window as Win);
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The newest accepted Studio message in this window, or null. */
export function latestPreview(): PreviewMessage | null {
  return latest;
}

/** Returns a cleanup function (used by tests); a no-op outside a preview tab. */
export function startPreviewTab(win: Win = window as Win): () => void {
  if (!isPreviewTab(win) || win.__studioPreviewTab || typeof win.BroadcastChannel === "undefined") return () => {};
  win.__studioPreviewTab = true;
  const origin = win.location.origin;
  const channel = new win.BroadcastChannel(PREVIEW_CHANNEL);

  channel.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || (data.type !== "STUDIO_PREVIEW_STATE" && data.type !== "THEME_UPDATE")) return;
    if (data.design && typeof data.design === "object") win.__studioPreviewDesign = data.design;
    if (DRAFT_STATUSES.includes(data.studioStatus)) win.__studioPreviewStatus = data.studioStatus;
    const Event = win.MessageEvent || MessageEvent;
    win.dispatchEvent(new Event("message", { data, origin, source: win }));
  };

  // Storefront pages announce PREVIEW_READY to window.parent — which is this window at top level.
  const onReady = (event: MessageEvent) => {
    if (event.data?.type === "PREVIEW_READY" && (!event.origin || event.origin === origin)) {
      channel.postMessage({ type: "PREVIEW_READY" });
    }
  };
  win.addEventListener("message", onReady);
  keepPreviewParam(win);
  channel.postMessage({ type: "PREVIEW_READY" });

  return () => {
    channel.close();
    win.removeEventListener("message", onReady);
    win.__studioPreviewTab = false;
  };
}
