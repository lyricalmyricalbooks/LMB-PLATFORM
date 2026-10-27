import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PhotoCarousel } from "./PhotoCarousel";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { muteVideo } from "./bookVideo";
import { PhotoToneDefs } from "./PhotoToneDefs";

/** Starts loading a photo at full-screen size, so it is ready before the shopper moves to it. */
function warm(photo: LightboxPhoto | undefined) {
  // A video's still frame is warmed like a photo; the video itself loads only when played.
  if (!photo?.url || typeof Image === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  if (photo.srcSet) { img.sizes = "100vw"; img.srcset = photo.srcSet; }
  img.src = photo.url;
}

/** `videoUrl`: a book video (features/site/bookVideo.ts); `url` is then its still frame. */
// `style`: the photo's quick edits (colour, mirroring) — the viewer always shows the whole photo, never the crop.
// `source`: the photo record, for the SVG part of those edits (PhotoToneDefs).
export type LightboxPhoto = { url: string; alt: string; srcSet?: string; videoUrl?: string; style?: CSSProperties; source?: unknown };

type Labels = { close: string; prev: string; next: string; dialog: string; count: string };

/**
 * Full-screen photo viewer for the product page (click the main photo to enlarge).
 * Arrow keys / buttons move between photos, Escape or a click on the shade closes it.
 * All words come from Text & labels › Product page, so nothing is built in.
 * Rendered into <body> (inside its own `data-fm-store` wrapper, so theme tokens and Studio's viewer
 * styles still apply): a transformed or animated parent on the product page would otherwise make
 * `position: fixed` relative to that parent, leaving the header on top and the photo cut off.
 */
export function PhotoLightbox({ photos, start, labels, onClose, onIndex, onSwipe, showCount = true }: {
  photos: LightboxPhoto[]; start: number; labels: Labels; onClose: () => void; onIndex?: (i: number) => void;
  /** The shopper swiped or dragged to another photo (PhotoCarousel's onSwipe). */
  onSwipe?: () => void;
  /** Studio › Style › Product page · buy card & details › Enlarged photo viewer › Show the photo count. */
  showCount?: boolean;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(0, start), Math.max(0, photos.length - 1)));
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);

  const go = (next: number) => {
    if (!photos.length) return;
    const i = (next + photos.length) % photos.length;
    setIndex(i);
    onIndex?.(i);
  };

  // A video stops when the shopper moves away from it.
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLVideoElement>("video[data-fm-video]").forEach((v) => { if (!v.paused) v.pause(); });
  }, [index]);

  // Next and previous photos load while this one is on screen.
  useEffect(() => {
    if (photos.length < 2) return;
    warm(photos[(index + 1) % photos.length]);
    warm(photos[(index - 1 + photos.length) % photos.length]);
  }, [index, photos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys on a focused video seek inside it instead of changing photos.
      if ((e.target as HTMLElement | null)?.tagName === "VIDEO") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  });

  const photo = photos[index];
  if (!photo) return null;
  // Colours/shape: Studio › Style › Product page · buy card & details › Enlarged photo viewer (productPageStyle.ts).
  const btn = "fm-lightbox-btn absolute w-11 h-11 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 hover:bg-black/80 hover:border-white/20 text-white transition-colors";

  const viewer = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
      tabIndex={-1}
      data-fm-lightbox
      data-studio-target="style:productCard|copy:Product page"
      data-studio-label="Enlarged photo viewer"
      className="fm-lightbox fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Swipe or drag between photos (Instagram-style); a click on the shade beside the photo closes. */}
      <PhotoCarousel
        count={photos.length}
        index={index}
        onIndex={(i) => { setIndex(i); onIndex?.(i); }}
        onSwipe={onSwipe}
        className="absolute inset-0"
        label={labels.dialog}
        renderSlide={(i) => (
          <div className="w-full h-full flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {photos[i].videoUrl ? (
              <video
                src={photos[i].videoUrl}
                poster={photos[i].url}
                controls
                muted
                ref={muteVideo}
                playsInline
                preload={i === index ? "metadata" : "none"}
                aria-label={photos[i].alt}
                data-fm-video
                className="max-w-[94vw] max-h-[88vh] w-auto h-auto object-contain bg-black"
              />
            ) : (
            <>
            <PhotoToneDefs photo={photos[i].source} />
            <img
              // `loading` before `src` (see lazyFirst.test.ts), so far photos stay lazy.
              loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
              src={photos[i].url}
              {...(photos[i].srcSet ? { srcSet: photos[i].srcSet, sizes: "100vw" } : {})}
              alt={photos[i].alt}
              decoding="async"
              className="max-w-[94vw] max-h-[88vh] w-auto h-auto object-contain select-none"
              draggable={false}
              style={photos[i].style}
            />
            </>
            )}
          </div>
        )}
      />
      <button type="button" data-autofocus onClick={onClose} aria-label={labels.close} className={`${btn} top-4 right-4`}><X size={18} /></button>
      {photos.length > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label={labels.prev} className={`${btn} left-4 top-1/2 -translate-y-1/2`}><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => go(index + 1)} aria-label={labels.next} className={`${btn} right-4 top-1/2 -translate-y-1/2`}><ChevronRight size={18} /></button>
        </>
      )}
      {photos.length > 1 && showCount && (
        <p className="fm-lightbox-count absolute bottom-4 left-0 right-0 text-center text-[11px] tracking-widest uppercase text-white/70" aria-live="polite">
          {labels.count.replace("{n}", String(index + 1)).replace("{total}", String(photos.length))}
        </p>
      )}
    </div>
  );
  if (typeof document === "undefined") return viewer;
  return createPortal(<div data-fm-store style={{ display: "contents" }}>{viewer}</div>, document.body);
}
