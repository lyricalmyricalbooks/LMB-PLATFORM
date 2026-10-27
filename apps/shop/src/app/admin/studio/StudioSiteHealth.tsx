// Workbench › Health › Check every page (Studio 3.0 phase 7). Loads each kind of shop page, one at a time, into a
// hidden preview frame fed the same unsaved snapshot as the canvas, waits for it to settle and runs the read-only
// Health audit on it. Nothing is saved or changed; the frame is removed after each page. Results are grouped by page,
// with problems shared by several pages (header, footer…) listed once.
import { useCallback, useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { auditDocument, CATEGORY_LABELS, type HealthOptions } from "./healthAudit";
import { deliverPreviewState, type buildPreviewState } from "./studioWorkflow";
import {
  addSiteRun, formatBytes, historyTrend, mergeSiteFindings, pageWeight, toSiteFinding,
  type HealthRoute, type PageResult, type SiteFinding, type SiteReport, type SiteRunSummary,
} from "./siteHealth";

type Snapshot = ReturnType<typeof buildPreviewState>;
type Device = "desktop" | "tablet" | "mobile";

/** Longest wait for one page; a page that never settles is checked as it is then. */
export const PAGE_TIMEOUT_MS = 8000;
const QUIET_MS = 700;
const MIN_WAIT_MS = 1200;
/** Long enough for entrance and reveal animations (Style › Motion) to finish after scrolling through. */
const REVEAL_WAIT_MS = 1600;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Loads one page into a hidden frame and audits it. Resolves with an error message instead of throwing. */
async function checkPage(url: string, width: number, snapshot: Snapshot, opts: HealthOptions, stopped: () => boolean): Promise<Omit<PageResult, "route">> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("data-studio-site-health", "");
  frame.tabIndex = -1;
  frame.title = "Studio Health page check";
  // Behind Studio and see-through, but on screen at the device's width, so the page lays out and animates as shoppers see it.
  Object.assign(frame.style, { position: "fixed", left: "0", top: "0", width: `${width}px`, height: "900px", border: "0", opacity: "0", pointerEvents: "none", zIndex: "-1" });
  const origin = window.location.origin;
  let ready = false, loaded = false;
  const deliver = () => { try { deliverPreviewState(frame.contentWindow, snapshot, origin); } catch { /* frame gone */ } };
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.data?.type !== "PREVIEW_READY") return;
    ready = true; deliver();
  };
  window.addEventListener("message", onMessage);
  // The address goes on before the frame joins the page, so no empty about:blank document counts as "loaded".
  frame.addEventListener("load", () => { if (frame.contentDocument?.URL !== "about:blank") { loaded = true; deliver(); } });
  frame.src = url;
  document.body.appendChild(frame);
  const started = Date.now();
  try {
    // Wait for the page to load, then for its content to stop changing (or the time limit).
    let lastChange = Date.now();
    let observer: MutationObserver | null = null;
    let observed: Document | null = null;
    while (Date.now() - started < PAGE_TIMEOUT_MS) {
      if (stopped()) return { findings: [], error: "Stopped" };
      const doc = loaded ? frame.contentDocument : null;
      if (doc?.body && doc !== observed && doc.URL !== "about:blank") {
        observer?.disconnect();
        observer = new MutationObserver(() => { lastChange = Date.now(); });
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true });
        observed = doc; lastChange = Date.now();
      }
      const waited = Date.now() - started;
      if (observer && (ready || waited > 3000) && waited > MIN_WAIT_MS && Date.now() - lastChange > QUIET_MS) {
        const pending = Array.from(doc!.images).filter(img => !img.complete && img.loading !== "lazy");
        if (!pending.length || waited > PAGE_TIMEOUT_MS - 1500) break;
      }
      await sleep(150);
    }
    // Sections lower down that fade in as shoppers scroll stay see-through until scrolled to: scroll through the
    // page once, then back to the top, so the audit sees them as shoppers do.
    if (!loaded) return { findings: [], error: "The page didn't load in time." };
    const scroller = frame.contentWindow;
    const to = (top: number) => scroller!.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });
    const height = frame.contentDocument?.documentElement?.scrollHeight || 0;
    if (scroller && height > 900) {
      for (let y = 0, steps = 0; y < height && steps < 25; y += 700, steps++) {
        if (stopped()) return { findings: [], error: "Stopped" };
        to(y); await sleep(120);
      }
      to(height); await sleep(200);
      to(0); await sleep(REVEAL_WAIT_MS);
    }
    observer?.disconnect();
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc?.body || !win) return { findings: [], error: "The page didn't load." };
    const findings = auditDocument(doc, win as Window, opts).map(toSiteFinding);
    const entries = (win.performance?.getEntriesByType?.("resource") || []) as PerformanceResourceTiming[];
    return { findings, weight: pageWeight(entries) };
  } catch (err) {
    return { findings: [], error: err instanceof Error ? err.message.slice(0, 160) : "The page couldn't be checked." };
  } finally {
    window.removeEventListener("message", onMessage);
    frame.remove();
  }
}

export type SiteHealthState = {
  running: boolean;
  progress: { done: number; total: number; label: string } | null;
  report: SiteReport | null;
  /** When and at which size the shown report was made. */
  ranAt: { at: number; device: Device } | null;
  skipped: number;
  /** The shown report covers every page (not stopped part-way). */
  complete: boolean;
  history: SiteRunSummary[];
};

/** Runs "Check every page"; lives in StudioEditor so a run keeps going while the Workbench changes tab. */
export function useSiteHealth(o: {
  routes: () => { routes: HealthRoute[]; skipped: number };
  snapshot: () => Snapshot | null;
  urlFor: (path: string) => string;
  device: Device;
  width: number;
  options: () => HealthOptions;
  history: SiteRunSummary[];
  onHistory: (history: SiteRunSummary[]) => void;
}) {
  const [state, setState] = useState<SiteHealthState>({ running: false, progress: null, report: null, ranAt: null, skipped: 0, complete: false, history: o.history });
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const latest = useRef(o); latest.current = o;
  const historyRef = useRef(o.history);
  // Leaving Studio mid-run stops it; the page being checked removes its frame within a moment.
  useEffect(() => () => { stopRef.current = true; }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    const { routes, skipped } = latest.current.routes();
    const snapshot = latest.current.snapshot();
    if (!snapshot || !routes.length) return;
    const { device, width } = latest.current;
    const opts = { ...latest.current.options(), device };
    runningRef.current = true; stopRef.current = false;
    setState(s => ({ ...s, running: true, complete: false, skipped, progress: { done: 0, total: routes.length, label: routes[0].label } }));
    const results: PageResult[] = [];
    for (const [i, route] of routes.entries()) {
      if (stopRef.current) break;
      setState(s => ({ ...s, progress: { done: i, total: routes.length, label: route.label } }));
      const result = await checkPage(latest.current.urlFor(route.path), width, snapshot, opts, () => stopRef.current);
      if (result.error === "Stopped") break;
      results.push({ route, ...result });
      setState(s => ({ ...s, report: mergeSiteFindings(results), ranAt: { at: Date.now(), device } }));
    }
    const finished = !stopRef.current && results.length === routes.length;
    runningRef.current = false;
    const report = mergeSiteFindings(results);
    // Only a complete run joins the history, so the trend compares like with like.
    if (finished) {
      historyRef.current = addSiteRun(historyRef.current, { at: Date.now(), device, pages: report.totals.pages, issues: report.totals.issues, tips: report.totals.tips, failed: report.totals.failed });
      latest.current.onHistory(historyRef.current);
    }
    setState(s => ({ ...s, running: false, progress: null, report, complete: finished, history: historyRef.current }));
  }, []);
  const stop = useCallback(() => { stopRef.current = true; }, []);
  return { ...state, device: o.device, start, stop };
}

const DEVICE_WORD: Record<Device, string> = { desktop: "computer", tablet: "tablet", mobile: "phone" };

export function SiteHealthPanel({ site, onOpenPage, onFix }: {
  site: ReturnType<typeof useSiteHealth>;
  /** Shows the page on the canvas (and checks it there); false when Studio can't show that page. */
  onOpenPage: (route: HealthRoute) => boolean;
  onFix: (finding: SiteFinding, route?: HealthRoute) => void;
}) {
  const { report, progress, running, history } = site;
  const trend = historyTrend(history);
  const row = (f: SiteFinding & { pages?: string[] }, route?: HealthRoute) => (
    <li key={`${f.id}|${f.title}`} className="studio-health-item" data-site-finding={f.id}>
      <div>
        <span className="studio-health-cat">{CATEGORY_LABELS[f.category]}{f.severity === "issue" ? " · to fix" : ""}</span>
        <strong>{f.title}{f.count > 1 ? ` (${f.count} places)` : ""}</strong>
        <small>{f.detail}</small>
        {f.pages && <small className="studio-health-where">On {f.pages.length} pages: {f.pages.slice(0, 4).join(", ")}{f.pages.length > 4 ? "…" : ""}</small>}
        {!f.pages && f.owner?.label && <small className="studio-health-where">In: {f.owner.label}</small>}
      </div>
      {f.owner && <div className="studio-health-actions"><SecondaryButton size="sm" onClick={() => onFix(f, route)}>Edit this part</SecondaryButton></div>}
    </li>
  );
  return (
    <section className="studio-site-health" data-studio-site-health-panel aria-label="Every page">
      <div className="studio-health-bar">
        <span>{running && progress ? <>Checking {progress.done + 1} of {progress.total}: <strong>{progress.label}</strong>…</>
          : <>Check every kind of page in your shop at <strong>{DEVICE_WORD[site.device]}</strong> size, using your unsaved draft.</>}</span>
        {running ? <SecondaryButton size="sm" onClick={site.stop}>Stop</SecondaryButton>
          : <PrimaryButton size="sm" onClick={() => void site.start()}>{report ? "Check every page again" : "Check every page"}</PrimaryButton>}
      </div>
      {running && progress && <progress className="studio-site-health-progress" max={progress.total} value={progress.done} aria-label="Pages checked" />}
      {trend && !running && <p className="studio-hint" data-site-health-trend>Last checks: {trend}.</p>}
      {report && <>
        <p className="studio-health-summary" role="status" data-site-health-summary>
          <StatusBadge tone="info">{report.totals.checked} page{report.totals.checked === 1 ? "" : "s"} checked</StatusBadge>
          {report.totals.issues ? <StatusBadge tone="warning">{report.totals.issues} to fix</StatusBadge> : <StatusBadge tone="success">Nothing to fix</StatusBadge>}
          {report.totals.tips > 0 && <StatusBadge tone="info">{report.totals.tips} suggestion{report.totals.tips === 1 ? "" : "s"}</StatusBadge>}
          {report.totals.failed > 0 && <StatusBadge tone="warning">{report.totals.failed} couldn't be checked</StatusBadge>}
        </p>
        {site.ranAt && !running && <p className="studio-hint">{site.complete ? "" : "Stopped part-way. "}Checked at {DEVICE_WORD[site.ranAt.device]} size, {new Date(site.ranAt.at).toLocaleTimeString()}.{site.skipped ? ` ${site.skipped} more pages or categories weren't checked (the first ones of each kind were).` : ""}</p>}
        {report.shared.length > 0 && <section><h3>On several pages</h3><ul className="studio-health-list">{report.shared.map(f => row(f))}</ul></section>}
        <section>
          <h3>Page by page</h3>
          <ul className="studio-site-health-pages">
            {report.pages.map(p => {
              const issues = p.findings.filter(f => f.severity === "issue").reduce((n, f) => n + f.count, 0) + p.sharedIssues;
              const tips = p.findings.filter(f => f.severity === "tip").reduce((n, f) => n + f.count, 0);
              const weight = p.weight && p.weight.imageBytes + p.weight.fontBytes;
              return (
                <li key={p.route.id} data-site-page={p.route.id}>
                  <details open={issues > 0 || Boolean(p.error)}>
                    <summary>
                      <strong>{p.route.label}</strong>
                      {p.error ? <StatusBadge tone="warning">Not checked</StatusBadge>
                        : issues ? <StatusBadge tone="warning">{issues} to fix{p.sharedIssues ? ` (${p.sharedIssues} on several pages)` : ""}</StatusBadge>
                        : <StatusBadge tone="success">Nothing to fix</StatusBadge>}
                      {tips > 0 && <StatusBadge tone="info">{tips} suggestion{tips === 1 ? "" : "s"}</StatusBadge>}
                      {weight ? <small title="Measured in the preview: pictures from servers that don't share their size aren't counted.">≈ {formatBytes(weight)} of pictures and fonts (estimate)</small> : null}
                    </summary>
                    {p.error && <p className="studio-hint">{p.error}</p>}
                    {p.findings.length > 0 && <ul className="studio-health-list">{p.findings.map(f => row(f, p.route))}</ul>}
                    <div className="studio-inline-actions">
                      <SecondaryButton size="sm" onClick={() => onOpenPage(p.route)}>Open this page</SecondaryButton>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
        <p className="studio-hint">Speed figures are estimates from the preview, which runs slower than the live shop. “Open this page” shows it on the canvas, where Show me points at each problem.</p>
      </>}
    </section>
  );
}
