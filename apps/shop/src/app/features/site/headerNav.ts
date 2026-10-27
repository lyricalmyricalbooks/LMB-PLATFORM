import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Shared nav-link look for the one storefront header (StoreHeader: shop mode in MainSite and
 * page mode on every standalone page) so both stay identical. Every value is a
 * Studio › Style › Navigation links control; the fallbacks are the defaults.
 */
/**
 * Colour of the link for the page the shopper is on — Studio › Style › Navigation links ›
 * "Current page link color" (`navLinkActiveColor`); empty = the site's link hover colour.
 */
export const navActiveColor = (design: any): string =>
  design?.navLinkActiveColor || "var(--link-hover-color, var(--accent))";

export function navLinkStyle(design: any, active: boolean, color?: string): CSSProperties {
  const d = design || {};
  const idle = Math.max(0.1, Math.min(1, Number(d.navLinkOpacity ?? 0.6)));
  return {
    color: active ? navActiveColor(d) : d.navLinkColor || color,
    // Scaled by --nav-fit when "Shrink to fit on one line" is on (see useNavFit).
    fontSize: `calc(${Number(d.navLinkSize ?? 11)}px * var(--nav-fit, 1))`,
    fontWeight: Number(d.navLinkWeight ?? 800),
    letterSpacing: `${d.navLinkSpacing ?? 0.22}em`,
    // "" = Inherit (the surrounding text's case); only an unset value falls back to uppercase.
    textTransform: (d.navLinkTransform ?? "uppercase") as CSSProperties["textTransform"],
    opacity: active ? 1 : idle,
    whiteSpace: "nowrap",
  };
}

/**
 * The Reference shop header keeps its own bold look (large text, header colour) and only takes the
 * Navigation links values the owner actually set, so an untouched design looks exactly as before.
 */
export function ownNavLinkStyle(design: any, active: boolean): CSSProperties {
  const d = design || {};
  const set = (v: any) => v !== undefined && v !== null && v !== "";
  const style: CSSProperties = {};
  const color = active ? d.navLinkActiveColor || d.navLinkColor : d.navLinkColor;
  if (color) style.color = color;
  if (set(d.navLinkSize)) style.fontSize = `${Number(d.navLinkSize)}px`;
  if (set(d.navLinkWeight)) style.fontWeight = Number(d.navLinkWeight);
  if (set(d.navLinkSpacing)) style.letterSpacing = `${d.navLinkSpacing}em`;
  if (set(d.navLinkTransform)) style.textTransform = d.navLinkTransform as CSSProperties["textTransform"];
  if (!active && set(d.navLinkOpacity)) style.opacity = Math.max(0.1, Math.min(1, Number(d.navLinkOpacity)));
  return style;
}

/**
 * Studio › Style › Layout & spacing › "Use the full screen width" (`fullWidth`, off by default):
 * every storefront column (header, shop grid, book pages, custom pages, footer) stops capping its
 * width and runs to the screen edges, keeping only the usual side padding.
 */
export const isFullWidth = (design: any): boolean => design?.fullWidth === true;

/**
 * Width of the storefront content column — Studio › Style › Layout › "Content width"
 * (`containerWidth`), or "100%" while "Use the full screen width" is on. The header, product
 * page and shop grid all use it so their left edges line up with the logo. Bounds = the Studio slider's
 * (800–2560px): the old 900–1600 clamp made the slider's ends do nothing.
 */
export const CONTENT_WIDTH_MIN = 800;
export const CONTENT_WIDTH_MAX = 2560;
export const contentWidthPx = (design: any): number => {
  const n = Number(design?.containerWidth ?? 1200);
  return Number.isFinite(n) ? Math.max(CONTENT_WIDTH_MIN, Math.min(CONTENT_WIDTH_MAX, n)) : 1200;
};
/**
 * Style › Layout & spacing › "How the content width is set" (`contentWidthMode`):
 * "fixed" (default) = Content width in px; "margins" = a side margin as a share of the screen
 * (`contentSideMargin`, 0–20%), so the column keeps the same proportions on a laptop and a big monitor.
 * The margin never squeezes the column below 320px, and phones keep their own padding.
 */
export const contentWidthMode = (design: any): "fixed" | "margins" =>
  design?.contentWidthMode === "margins" ? "margins" : "fixed";
export const contentSideMargin = (design: any): number => {
  const n = Number(design?.contentSideMargin ?? 5);
  return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 5;
};
export const marginWidthCss = (design: any): string => {
  const m = contentSideMargin(design);
  return m === 0 ? "100%" : `min(100%, max(320px, calc(100% - ${2 * m}vw)))`;
};
export const contentMaxWidth = (design: any): number | string =>
  isFullWidth(design) ? "100%" : contentWidthMode(design) === "margins" ? marginWidthCss(design) : contentWidthPx(design);

/** Catalog masthead / shop grid width (Catalog layout › Header width), full width when that switch is on. */
export const catalogHeaderMaxWidth = (design: any): number | string =>
  isFullWidth(design) ? "100%"
    : contentWidthMode(design) === "margins" ? marginWidthCss(design)
    : design?.catalogHeaderWidth != null && Number.isFinite(Number(design.catalogHeaderWidth)) ? Math.max(900, Math.min(2560, Number(design.catalogHeaderWidth)))
    : contentWidthPx(design);

/** Gap between header nav links (px). */
export const navGap = (design: any) => Math.max(4, Math.min(64, Number(design?.navGap ?? 28)));

/**
 * Studio › Style › Navigation links › "When links don't fit on one line" (`navLineMode`):
 * fit (default) shrinks text + spacing so every link stays on one line; scroll keeps one line and
 * scrolls sideways; wrap lets links flow onto a second line.
 */
export const navLineMode = (design: any): "fit" | "scroll" | "wrap" =>
  design?.navLineMode === "wrap" || design?.navLineMode === "scroll" ? design.navLineMode : "fit";

/** Smallest shrink "fit" will apply (as a share of the chosen size); beyond it the row scrolls. */
export const navFitMin = (design: any) => Math.max(0.5, Math.min(1, Number(design?.navFitMin ?? 70) / 100));

/** Gap as CSS, scaled with the link text in "fit" mode. */
export const navGapCss = (design: any) => `calc(${navGap(design)}px * var(--nav-fit, 1))`;

/** Shrink factor that makes the nav's natural width fit its row (1 = no shrink). */
export function fitScale(naturalWidth: number, available: number, min = 0.7): number {
  if (!(naturalWidth > 0) || !(available > 0) || naturalWidth <= available) return 1;
  return Math.max(min, Math.floor((available / naturalWidth) * 100) / 100);
}

/** Width from the first link's left edge to the last link's right edge (overflow included). */
function linksExtent(nav: HTMLElement): number {
  const first = nav.firstElementChild, last = nav.lastElementChild;
  if (!first || !last) return 0;
  return Math.max(0, last.getBoundingClientRect().right - first.getBoundingClientRect().left);
}

/**
 * The bar's unshrunk width. On its own row the bar is a block-level flex box that always fills the
 * row, so its box width (scrollWidth when nothing overflows) says nothing about the links: measure the
 * links' extent instead (it includes any overflow). Dividing the box width by the current shrink used
 * to shrink the links ~1% more on every font load or resize, even with room to spare.
 */
export function naturalNavWidth(scrollWidth: number, extent: number, current: number): number {
  return (extent > 0 ? extent : scrollWidth) / (current || 1);
}

/** Classes + style for the nav element for the chosen line mode. */
export function navLineProps(design: any, below: boolean, fit: number) {
  const mode = navLineMode(design);
  const cls = !below ? "flex-nowrap" : mode === "wrap" ? "max-w-full flex-wrap gap-y-3 py-3" : "max-w-full flex-nowrap py-3 overflow-x-auto";
  return { className: cls, style: { columnGap: navGapCss(design), ["--nav-fit" as any]: String(fit) } };
}

/** Measures the nav and returns the --nav-fit factor for "fit" mode (only when it sits on its own row). */
export function useNavFit(design: any, navRef: RefObject<HTMLElement | null>, below: boolean) {
  const mode = navLineMode(design);
  const min = navFitMin(design);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    if (mode !== "fit" || !below) { setFit(1); return; }
    const nav = navRef.current;
    if (!nav) return;
    let current = 1;
    const measure = () => {
      const parent = nav.parentElement;
      if (!parent) return;
      const ps = getComputedStyle(parent);
      const avail = parent.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
      // text + gaps scale linearly with --nav-fit
      const natural = naturalNavWidth(nav.scrollWidth, linksExtent(nav), current);
      const next = fitScale(natural, avail - 2, min);
      if (Math.abs(next - current) >= 0.01) { current = next; setFit(next); }
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (nav.parentElement) ro?.observe(nav.parentElement);
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", measure);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); fonts?.removeEventListener?.("loadingdone", measure); window.removeEventListener("resize", measure); };
  }, [mode, min, below, navRef, design?.navLinkSize, design?.navGap, design?.navLinkSpacing]);
  return fit;
}

const HEADER_FIT_BUFFER = 96;

/** Keep the fit decision small and deterministic so late font/layout changes can be retested. */
export function navNeedsOwnRow(navWidth: number, fixedWidth: number, availableWidth: number) {
  return navWidth + fixedWidth + HEADER_FIT_BUFFER > availableWidth;
}

/**
 * Decide whether the category bar fits on the header's single line.
 * Studio › Style › Navigation links › "Category bar position": auto (default) moves
 * the bar to its own full-width row only when the links would collide with the
 * logo/icons; "inline" and "below" force a placement.
 * Mark the logo and right-hand controls with `data-hdr-fixed`; pass the nav ref.
 */
export function useNavBelow(design: any, rowRef: RefObject<HTMLElement | null>, navRef: RefObject<HTMLElement | null>) {
  const mode = design?.navPlacement || "auto";
  // Auto starts on the safe row. The first layout measurement may move it inline,
  // but a slow webfont or restored page data can never briefly make links overlap
  // the account/currency/cart controls.
  const [below, setBelow] = useState(mode !== "inline");
  useLayoutEffect(() => {
    if (mode !== "auto") { setBelow(mode === "below"); return; }
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      let fixedWidth = 0;
      // Only count top-level fixed regions. A right-positioned logo is itself
      // marked fixed inside the fixed controls region and must not be counted twice.
      row.querySelectorAll<HTMLElement>(":scope > * [data-hdr-fixed], :scope > [data-hdr-fixed]").forEach((el) => {
        if (!el.parentElement?.closest("[data-hdr-fixed]")) fixedWidth += el.offsetWidth;
      });
      const styles = getComputedStyle(row);
      const avail = row.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      setBelow(navNeedsOwnRow(nav.scrollWidth, fixedWidth, avail));
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(row);
    if (navRef.current) ro?.observe(navRef.current);
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure);
    if (navRef.current) mo?.observe(navRef.current, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", measure);

    // Font swaps alter text width without reliably resizing an already constrained
    // nav box. Recheck both the initial font-ready promise and later font loads.
    let cancelled = false;
    const fonts = document.fonts;
    fonts?.ready.then(() => { if (!cancelled) measure(); });
    fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
      fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [mode, rowRef, navRef]);
  return below;
}

/**
 * Style › Navigation links › Sticker pill corner shape. Bare numbers ("12", "14 4") mean pixels, so a
 * shop owner who types a number gets rounded corners instead of invalid CSS (square corners).
 */
export function pillRadius(value: any): string {
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!text) return "14px 4px 14px 4px";
  return text.split(/\s+/).map(part => /^\d+(\.\d+)?$/.test(part) ? `${part}px` : part).join(" ");
}
