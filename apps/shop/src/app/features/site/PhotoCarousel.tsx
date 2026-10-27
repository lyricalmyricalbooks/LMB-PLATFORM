import { useEffect, useRef, type ReactNode } from "react";

/**
 * Instagram-style photo strip: every photo sits side by side in one row that scrolls sideways and snaps
 * to whole photos. Phones and trackpads swipe it natively (the photo follows the finger); a mouse can drag
 * it (`dragPlan` decides where it lands). Shared by the book page's main photo and the enlarged viewer.
 * `index` is controlled: arrows, thumbnails and dots set it and the strip glides there; a swipe reports
 * the photo it settles on through `onIndex`. Slides are `snap-center`, so the strip always lands on one.
 */
export function PhotoCarousel({ count, index, onIndex, onSwipe, renderSlide, className = "", slideClassName = "", label }: {
  count: number;
  index: number;
  onIndex: (i: number) => void;
  /** The shopper moved to another photo by swiping or dragging (not arrows, thumbnails or dots). */
  onSwipe?: () => void;
  renderSlide: (i: number) => ReactNode;
  className?: string;
  slideClassName?: string;
  label?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const reported = useRef(index);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const justDragged = useRef(false);
  // While the strip glides to a photo it was sent to, the photos it passes are not reported (they
  // would send it back). Cleared on arrival or as soon as the shopper touches it.
  const gliding = useRef<number | null>(null);
  const placed = useRef(false);

  // Follow the index when something else changes it (arrows, thumbnails, dots, keyboard).
  useEffect(() => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    reported.current = index;
    const target = index * el.clientWidth;
    // The first placement (e.g. the viewer opening on photo 3) jumps there instead of gliding past the others.
    if (!placed.current) { placed.current = true; el.scrollLeft = target; return; }
    if (Math.abs(el.scrollLeft - target) < 2) { gliding.current = null; return; }
    gliding.current = index;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
  }, [index]);

  // Keep the shown photo in place when the frame changes width (rotation, window resize, frame shape).
  useEffect(() => {
    const el = track.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (!drag.current) el.scrollLeft = reported.current * el.clientWidth; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth || drag.current) return;
    const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (gliding.current !== null) {
      if (Math.abs(el.scrollLeft - gliding.current * el.clientWidth) < 2) gliding.current = null;
      return;
    }
    if (i !== reported.current) { reported.current = i; onIndex(i); onSwipe?.(); }
  };

  const settle = (i: number) => {
    const el = track.current;
    if (!el) return;
    reported.current = i;
    gliding.current = i;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    // Snapping stays off until the glide finishes, or it would jump straight to the nearest photo.
    window.setTimeout(() => { if (!drag.current && track.current) track.current.style.scrollSnapType = ""; }, 450);
    if (i !== index) { onIndex(i); onSwipe?.(); }
  };

  return (
    <div
      ref={track}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      data-fm-carousel
      // A strip that scrolls must be reachable from the keyboard (WCAG 2.1.1; axe scrollable-region-focusable):
      // focused, the arrow keys scroll it photo by photo (the snap points); the viewer's own arrow handler
      // still moves it there. The shop's focus ring is drawn inside, since the photo frame clips its overflow.
      tabIndex={count > 1 ? 0 : undefined}
      className={`flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      style={{ overscrollBehaviorX: "contain", cursor: count > 1 ? "grab" : undefined, outlineOffset: count > 1 ? -4 : undefined }}
      onScroll={onScroll}
      onTouchStart={() => { gliding.current = null; }}
      onWheel={() => { gliding.current = null; }}
      onPointerDown={(e) => {
        gliding.current = null;
        // Touch and pen scroll the strip natively; only a mouse needs dragging by hand. A video's own
        // controls (play, scrubber, volume) keep the mouse.
        if (e.pointerType !== "mouse" || e.button !== 0 || count < 2 || !track.current) return;
        if ((e.target as HTMLElement | null)?.closest?.("video")) return;
        drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const d = drag.current, el = track.current;
        if (!d || !el || e.pointerId !== d.id) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 4) return;
        if (!d.moved) { d.moved = true; el.setPointerCapture?.(e.pointerId); el.style.scrollSnapType = "none"; el.style.cursor = "grabbing"; }
        el.scrollLeft = d.left - dx;
      }}
      onPointerUp={(e) => {
        const d = drag.current, el = track.current;
        drag.current = null;
        if (!d || !el) return;
        el.style.cursor = "";
        if (!d.moved) return;
        justDragged.current = true;
        settle(dragPlan(reported.current, e.clientX - d.x, el.clientWidth, count));
      }}
      onPointerCancel={() => {
        const el = track.current;
        drag.current = null;
        if (el) { el.style.cursor = ""; settle(reported.current); }
      }}
      // A drag ends with a click on whatever is under the mouse: swallow it so dragging never opens anything.
      onClickCapture={(e) => { if (justDragged.current) { justDragged.current = false; e.preventDefault(); e.stopPropagation(); } }}
      onDragStart={(e) => e.preventDefault()}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`relative shrink-0 w-full h-full snap-center snap-always ${slideClassName}`}
          aria-hidden={i === index ? undefined : true}
        >
          {renderSlide(i)}
        </div>
      ))}
    </div>
  );
}

/** Where a mouse drag of `dx` px (negative = dragged left, towards the next photo) lands: a pull of a
 *  sixth of the frame moves one photo, a longer one moves as many photos as it covered. */
export function dragPlan(from: number, dx: number, width: number, count: number): number {
  if (!(width > 0) || count < 1) return 0;
  const photos = Math.abs(dx) < width / 6 ? 0 : Math.max(1, Math.round(Math.abs(dx) / width));
  const to = dx < 0 ? from + photos : from - photos;
  return Math.max(0, Math.min(count - 1, to));
}
