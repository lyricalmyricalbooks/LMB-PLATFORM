import { type RefObject, useLayoutEffect } from "react";

/** The CSS variable holding how far down the stuck header reaches (0px when it scrolls away). */
export const HEADER_OFFSET_VAR = "--fm-header-offset";

/**
 * Where a sticky header's bottom edge sits once it has stuck: its own `top` (the announcement
 * bar above it in the shop layout) plus its height. A header that scrolls away covers nothing.
 */
export function stuckHeaderBottom(position: string, top: string, height: number): number {
  if (position !== "sticky" && position !== "fixed") return 0;
  return Math.max(0, Math.round((parseFloat(top) || 0) + height));
}

/**
 * Publishes the stuck header's bottom edge on <html> as `--fm-header-offset`, so anything else that
 * sticks (the book page's buy card) or scrolls to an anchor (`scroll-padding-top`) clears it. Re-measured
 * whenever the header changes size (a wrapped menu row, a phone layout) and when `layoutKey` changes
 * (sticky switched on/off, the announcement bar above it appearing).
 */
export function useHeaderOffset(ref: RefObject<HTMLElement | null>, layoutKey: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      const style = getComputedStyle(el);
      root.style.setProperty(HEADER_OFFSET_VAR, `${stuckHeaderBottom(style.position, style.top, el.offsetHeight)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty(HEADER_OFFSET_VAR);
    };
  }, [ref, layoutKey]);
}
