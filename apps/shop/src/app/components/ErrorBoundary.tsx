import { regionProps } from "../features/site/storefrontRegions";
import { Component, type ReactNode } from "react";
import { getCopy } from "../features/site/storeCopy";
import { SITE_CACHE_KEY } from "../features/site/constants";
import { StorefrontThemeStyle } from "../features/site/StorefrontThemeStyle";
import { reportClientError } from "../lib/errorReport";
import { subscribePreview } from "../features/site/previewTab";

// The boundary sits above the data providers, so it reads the last-seen design from the site cache.
function cachedDesign(): any {
  try { return (window.location.search.includes("preview=true") ? (window as any).__studioPreviewDesign : null)
    || JSON.parse(sessionStorage.getItem(SITE_CACHE_KEY) || "null")?.settings?.design || {}; } catch { return {}; }
}

/**
 * Last-resort guard so a rendering error shows a readable message instead of a blank page.
 * Inside the Studio preview iframe it also tells the editor what went wrong (PREVIEW_ERROR).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  // Studio preview: the next unsaved snapshot retries the page, so fixing the setting that broke it
  // brings the preview back without a reload (the snapshot itself is kept by rememberPreviewSnapshot).
  private stopPreview?: () => void;

  componentDidMount() {
    this.stopPreview = subscribePreview(() => { if (this.state.error) this.setState({ error: null }); });
  }

  componentWillUnmount() {
    this.stopPreview?.();
  }

  componentDidCatch(error: Error) {
    console.error("Storefront render error:", error);
    reportClientError("page", error);
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "PREVIEW_ERROR", message: String(error?.message || error) }, window.location.origin);
      }
    } catch { /* ignore */ }
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey?: string }>) {
    // A render failure on one route must not poison every later route. This is
    // especially important at checkout: the shopper must always be able to
    // return to the store without a full reload or losing their in-memory bag.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const inPreview = typeof window !== "undefined" && window.location.search.includes("preview=true");
    return (
      <div {...regionProps("errorPanel")} data-fm-store role="alert" style={{ minHeight: "100vh", background: "var(--bg-color, #000)", color: "var(--text-color, #fff)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <StorefrontThemeStyle design={cachedDesign()} />
        <p {...regionProps("errorHeading")} style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase" }}>{getCopy(cachedDesign(), "errorTitle")}</p>
        <button onClick={() => window.location.reload()} style={{ border: "2px solid var(--rp-outline, #fff)", background: "var(--accent, #e8402a)", color: "var(--on-accent, #100f0d)", padding: "10px 20px", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 11 }}>
          {getCopy(cachedDesign(), "errorReload")}
        </button>
        {inPreview && <pre style={{ maxWidth: 560, whiteSpace: "pre-wrap", fontSize: 11, opacity: 0.7 }}>{String(this.state.error?.message || this.state.error)}</pre>}
      </div>
    );
  }
}
