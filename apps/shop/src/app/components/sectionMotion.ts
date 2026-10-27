// Motion as a finishing step (Studio 3.0 phase 4): per-section scroll reveals for the blocks inside, staggered one
// after another, sticky sections, parallax backgrounds and hover lifts. All CSS, scoped to `#section-<id>`:
// - Nothing is ever hidden unless the section was "armed" by MotionWatcher (sectionRender.tsx) after the page's
//   script ran, so a page without JavaScript (or the prerendered HTML, which runs with reduced motion) shows everything.
// - Every movement sits inside `prefers-reduced-motion: no-preference`; "Turn motion off on phones" adds a width query.
// - The global Style › Page animations switch (`enableAnimations`) turns all of it off.
import { UP_TO } from "../features/site/breakpoints";

export const BLOCK_REVEALS = [
  { value: "", label: "None" },
  { value: "fade-up", label: "Fade up" },
  { value: "fade", label: "Fade in" },
  { value: "zoom", label: "Zoom in" },
  { value: "slide", label: "Slide in from the side" },
];
export const BLOCK_HOVERS = [
  { value: "", label: "None" },
  { value: "lift", label: "Lift up" },
  { value: "grow", label: "Grow slightly" },
];
export const PARALLAX = [
  { value: "", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "strong", label: "Strong" },
];

const REVEAL_FROM: Record<string, string> = {
  "fade-up": "opacity:0;transform:translateY(28px)",
  fade: "opacity:0",
  zoom: "opacity:0;transform:scale(.94)",
  slide: "opacity:0;transform:translateX(-36px)",
};
const PARALLAX_PX: Record<string, number> = { subtle: 40, strong: 110 };
const MAX_STAGGERED = 12;

const num = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? fallback : Math.max(lo, Math.min(hi, n));
};

/** Does this section ask the watcher to arm it (hide its blocks until they scroll into view)? */
export const wantsReveal = (s: any, enableAnimations = true) => enableAnimations !== false && Boolean(REVEAL_FROM[s?.revealBlocks]);

/** Entrance timing for the section's own entrance animation (SectionReveal), in seconds. */
export function entranceTiming(s: any) {
  return { duration: num(s?.motionDuration, 900, 200, 2000) / 1000, delay: num(s?.motionDelay, 0, 0, 1500) / 1000 };
}

export function sectionMotionCss(sectionId: string, s: any, enableAnimations = true): string {
  if (!s || enableAnimations === false) return "";
  const root = "#section-" + String(sectionId).replace(/[^a-zA-Z0-9_-]/g, "");
  const motionOk = `(prefers-reduced-motion: no-preference)${s.motionOffOnPhones ? " and (min-width: 768px)" : ""}`;
  let moving = "";
  let css = "";

  const from = REVEAL_FROM[s.revealBlocks];
  const duration = num(s.motionDuration, 700, 200, 2000);
  const delay = num(s.motionDelay, 0, 0, 1500);
  const step = num(s.staggerStep, 90, 0, 400);
  const hover = s.blockHover === "lift" ? "translateY(-4px)" : s.blockHover === "grow" ? "scale(1.02)" : "";
  const transitions = [
    ...(from ? [`opacity ${duration}ms ease`, `transform ${duration}ms cubic-bezier(.215,.61,.355,1)`] : []),
    ...(hover && !from ? ["transform .25s ease"] : []),
    ...(hover ? ["box-shadow .25s ease"] : []),
  ];
  if (transitions.length) moving += `${root} :is([data-fm-block],.fm-card){transition:${transitions.join(",")};}`;
  if (from) {
    moving += `${root}[data-motion="armed"] [data-fm-block]{${from};}`;
    for (let n = 1; n <= MAX_STAGGERED; n++) moving += `${root} [data-fm-block]:nth-child(${n}){transition-delay:${delay + (n - 1) * step}ms;}`;
  }
  if (hover) moving += `@media (hover: hover){${root} :is([data-fm-block],.fm-card):hover{transform:${hover};}}`;

  const shift = PARALLAX_PX[s.parallax];
  if (shift) {
    const name = `fm-parallax-${s.parallax}`;
    moving += `@supports (animation-timeline: view()){@keyframes ${name}{from{background-position-y:calc(50% - ${shift}px);}to{background-position-y:calc(50% + ${shift}px);}}`
      + `${root},${root} > section{animation:${name} linear both;animation-timeline:view();}}`;
  }
  if (moving) css += `@media ${motionOk}{${moving}}`;

  // Sticky is placement, not movement: it applies whatever the motion preference.
  if (s.sticky) css += `${root}{position:sticky;top:${num(s.stickyTop, 0, 0, 300)}px;z-index:2;}`
    + (s.motionOffOnPhones ? `@media${UP_TO.mobile}{${root}{position:relative;}}` : "");
  return css;
}
