import { useEffect, useRef } from "react";

export type StudioOverlay = "cart" | "search" | "popup" | "cookie";

/**
 * Studio's page structure can open a pop-over (shopping bag, search) inside the preview so the
 * owner can see and style it ("popup" is the pop-up section group). The preview bridge dispatches `fm:studio-open-overlay`; outside the
 * preview nothing sends it, so shoppers are unaffected. "close" closes every pop-over.
 */
export function useStudioOverlay(name: StudioOverlay, setOpen: (open: boolean) => void) {
  const latest = useRef(setOpen); latest.current = setOpen;
  useEffect(() => {
    const on = (e: Event) => {
      const overlay = (e as CustomEvent).detail?.overlay;
      if (overlay === name) latest.current(true);
      else if (overlay) latest.current(false);
    };
    window.addEventListener("fm:studio-open-overlay", on);
    // A request that arrived before this pop-over mounted (the preview was still loading) still applies:
    // the preview bridge remembers the last one in window.__studioOpenOverlay.
    if ((window as any).__studioOpenOverlay === name) latest.current(true);
    return () => window.removeEventListener("fm:studio-open-overlay", on);
  }, [name]);
}
