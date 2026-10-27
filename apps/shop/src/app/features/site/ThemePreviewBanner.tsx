import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { getCopy } from "./storeCopy";
import { exitThemePreview, inThemePreview, THEME_PREVIEW_EVENT, themePreviewState, type ThemePreviewState } from "./themePreview";

/**
 * Shown while someone opens a shared preview link (Studio 3.4): says the design isn't live yet (or that the link
 * expired) and offers Exit preview. It can't be hidden — visitors must always know they're seeing a preview. Words:
 * Studio › Text & labels › Site & sharing (`themePreview*`).
 */
export function ThemePreviewBanner() {
  const location = useLocation();
  const [state, setState] = useState<ThemePreviewState | null>(() => themePreviewState());
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent).detail || themePreviewState());
    window.addEventListener(THEME_PREVIEW_EVENT, on);
    setState(themePreviewState());
    return () => window.removeEventListener(THEME_PREVIEW_EVENT, on);
  }, []);
  if (location.pathname.startsWith("/admin") || (!state && !inThemePreview()) || state?.status === "loading" || !state) return null;
  const design = state.preview?.design;
  const text = state.status === "ready"
    ? getCopy(design, "themePreviewNotice").replace("{design}", state.preview!.name)
    : getCopy(design, "themePreviewExpired");
  return (
    <div role="status" data-theme-preview-banner data-studio-target="copy:Site & sharing" data-studio-label="Preview link banner"
      style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 9995, display: "flex", flexWrap: "wrap", alignItems: "center",
        justifyContent: "space-between", gap: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700,
        background: "var(--accent, #e8402a)", color: "var(--on-accent, #100f0d)", border: "2px solid var(--fg, #ffffff)" }}>
      <span>{text}</span>
      <button type="button" onClick={exitThemePreview}
        style={{ minHeight: 40, padding: "6px 14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
          background: "var(--fg, #ffffff)", color: "var(--bg, #000000)", border: "2px solid var(--fg, #ffffff)", cursor: "pointer" }}>
        {getCopy(design, "themePreviewExit")}
      </button>
    </div>
  );
}
