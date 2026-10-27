// The book page's thumbnail strip (`.fm-pdp-rail`). When Studio's "Stretch thumbnails to fill the width"
// is on and the strip runs sideways (under the photo, or beside it on a phone), it measures itself and
// sizes the thumbnails so every row reaches both edges (rules in thumbStrip.ts, CSS in productPageStyle.ts).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PHONE_MAX } from "./breakpoints";
import { thumbLastRow, thumbLayout, type ThumbLayout } from "./thumbStrip";

type Props = {
  count: number;
  position: string;   // pdpThumbPosition: side | below
  fill: boolean;
  wrap: boolean;
  size: number;
  gap: number;
  perRow: number;
  ratio: number;
  lastRow: unknown;
  ariaLabel: string;
  children: ReactNode;
};

export function ThumbStrip({ count, position, fill, wrap, size, gap, perRow, ratio, lastRow, ariaLabel, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<ThumbLayout | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!fill || !el || typeof window === "undefined") { setLayout(null); return; }
    const phone = typeof window.matchMedia === "function" ? window.matchMedia(`(max-width:${PHONE_MAX}px)`) : null;
    const measure = () => {
      const sideways = position === "below" || !!phone?.matches;
      const width = el.clientWidth;
      const next = sideways ? thumbLayout({ count, width, size, gap, perRow, wrap, ratio }) : null;
      setLayout((prev) => (prev && next && prev.cols === next.cols && Math.abs(prev.cellHeight - next.cellHeight) < 0.5) || (!prev && !next) ? prev : next);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    phone?.addEventListener?.("change", measure);
    return () => { observer?.disconnect(); phone?.removeEventListener?.("change", measure); };
  }, [count, position, fill, wrap, size, gap, perRow, ratio]);

  return (
    <div
      ref={ref}
      className="fm-pdp-rail"
      role="group"
      aria-label={ariaLabel}
      data-fill={layout ? (wrap ? "wrap" : "line") : undefined}
      data-last-row={layout && wrap ? thumbLastRow(lastRow) : undefined}
      style={layout ? ({ "--thumb-cols": layout.cols, "--thumb-h": `${layout.cellHeight.toFixed(2)}px` } as any) : undefined}
    >
      {children}
    </div>
  );
}
