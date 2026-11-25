// First visit to Studio (round three, phase 4): four short stops pointing at the real parts of the screen, in place of
// the green tips card. It never blocks the editor (no backdrop: everything stays clickable), it is remembered per
// browser under the tips card's old key, and Theme actions › Take the tour starts it again.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export const TOUR_KEY = "studio-tips-dismissed";
const seen = () => { try { return window.localStorage.getItem(TOUR_KEY) === "1"; } catch { return false; } };
const remember = () => { try { window.localStorage.setItem(TOUR_KEY, "1"); } catch { /* private window: shown again next time */ } };

export type TourStop = { target: string; title: string; body: string };

/** The four stops, each pointing at a part of Studio by a selector that is on screen on a computer and on a phone. */
export const TOUR_STOPS: TourStop[] = [
  { target: ".studio-rail", title: "Everything you can change", body: "Page arranges this page's sections. Style changes the look of every page. Pages and Designs hold the rest." },
  { target: ".studio-preview-frame", title: "Click your shop to edit it", body: "Click any part to open its settings. Double-click words to type over them." },
  { target: ".studio-picker", title: "Choose the page", body: "Switch between your home page, product pages and the rest. The phone button shows it on a phone." },
  { target: "[data-studio-publish]", title: "Save, then publish", body: "Save draft keeps your changes private. Publish puts them on your shop. Find, View website and history are under ⋯." },
];

type Spot = { top: number; left: number; side: "below" | "above" | "right" };

/** Where the card goes for a target's box: to its right when there is room (the rail), else below, else above. */
export function placeCard(box: { top: number; left: number; right: number; bottom: number; width: number; height: number }, view: { width: number; height: number }, card = { width: 300, height: 170 }): Spot {
  const gap = 12;
  const clampX = (x: number) => Math.max(8, Math.min(x, view.width - card.width - 8));
  const clampY = (y: number) => Math.max(8, Math.min(y, view.height - card.height - 8));
  if (box.height > view.height * 0.5 && box.width < view.width * 0.3 && box.right + gap + card.width < view.width) return { top: clampY(box.top + 40), left: box.right + gap, side: "right" };
  if (box.bottom + gap + card.height < view.height) return { top: box.bottom + gap, left: clampX(box.left + box.width / 2 - card.width / 2), side: "below" };
  if (box.top - gap - card.height > 0) return { top: box.top - gap - card.height, left: clampX(box.left + box.width / 2 - card.width / 2), side: "above" };
  // A target that fills the screen (the preview): the card sits inside it, near the top.
  return { top: clampY(box.top + 24), left: clampX(box.left + 24), side: "below" };
}

export function StudioTour({ restart = 0, hold = false }: { restart?: number; hold?: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // First visit: start once Studio has drawn, and never while something else is guiding the owner (Make it yours).
  useEffect(() => {
    if (hold || seen()) return;
    const t = setTimeout(() => setStep(s => s ?? 0), 700);
    return () => clearTimeout(t);
  }, [hold]);
  useEffect(() => { if (restart) setStep(0); }, [restart]);
  // Stops whose part isn't on screen (a phone showing only the preview) are skipped.
  const stops = step === null ? [] : TOUR_STOPS.filter(s => { const el = document.querySelector(s.target); return !!el && el.getBoundingClientRect().width > 0; });
  const stop = step === null ? null : stops[Math.min(step, stops.length - 1)] ?? null;
  useLayoutEffect(() => {
    if (!stop) { setSpot(null); return; }
    const place = () => {
      const el = document.querySelector(stop.target);
      if (!el) return;
      setSpot(placeCard(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { width: Math.min(300, window.innerWidth - 16), height: 170 }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [stop?.target]);
  useEffect(() => { if (stop) nextRef.current?.focus({ preventScroll: true }); }, [stop?.target]);
  if (step === null || !stop || !spot) return null;
  const at = stops.indexOf(stop);
  const last = at === stops.length - 1;
  const close = () => { remember(); setStep(null); };
  return (
    <div className="studio-tour" role="dialog" aria-label={`Studio tour, step ${at + 1} of ${stops.length}`} data-studio-tour={at + 1} data-side={spot.side}
      style={{ top: spot.top, left: spot.left }} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
      <div className="studio-tour-head">
        <small>{at + 1} of {stops.length}</small>
        <button type="button" className="studio-tour-close" aria-label="Close the tour" onClick={close}><X size={14} aria-hidden="true" /></button>
      </div>
      <strong>{stop.title}</strong>
      <p>{stop.body}</p>
      <div className="studio-tour-actions">
        {!last && <button type="button" className="studio-text-button" onClick={close}>Skip tour</button>}
        <button type="button" ref={nextRef} className="studio-tour-next" onClick={() => (last ? close() : setStep(at + 1))}>{last ? "Done" : "Next"}</button>
      </div>
    </div>
  );
}
