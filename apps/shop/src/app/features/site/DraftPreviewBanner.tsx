import { useEffect, useState } from "react";
import { getCopy } from "./storeCopy";
import { useLiveDesign } from "./useSiteData";
import { isPreviewTab, studioDraftStatus, subscribePreview, type StudioDraftStatus } from "./previewTab";

/** How long the tab waits for Studio's first snapshot before saying it shows the live shop. */
export const STUDIO_ANSWER_MS = 4000;

const COPY_KEY: Record<StudioDraftStatus, string> = { unsaved: "draftPreviewUnsaved", draft: "draftPreviewSaved", live: "draftPreviewLive" };

/** Which banner line the tab shows: Studio's status, else "waiting", else (after the wait) "Studio isn't open". */
export function draftBannerKey(status: StudioDraftStatus | undefined, waitedLongEnough: boolean): string | null {
  if (status) return COPY_KEY[status];
  return waitedLongEnough ? "draftPreviewNoStudio" : null;
}

/**
 * Studio › View website opens the shop in a new tab with the draft (features/site/previewTab.ts). This banner tells
 * the owner what they are looking at: their unsaved or saved draft, the live shop (nothing to publish), or the live
 * shop because Studio isn't open. It only exists in that top-level ?preview=true tab — never for shoppers and never
 * inside Studio's own preview frame. Words: Studio › Text & labels › Site & sharing (`draftPreview*`).
 */
export function DraftPreviewBanner() {
  const tab = isPreviewTab();
  const design = useLiveDesign();
  const [status, setStatus] = useState<StudioDraftStatus | undefined>(() => (tab ? studioDraftStatus() : undefined));
  const [waited, setWaited] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!tab) return;
    const stop = subscribePreview((preview) => { if (preview.type === "STUDIO_PREVIEW_STATE") setStatus(studioDraftStatus()); });
    const timer = window.setTimeout(() => setWaited(true), STUDIO_ANSWER_MS);
    return () => { stop(); window.clearTimeout(timer); };
  }, [tab]);
  // Only a tab Studio opened (it has an opener) says "Studio isn't open": a visitor who typed ?preview=true sees nothing.
  const fromStudio = tab && (() => { try { return Boolean(window.opener); } catch { return false; } })();
  const key = tab ? draftBannerKey(status, waited && fromStudio) : null;
  if (!key || hidden) return null;
  return (
    <div role="status" data-draft-preview-banner={status || "no-studio"} data-studio-target="copy:Site & sharing" data-studio-label="Draft preview banner"
      style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 9995, display: "flex", flexWrap: "wrap", alignItems: "center",
        justifyContent: "space-between", gap: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700,
        background: "var(--accent, #e8402a)", color: "var(--on-accent, #100f0d)", border: "2px solid var(--fg, #ffffff)" }}>
      <span>{getCopy(design, key)}</span>
      <button type="button" onClick={() => setHidden(true)}
        style={{ minHeight: 40, padding: "6px 14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
          background: "var(--fg, #ffffff)", color: "var(--bg, #000000)", border: "2px solid var(--fg, #ffffff)", cursor: "pointer" }}>
        {getCopy(design, "draftPreviewHide")}
      </button>
    </div>
  );
}
