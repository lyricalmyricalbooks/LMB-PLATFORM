import { useState, type ReactNode } from "react";
import { TabPanel, Tabs } from "./riso/components";
import { friendlyReason, isPlainMessage } from "./studio/friendlyError";

/**
 * Layout helpers for the long Settings pages (General, Payments): sub tabs, one per topic (a dot marks a topic with
 * unsaved edits), and a folded "How to set it up" box for step-by-step instructions. Every topic stays mounted, so one
 * Save bar still covers edits made on any sub tab. Jumps scroll and move focus without touching the address bar (the
 * admin's hash is its page route).
 */

export type SettingsTab = { id: string; title: string; unsaved?: boolean; count?: number };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to the element with this id and moves keyboard focus there. */
export function jumpTo(id: string) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

/**
 * A page's open sub tab. With `onChange` the Dashboard owns it (it lives in the address bar, `adminRoute.ts`);
 * without, the page keeps it itself. `undefined` from the Dashboard means the page's first tab.
 */
export function useSubTab<T extends string>(fallback: T, value?: string, onChange?: (id: string | undefined) => void): [T, (id: T) => void] {
  const [local, setLocal] = useState<T>(fallback);
  if (!onChange) return [local, setLocal];
  return [(value || fallback) as T, (id: T) => onChange(id === fallback ? undefined : id)];
}

export function SettingsTabs({ tabs, value, onChange, label }: { tabs: SettingsTab[]; value: string; onChange: (id: string) => void; label: string }) {
  return <Tabs variant="page" label={label} value={value} onChange={onChange}
    tabs={tabs.map((t) => ({ id: t.id, label: t.title, unsaved: t.unsaved, ...(t.count ? { count: t.count } : {}) }))} />;
}

/** One topic of a settings page: the sub tab's panel and its cards, spaced like Inventory's. */
export function SettingsGroup({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return (
    <TabPanel tabId={id} active={active}>
      <div className="rp-stack">
        {children}
      </div>
    </TabPanel>
  );
}

/** A card other parts of the page can jump to. */
export function SettingsAnchor({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} tabIndex={-1} style={{ scrollMarginTop: 16, outline: "none" }}>{children}</div>;
}

/** Step-by-step setup instructions, folded behind one underlined toggle so the card shows its controls first. */
export function HowTo({ summary = "Setup steps", open, children }: { summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="rp-howto" open={open}>
      <summary>{summary}</summary>
      <div>{children}</div>
    </details>
  );
}

/**
 * "Couldn't <what>. <reason>" for a toast or message box: a recognised failure (permissions, timeout, offline) gets a
 * sentence the owner can act on, a short plain message from the shop's server is kept, and anything else (provider
 * codes, stack text) becomes a generic "try again". The raw error goes to the browser console.
 */
export function friendlyError(err: unknown, what: string): string {
  console.error(`[Settings] couldn't ${what}`, err);
  const raw = String((err as any)?.message ?? (typeof err === "string" ? err : "")).trim();
  const reason = friendlyReason(err) || (isPlainMessage(raw) ? (/[.!?]$/.test(raw) ? raw : `${raw}.`) : "Something went wrong. Try again in a moment.");
  return `Couldn't ${what}. ${reason}`;
}
