import { type RefObject, useEffect } from "react";
import { HEADER_OFFSET_VAR, stuckHeaderBottom } from "./headerOffset";

/** How far (px) the page must move in one direction before the header hides or comes back. */
export const REVEAL_THRESHOLD = 8;

export type RevealInput = {
  /** Style › Header › "Hide the header while scrolling down" and the header is sticky. */
  enabled: boolean;
  hidden: boolean;
  y: number;
  lastY: number;
  /** Where the header's bottom edge sits when shown: it never hides before the page has passed it. */
  headerBottom: number;
  /** Keyboard focus or an open drop-down inside the header keeps it on screen. */
  busy: boolean;
};

/** Shopify's "sticky header on scroll up": hide while scrolling down, come back on any scroll up. */
export function nextHeaderHidden({ enabled, hidden, y, lastY, headerBottom, busy }: RevealInput): boolean {
  if (!enabled || busy || y <= headerBottom) return false;
  const delta = y - lastY;
  if (delta > REVEAL_THRESHOLD) return true;
  if (delta < -REVEAL_THRESHOLD) return false;
  return hidden;
}

/**
 * Slides a sticky header out of view while the shopper scrolls down and back on scroll up. Writes only
 * the header's own transform and `--fm-header-offset` (0px while hidden, so the book page's sticky buy
 * card moves up into the freed space). Off = nothing is attached and the header behaves as before.
 */
export function useHeaderReveal(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof window === "undefined") return;
    const root = document.documentElement;
    let lastY = window.scrollY;
    let hidden = false;
    let frame = 0;
    const apply = (next: boolean) => {
      if (next === hidden) return;
      hidden = next;
      const style = getComputedStyle(el);
      const bottom = stuckHeaderBottom(style.position, style.top, el.offsetHeight);
      el.style.transform = hidden ? `translateY(-${bottom}px)` : "";
      if (hidden) el.setAttribute("data-fm-header-hidden", "");
      else el.removeAttribute("data-fm-header-hidden");
      root.style.setProperty(HEADER_OFFSET_VAR, `${hidden ? 0 : bottom}px`);
    };
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      const busy = el.contains(document.activeElement) || !!el.querySelector("[aria-expanded='true']");
      const style = getComputedStyle(el);
      const headerBottom = stuckHeaderBottom(style.position, style.top, el.offsetHeight);
      apply(nextHeaderHidden({ enabled: true, hidden, y, lastY, headerBottom, busy }));
      lastY = y;
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    const onFocus = () => apply(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("focusin", onFocus);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("focusin", onFocus);
      apply(false);
    };
  }, [ref, enabled]);
}

/** Smooth slide (none under reduced motion); the shop header already transitions everything. */
export const HEADER_REVEAL_CSS =
  "[data-fm-header]:not(.transition-all){transition:transform .3s ease}@media (prefers-reduced-motion:reduce){[data-fm-header]{transition:none!important}}";
