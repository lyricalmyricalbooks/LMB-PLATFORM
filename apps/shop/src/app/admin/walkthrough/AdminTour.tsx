// The admin walkthrough on screen (tourSteps.ts holds the steps and rules). Three faces:
// - Welcome: offered once, the first time an owner opens the admin, with the chapters it covers.
// - A stop: the admin opens the stop's page behind a dimmed screen with one spot left clear (the menu item, the side
//   switch, the search…) and a card beside it: chapter, "n of N", a title, one or two sentences, Back and Next.
// - The end: what to do next, and where to find the tour again (Help).
// On a phone the menu is a drawer, so a stop points at the bottom menu's pill, its More pill or the menu button.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton, useFocusTrap } from "../riso/components";
import { useShopWords } from "../shopWords";
import { chaptersOf, chapterLabel, pageOf, placeCard, type TourStep, type TourTarget } from "./tourSteps";
import "./walkthrough.css";

const MENU_BUTTON = ".rp-menu-only";
const MORE = ".rp-bottom-nav [data-nav='more']";
const PARTS: Record<Extract<TourTarget, { part: string }>["part"], string[]> = {
  side: [".rp-sidebar .rp-side-switch", MENU_BUTTON],
  search: [".rp-topbar-search"],
  status: [".rp-status-btn"],
  fair: [".rp-sidebar .rp-fair-toggle", MORE, MENU_BUTTON],
  help: [".rp-sidebar [data-tour='help']", MORE, MENU_BUTTON],
};

function selectorsFor(target: TourTarget): string[] {
  if ("part" in target) return PARTS[target.part];
  const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(target.nav) : target.nav;
  return [`.rp-sidebar [data-nav="${id}"]`, `.rp-bottom-nav [data-nav="${id}"]`, MORE, MENU_BUTTON];
}

/** On screen: has a size and sits inside the window (the phone's closed menu drawer is pushed off to the left). */
function onScreen(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

function findSpot(target: TourTarget | undefined): HTMLElement | null {
  if (!target) return null;
  for (const sel of selectorsFor(target)) {
    const el = document.querySelector(sel);
    if (el && !onScreen(el)) (el as HTMLElement).scrollIntoView?.({ block: "nearest" });
    if (onScreen(el)) return el;
  }
  return null;
}

type Rect = { left: number; top: number; right: number; bottom: number };
const PAD = 6;
const sameRect = (a: Rect | null, b: Rect | null) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

export type TourPhase = { kind: "welcome" } | { kind: "step"; index: number } | { kind: "end" };

export function AdminTour({ phase, setPhase, steps, combined, shopName, appearance, onGo, onClose, onOpenHelp }: {
  phase: TourPhase | null; setPhase: (p: TourPhase | null) => void;
  steps: TourStep[]; combined: boolean; shopName: string; appearance?: "light" | "dark";
  /** Opens a menu page behind the tour. */ onGo: (page: string) => void;
  /** The tour ends (finished, skipped or closed): remember it. */ onClose: () => void;
  onOpenHelp: () => void;
}) {
  const w = useShopWords();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [spot, setSpot] = useState<Rect | null>(null);
  const [cardAt, setCardAt] = useState<{ left: number; top: number } | null>(null);
  const opened = useRef<string | undefined>(undefined);
  const step = phase?.kind === "step" ? steps[phase.index] : undefined;
  const close = () => { opened.current = undefined; setPhase(null); onClose(); };
  useFocusTrap(ref, !!phase, close);

  // Open the stop's page (once per page, so stops on the same page don't reload it).
  useEffect(() => {
    if (!step) { opened.current = undefined; return; }
    const page = pageOf(step);
    if (page && page !== opened.current) { opened.current = page; onGo(page); }
  }, [step?.id]);

  // Follow the spot every frame while a stop is on screen: pages load, the rail scrolls, the window resizes.
  useEffect(() => {
    if (!step) { setSpot(null); return; }
    let frame = 0; let last: Rect | null = null;
    const tick = () => {
      const el = findSpot(step.target);
      const r = el?.getBoundingClientRect();
      const next = r ? { left: r.left - PAD, top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD } : null;
      if (!sameRect(next, last)) { last = next; setSpot(next); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step?.id]);

  // Place the card beside the spot once both are measured.
  useLayoutEffect(() => {
    const card = ref.current;
    if (!phase || !card) return;
    const size = { width: card.offsetWidth, height: card.offsetHeight };
    setCardAt(placeCard(phase.kind === "step" ? spot : null, size, { width: window.innerWidth, height: window.innerHeight }));
  }, [phase, spot]);
  useEffect(() => {
    if (!phase) return;
    const onResize = () => setSpot((s) => (s ? { ...s } : s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [!!phase]);
  // The card's heading gets the focus at each stop, so a screen reader reads the new stop.
  useEffect(() => { ref.current?.querySelector<HTMLElement>("[data-tour-focus]")?.focus(); }, [phase?.kind, step?.id]);

  if (!phase) return null;
  const chapters = chaptersOf(steps, combined);
  const next = () => {
    if (phase.kind !== "step") return;
    setPhase(phase.index + 1 < steps.length ? { kind: "step", index: phase.index + 1 } : { kind: "end" });
  };
  const back = () => { if (phase.kind === "step" && phase.index > 0) setPhase({ kind: "step", index: phase.index - 1 }); };
  const onKey = (e: React.KeyboardEvent) => {
    if (phase.kind !== "step") return;
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
  };

  return (
    <div className="rp rp-tour-root" data-rp-appearance={appearance} data-phase={phase.kind}>
      {/* Clicks outside the card do nothing: the admin behind stays where the tour put it. */}
      {phase.kind === "step" && spot
        ? <div className="rp-tour-spot" aria-hidden="true" style={{ left: spot.left, top: spot.top, width: spot.right - spot.left, height: spot.bottom - spot.top }} />
        : <div className="rp-tour-dim" aria-hidden="true" />}
      <div className="rp-tour-catch" aria-hidden="true" />
      <div ref={ref} className="rp-tour-card" data-kind={phase.kind} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKey}
        style={cardAt ? { left: cardAt.left, top: cardAt.top } : { visibility: "hidden" }}>
        {phase.kind === "welcome" && (
          <>
            <div className="rp-tour-hero">
              <span className="rp-tour-kicker">Welcome</span>
              <h2 id={titleId} className="rp-tour-title" tabIndex={-1} data-tour-focus>{shopName ? `Welcome to ${shopName}` : "Welcome to your admin"}</h2>
              <p className="rp-tour-text">A short tour shows where everything lives. It takes about three minutes, and you can stop whenever you like.</p>
            </div>
            <ol className="rp-tour-chapters">
              {chapters.map((c, i) => (
                <li key={c.id}>
                  <span className="rp-tour-num" aria-hidden="true">{i + 1}</span>
                  <span className="rp-tour-chapter">{c.label}</span>
                  <span className="rp-tour-count">{c.count} {c.count === 1 ? "stop" : "stops"}</span>
                </li>
              ))}
            </ol>
            <p className="rp-tour-note">You can take it again from Help.</p>
            <div className="rp-tour-foot">
              <GhostButton onClick={close}>Maybe later</GhostButton>
              <PrimaryButton onClick={() => setPhase({ kind: "step", index: 0 })}>Start the tour</PrimaryButton>
            </div>
          </>
        )}
        {phase.kind === "step" && step && (
          <>
            <div className="rp-tour-top">
              <span className="rp-tour-kicker">{chapterLabel(step.chapter, combined)} · {phase.index + 1} of {steps.length}</span>
              <button type="button" className="rp-icon-btn rp-tour-x" aria-label="End the tour" onClick={close}><X size={16} aria-hidden /></button>
            </div>
            <h2 id={titleId} className="rp-tour-title" tabIndex={-1} data-tour-focus>{w(step.title)}</h2>
            <p className="rp-tour-text" aria-live="polite">{w(step.text)}</p>
            <div className="rp-tour-bar" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={phase.index + 1}>
              <span style={{ width: `${((phase.index + 1) / steps.length) * 100}%` }} />
            </div>
            <div className="rp-tour-foot">
              {phase.index > 0 && <GhostButton onClick={back}>Back</GhostButton>}
              <PrimaryButton onClick={next}>{phase.index + 1 === steps.length ? "Finish" : "Next"}</PrimaryButton>
            </div>
          </>
        )}
        {phase.kind === "end" && (
          <>
            <div className="rp-tour-hero">
              <span className="rp-tour-kicker">All done</span>
              <h2 id={titleId} className="rp-tour-title" tabIndex={-1} data-tour-focus>You know your way around</h2>
              <p className="rp-tour-text">Home always shows what needs you next. Help has answers, this tour again, and a person to ask.</p>
            </div>
            <div className="rp-tour-foot">
              <SecondaryButton onClick={() => { close(); onOpenHelp(); }}>Open Help</SecondaryButton>
              <PrimaryButton onClick={() => { close(); onGo("overview"); }}>Go to Home</PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
