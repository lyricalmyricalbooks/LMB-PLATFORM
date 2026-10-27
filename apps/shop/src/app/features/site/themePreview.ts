// Share previews (Studio 3.4): a private link `?themePreview=<token>` shows the shop with an unpublished design so
// the owner can send it to someone before publishing. The design lives in `previewTokens/{token}` (readable by its
// exact id while unexpired — firestore.rules; never listed publicly). While a preview is on, the shop shows a banner,
// is marked noindex and records no analytics; it stays on across in-shop navigation (sessionStorage) until the visitor
// chooses Exit preview. Checkout, prices and stock are untouched: only how the shop looks changes.

export const THEME_PREVIEW_PARAM = "themePreview";
export const THEME_PREVIEW_KEY = "lm:theme-preview";
export const THEME_PREVIEW_EVENT = "lm:theme-preview";
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export const isPreviewToken = (value: unknown): value is string => typeof value === "string" && TOKEN_RE.test(value);
/** Links found expired or removed in this page load: never remembered for the rest of the visit. */
const expiredTokens = new Set<string>();

/** The preview token for this visit: from the link, else remembered for this tab. Null when there is none. */
export function themePreviewToken(): string | null {
  if (typeof window === "undefined") return null;
  // Never inside the Studio editor preview: that one shows the editor's own draft.
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "true") return null;
  const fromUrl = params.get(THEME_PREVIEW_PARAM);
  if (isPreviewToken(fromUrl)) {
    if (!expiredTokens.has(fromUrl)) { try { sessionStorage.setItem(THEME_PREVIEW_KEY, fromUrl); } catch { /* storage blocked: the link still works */ } }
    return fromUrl;
  }
  try {
    const kept = sessionStorage.getItem(THEME_PREVIEW_KEY);
    return isPreviewToken(kept) ? kept : null;
  } catch { return null; }
}

export const inThemePreview = () => themePreviewToken() !== null;

export type ThemePreview = { name: string; design: any; expiresAt: number };
export type ThemePreviewState = { status: "loading" | "ready" | "expired"; preview?: ThemePreview };

/** Turns a Firestore preview record into a usable preview, or null when it is missing, malformed or expired. */
export function readPreviewRecord(data: any, now = Date.now()): ThemePreview | null {
  if (!data || typeof data !== "object" || !data.design || typeof data.design !== "object") return null;
  const raw = data.expiresAt;
  const expiresAt = typeof raw?.toMillis === "function" ? raw.toMillis() : typeof raw?.seconds === "number" ? raw.seconds * 1000 : Date.parse(String(raw));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { name: String(data.name || "Unpublished design").slice(0, 80), design: data.design, expiresAt };
}

let state: ThemePreviewState | null = null;
let request: Promise<ThemePreview | null> | null = null;
const announce = () => { try { window.dispatchEvent(new CustomEvent(THEME_PREVIEW_EVENT, { detail: state })); } catch { /* no window */ } };
export const themePreviewState = () => state;

/**
 * Loads the shared design once per page load. `fetchRecord` reads `previewTokens/{token}` (publicApi). An expired,
 * removed or unreadable link falls back to the live shop and says so in the banner.
 */
export function loadThemePreview(fetchRecord: (token: string) => Promise<any>): Promise<ThemePreview | null> {
  const token = themePreviewToken();
  if (!token) return Promise.resolve(null);
  if (!request) {
    state = { status: "loading" }; announce();
    request = fetchRecord(token).then(data => readPreviewRecord(data), () => null).then(preview => {
      state = preview ? { status: "ready", preview } : { status: "expired" };
      if (!preview) { expiredTokens.add(token); try { sessionStorage.removeItem(THEME_PREVIEW_KEY); } catch { /* ignore */ } }
      announce();
      return preview;
    });
  }
  return request;
}

/** Leaves the preview: forgets the token and reloads the page without it. */
export function exitThemePreview() {
  try { sessionStorage.removeItem(THEME_PREVIEW_KEY); } catch { /* ignore */ }
  const url = new URL(window.location.href);
  url.searchParams.delete(THEME_PREVIEW_PARAM);
  window.location.replace(url.toString());
}

/** For tests. */
export function resetThemePreview() { state = null; request = null; expiredTokens.clear(); }
