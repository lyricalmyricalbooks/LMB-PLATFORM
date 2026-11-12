import { useState } from "react";
import { alertSignature, type AdminAlert } from "./adminAlerts";
import "./alerts.css";

// Alerts have their own page (Julian, 12 November 2026): no banner stack above every page any more. The top bar shows
// one pill with the count ("3 alerts") that opens #alerts, where each alert is a tile like Home's To do (v4 mockup).

const KEY = "admin-dismissed-alerts";
/** Hidden alerts are remembered in this browser (not just this tab), newest last, so hiding one keeps it hidden. */
const KEEP = 200;
const readDismissed = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((s) => typeof s === "string") : [];
  } catch { return []; }
};
const writeDismissed = (list: string[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
};

const RANK: Record<string, number> = { danger: 0, warning: 1 };
/** The alerts still showing (not hidden in this browser), urgent first, then in the order they came. Pure. */
export function visibleAlerts(alerts: AdminAlert[], dismissed: string[]): AdminAlert[] {
  return alerts
    .filter((a) => !dismissed.includes(alertSignature(a)))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (RANK[x.a.tone] ?? 2) - (RANK[y.a.tone] ?? 2) || x.i - y.i)
    .map(({ a }) => a);
}

/** The hidden list, shared by the top bar's pill and the Alerts page so both count the same alerts. */
export function useAlertDismissals() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const dismiss = (a: AdminAlert) => setDismissed((was) => {
    const next = [...was.filter((s) => s !== alertSignature(a)), alertSignature(a)].slice(-KEEP);
    writeDismissed(next);
    return next;
  });
  const showAll = () => { writeDismissed([]); setDismissed([]); };
  return { dismissed, dismiss, showAll };
}

/** The top bar's way to the Alerts page: nothing when all is clear, the count otherwise (red-tinted when one is urgent). */
export function AlertsPill({ alerts, onOpen }: { alerts: AdminAlert[]; onOpen: () => void }) {
  if (!alerts.length) return null;
  const urgent = alerts.some((a) => a.tone === "danger");
  const words = `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}`;
  return (
    <a className="rp-alerts-pill" href="#alerts" data-urgent={urgent || undefined}
      aria-label={urgent ? `${words}, one or more urgent` : words}
      onClick={(e) => { e.preventDefault(); onOpen(); }}>
      <span className="rp-alerts-pill-dot" aria-hidden="true" />
      <span className="rp-alerts-pill-n">{alerts.length}</span>
      <span className="rp-alerts-pill-word">{alerts.length === 1 ? "alert" : "alerts"}</span>
    </a>
  );
}
