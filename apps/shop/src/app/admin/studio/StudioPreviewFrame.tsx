import { useEffect, useRef, useState, type ReactNode } from "react";
import { fitScale, type Zoom } from "./studioUiState";

/**
 * Holds the preview iframe at the device's real width (so the shop picks the right phone/tablet
 * layout) and scales it to fit the space, or to a chosen zoom. 100% scrolls instead of shrinking.
 */
export function StudioPreviewFrame({ deviceWidth, zoom, loading = false, loadingText = "", children }: { deviceWidth: number; zoom: Zoom; loading?: boolean; loadingText?: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = zoom === "fit" ? fitScale(box.width - 2, deviceWidth) : zoom / 100;
  const height = Math.max(240, box.height);
  return (
    <div className="studio-preview-wrap">
    <div className="studio-preview-viewport" ref={viewport} data-zoom={zoom}>
      <div className="studio-preview-stage" style={{ width: deviceWidth * scale, height }}>
        <div className="studio-preview-frame" data-scale={scale.toFixed(3)}
          style={{ width: deviceWidth, minWidth: deviceWidth, height: height / scale, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
    {/* Shown from the start, until the shop page reports ready, so the canvas is never an unexplained blank. The
        status line above already announces loading, so this is for sight only. */}
    {loading && <div className="studio-preview-loading" aria-hidden="true" data-studio-preview-loading>{loadingText}</div>}
    </div>
  );
}
