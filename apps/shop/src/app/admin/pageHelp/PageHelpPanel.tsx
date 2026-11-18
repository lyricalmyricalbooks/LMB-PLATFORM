// The "?" by a page title (Julian, 18 November 2026): a side panel that says what the page is for and lists its parts,
// and an optional tour that dims the page and points at each part in turn. Words: pageHelpContent.ts. Finding a part
// on screen: pageHelp.ts `findPart`. The tour's look is the admin walkthrough's (walkthrough.css).
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Compass, X } from "lucide-react";
import { Drawer, GhostButton, PrimaryButton, SecondaryButton, useFocusTrap } from "../riso/components";
import { placeCard } from "../walkthrough/tourSteps";
import { findPart, type HelpPart, type PageHelpEntry } from "./pageHelp";
import "../walkthrough/walkthrough.css";
import "./pageHelp.css";

// The page first, then the top bar (the alerts count lives there).
const pageRoots = () => [...document.querySelectorAll(".rp-page-header, .rp-page-body, .rp-topbar")];

/** The parts of `help` on screen right now, each with where it is. */
function partsOnScreen(help: PageHelpEntry): { part: HelpPart; index: number }[] {
  const roots = pageRoots();
  const max = Math.round(window.innerHeight * 0.6);
  return help.parts.flatMap((part, index) => (findPart(part, roots, max) ? [{ part, index }] : []));
}

export function PageHelpPanel({ open, onClose, title, help, onTour, onMoreHelp, onAdminTour, appearance }: {
  appearance?: "light" | "dark"; open: boolean; onClose: () => void; title: string; help: PageHelpEntry;
  /** Start the page tour at this part (its index in `help.parts`). */ onTour: (index: number) => void;
  onMoreHelp: () => void; onAdminTour: () => void;
}) {
  const [found, setFound] = useState<Set<number>>(new Set());
  // Look for the parts as the panel opens (the page is already drawn behind it).
  useEffect(() => { if (open) setFound(new Set(partsOnScreen(help).map((p) => p.index))); }, [open, help.intro]);
  const first = help.parts.findIndex((_, i) => found.has(i));

  return (
    <Drawer open={open} onClose={onClose} title={title} appearance={appearance}>
      <div className="rp-ph">
        <section className="rp-ph-hero" aria-label="About this page">
          <p className="rp-ph-kicker">About this page</p>
          <p className="rp-ph-intro">{help.intro}</p>
          {first >= 0 && (
            <div className="rp-ph-start">
              <PrimaryButton onClick={() => onTour(first)}><Compass size={16} aria-hidden /> Show me around</PrimaryButton>
              <span className="rp-ph-count">{found.size} {found.size === 1 ? "stop" : "stops"}</span>
            </div>
          )}
        </section>

        <section aria-labelledby="rp-ph-parts-title">
          <h3 id="rp-ph-parts-title" className="rp-ph-h">On this page</h3>
          <ol className="rp-ph-parts">
            {help.parts.map((p, i) => (
              <li key={p.title}>
                {found.has(i) ? (
                  <button type="button" className="rp-ph-part" onClick={() => onTour(i)} aria-label={`${p.title}: ${p.text} Show me.`}>
                    <span className="rp-ph-num" aria-hidden="true">{i + 1}</span>
                    <span className="rp-ph-words"><strong>{p.title}</strong><span>{p.text}</span></span>
                    <span className="rp-ph-go" aria-hidden="true">Show me <ArrowRight size={14} /></span>
                  </button>
                ) : (
                  <div className="rp-ph-part">
                    <span className="rp-ph-num" aria-hidden="true">{i + 1}</span>
                    <span className="rp-ph-words"><strong>{p.title}</strong><span>{p.text}</span></span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <div className="rp-ph-foot">
          <SecondaryButton onClick={onMoreHelp}>More answers in Help</SecondaryButton>
          <GhostButton onClick={onAdminTour}>Tour the whole admin</GhostButton>
        </div>
      </div>
    </Drawer>
  );
}

type Rect = { left: number; top: number; right: number; bottom: number };
const PAD = 8;
const sameRect = (a: Rect | null, b: Rect | null) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

/** The tour of one page: the page dimmed, one part left clear, and a card beside it with Back and Next. */
export function PageTour({ title, help, start, appearance, onClose, onList }: {
  title: string; help: PageHelpEntry; start: number; appearance?: "light" | "dark";
  onClose: () => void;
  /** Back to the page's help panel. */ onList: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The stops are fixed when the tour starts: the parts that were on screen then.
  const [stops] = useState(() => partsOnScreen(help));
  const [at, setAt] = useState(() => Math.max(0, stops.findIndex((s) => s.index === start)));
  const [spot, setSpot] = useState<Rect | null>(null);
  const [cardAt, setCardAt] = useState<{ left: number; top: number } | null>(null);
  const stop = stops[at];
  useFocusTrap(ref, true, onClose);

  // Bring the part into view, then follow it every frame (the page may still be settling or scrolling).
  useEffect(() => {
    if (!stop) return;
    const max = Math.round(window.innerHeight * 0.6);
    let el = findPart(stop.part, pageRoots(), max);
    el?.scrollIntoView?.({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    let frame = 0; let last: Rect | null = null;
    const tick = () => {
      if (!el?.isConnected) el = findPart(stop.part, pageRoots(), max);
      const r = el?.getBoundingClientRect();
      const next = r ? {
        left: Math.max(4, r.left - PAD), top: Math.max(4, r.top - PAD),
        right: Math.min(window.innerWidth - 4, r.right + PAD), bottom: Math.min(window.innerHeight - 4, r.bottom + PAD),
      } : null;
      if (!sameRect(next, last)) { last = next; setSpot(next); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [at]);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    setCardAt(placeCard(spot, { width: card.offsetWidth, height: card.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
  }, [spot, at]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("[data-tour-focus]")?.focus(); }, [at]);

  if (!stop) return null;
  const last = at === stops.length - 1;
  const next = () => (last ? onClose() : setAt(at + 1));
  const back = () => { if (at > 0) setAt(at - 1); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
  };

  return (
    <div className="rp rp-tour-root rp-ph-tour" data-rp-appearance={appearance} data-phase="step">
      {spot
        ? <div className="rp-tour-spot" aria-hidden="true" style={{ left: spot.left, top: spot.top, width: spot.right - spot.left, height: spot.bottom - spot.top }} />
        : <div className="rp-tour-dim" aria-hidden="true" />}
      <div className="rp-tour-catch" aria-hidden="true" />
      <div ref={ref} className="rp-tour-card" data-kind="step" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKey}
        style={cardAt ? { left: cardAt.left, top: cardAt.top } : { visibility: "hidden" }}>
        <div className="rp-tour-top">
          <span className="rp-tour-kicker">{title} · {at + 1} of {stops.length}</span>
          <button type="button" className="rp-icon-btn rp-tour-x" aria-label="End the tour" onClick={onClose}><X size={16} aria-hidden /></button>
        </div>
        <h2 id={titleId} className="rp-tour-title" tabIndex={-1} data-tour-focus>{stop.part.title}</h2>
        <p className="rp-tour-text" aria-live="polite">{stop.part.text}</p>
        <div className="rp-tour-bar" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={stops.length} aria-valuenow={at + 1}>
          <span style={{ width: `${((at + 1) / stops.length) * 100}%` }} />
        </div>
        <div className="rp-tour-foot">
          <button type="button" className="rp-ph-list-link" onClick={onList}>All parts</button>
          {at > 0 && <GhostButton onClick={back}>Back</GhostButton>}
          <PrimaryButton onClick={next}>{last ? "Done" : "Next"}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
