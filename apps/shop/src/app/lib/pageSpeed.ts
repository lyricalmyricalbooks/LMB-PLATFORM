// Real page speed from shoppers' own browsers (Google's three "Core Web Vitals"), for Overview › Marketing & traffic ›
// Page speed. Each visit's first page is measured with the browser's own PerformanceObserver (no extra library) and
// stored as ONE counter per visit in `analytics/<date>.vitals`, keyed "<phone|computer>_<lcp><inp><cls>" where each
// letter is g (good), o (needs improvement), p (poor) or n (not measured: no tap or click, or a browser that doesn't
// report it). Thresholds are Google's. lib/commerce.ts decides whether the visit may be counted at all.
import { deviceOf } from "./analyticsKeys";

export type Grade = "g" | "o" | "p" | "n";
export type Vital = "lcp" | "inp" | "cls";

/** Google's limits: good at or under the first, poor over the second. LCP and INP in ms, CLS unitless. */
export const VITAL_LIMITS: Record<Vital, [number, number]> = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };

export function grade(vital: Vital, value: number | null): Grade {
  if (value === null || !Number.isFinite(value) || value < 0) return "n";
  const [good, poor] = VITAL_LIMITS[vital];
  return value <= good ? "g" : value <= poor ? "o" : "p";
}

export function speedKey(width: number, values: Record<Vital, number | null>): string {
  const device = deviceOf(width) === "mobile" ? "phone" : "computer";
  return `${device}_${grade("lcp", values.lcp)}${grade("inp", values.inp)}${grade("cls", values.cls)}`;
}

/** A stored key back into its parts, or null for anything else. */
export function parseSpeedKey(key: string): { device: "phone" | "computer"; lcp: Grade; inp: Grade; cls: Grade } | null {
  const m = /^(phone|computer)_([gopn])([gopn])([gopn])$/.exec(key);
  return m ? { device: m[1] as "phone" | "computer", lcp: m[2] as Grade, inp: m[3] as Grade, cls: m[4] as Grade } : null;
}

const SEND_AFTER_MS = 45_000;
let watching = false;

/** Run once at start-up (main.tsx). Never on admin pages, the Studio preview or a page opened in the background. */
export function watchPageSpeed(): void {
  if (watching || typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  if (/(^|\/)(admin|studio-fixture)(\/|\.|$)/.test(window.location.pathname) || window.location.search.includes("preview=true")) return;
  if (document.visibilityState === "hidden") return;
  watching = true;
  let lcp: number | null = null;
  let inp: number | null = null;
  // CLS the way Google counts it: the worst burst of shifts (gaps under 1 s, bursts at most 5 s long).
  let cls: number | null = null, burst = 0, burstStart = 0, burstLast = 0;
  const observe = (type: string, onEntries: (entries: any[]) => void, extra: Record<string, unknown> = {}) => {
    try {
      new PerformanceObserver(list => onEntries(list.getEntries() as any[])).observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    } catch { /* this browser doesn't report it: "n" */ }
  };
  observe("largest-contentful-paint", entries => {
    const last = entries[entries.length - 1];
    if (last) lcp = Number(last.renderTime || last.startTime) || 0;
  });
  observe("layout-shift", entries => {
    for (const e of entries) {
      if (e.hadRecentInput) continue;
      const t = Number(e.startTime) || 0;
      if (burst > 0 && t - burstLast < 1000 && t - burstStart < 5000) burst += Number(e.value) || 0;
      else { burst = Number(e.value) || 0; burstStart = t; }
      burstLast = t;
      cls = Math.max(cls ?? 0, burst);
    }
    if (cls === null) cls = 0;
  });
  // No layout-shift report at all in a browser that supports it means nothing moved.
  try { if ((PerformanceObserver as any).supportedEntryTypes?.includes("layout-shift")) cls = cls ?? 0; } catch { /* unknown */ }
  observe("event", entries => {
    for (const e of entries) if (e.interactionId) inp = Math.max(inp ?? 0, Number(e.duration) || 0);
  }, { durationThreshold: 40 });

  // Taps and key presses quicker than 40 ms aren't reported one by one: a visit that interacted and reported nothing was fast.
  let interacted = false;
  const onInput = () => { interacted = true; };
  window.addEventListener("pointerdown", onInput, { once: true, passive: true, capture: true });
  window.addEventListener("keydown", onInput, { once: true, passive: true, capture: true });
  let eventTiming = false;
  try { eventTiming = !!(PerformanceObserver as any).supportedEntryTypes?.includes("event"); } catch { eventTiming = false; }

  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    if (inp === null && interacted && eventTiming) inp = 0;
    const key = speedKey(window.innerWidth, { lcp, inp, cls });
    void import("./commerce").then(({ funnelApi }) => funnelApi.trackPageSpeed(key)).catch(() => { /* best-effort */ });
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(); });
  window.addEventListener("pagehide", send);
  window.setTimeout(send, SEND_AFTER_MS);
}
