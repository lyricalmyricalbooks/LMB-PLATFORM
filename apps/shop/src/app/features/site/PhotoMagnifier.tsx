import { useEffect, useRef, useState, type ReactNode } from "react";
import { magnifierOrigin } from "./photoMagnifier";

/**
 * Wraps one book-page photo: with a mouse (fine pointer that can hover), the photo grows `level` times from
 * the point under the pointer and follows it; it settles back when the mouse leaves or a button is pressed
 * (so dragging the photo strip still swipes). Touch screens and keyboards see the photo unchanged. Styles are
 * written straight to the element, so moving the mouse never re-renders the page. `on` false = a plain box.
 */
export function PhotoMagnifier({ on, level, children }: { on: boolean; level: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    if (!on || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setCanHover(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [on]);

  const active = on && canHover;
  const zoomTo = (e: React.PointerEvent) => {
    const el = inner.current, frame = box.current;
    if (!el || !frame) return;
    if (e.pointerType !== "mouse" || e.buttons !== 0) { reset(); return; }
    const { x, y } = magnifierOrigin(e.clientX, e.clientY, frame.getBoundingClientRect());
    el.style.transformOrigin = `${x}% ${y}%`;
    el.style.transform = `scale(${level})`;
    frame.dataset.fmZoomed = "true";
  };
  const reset = () => {
    const el = inner.current;
    if (el) { el.style.transform = ""; }
    if (box.current) delete box.current.dataset.fmZoomed;
  };

  if (!active) return <>{children}</>;
  return (
    <div
      ref={box}
      className="fm-pdp-magnifier relative w-full h-full overflow-hidden"
      style={{ cursor: "zoom-in" }}
      data-fm-magnifier
      onPointerEnter={zoomTo}
      onPointerMove={zoomTo}
      onPointerLeave={reset}
      onPointerDown={reset}
    >
      <div ref={inner} className="w-full h-full motion-reduce:transition-none" style={{ transition: "transform 0.12s ease-out", willChange: "transform" }}>
        {children}
      </div>
    </div>
  );
}
