import { useEffect, useState, type RefObject } from "react";

/**
 * Product page photos stay in view while a taller buy column scrolls past (plan "Starters on par", step 1). Without it
 * the photo column ended halfway down and left a tall empty space beside "Frequently bought together" and the tabs.
 * Photos taller than the screen never stick: their lower part (thumbnails) would be unreachable until the page ends.
 */
export const STICKY_PHOTO_LAYOUTS = ["", "open"] as const;

export function photosShouldStick(photoHeight: number, infoHeight: number, viewportHeight: number, topOffset: number): boolean {
  if (!(photoHeight > 0) || !(viewportHeight > 0)) return false;
  return photoHeight + topOffset <= viewportHeight && infoHeight > photoHeight + 40;
}

/** Watches the photo and buy columns on computers; true when the photos should stick. */
export function useStickyPhotos(photos: RefObject<HTMLElement | null>, info: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [stick, setStick] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof ResizeObserver === "undefined") { setStick(false); return; }
    const wide = window.matchMedia?.("(min-width:1024px)");
    const check = () => {
      const p = photos.current, i = info.current;
      if (!p || !i || (wide && !wide.matches)) { setStick(false); return; }
      const offset = parseFloat(getComputedStyle(p).getPropertyValue("--fm-header-offset")) || 0;
      setStick(photosShouldStick(p.offsetHeight, i.offsetHeight, window.innerHeight, offset + 24));
    };
    const ro = new ResizeObserver(check);
    if (photos.current) ro.observe(photos.current);
    if (info.current) ro.observe(info.current);
    window.addEventListener("resize", check);
    check();
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, [enabled, photos, info]);
  return stick;
}
