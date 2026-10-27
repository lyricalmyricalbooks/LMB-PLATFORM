// Order of the book page's Description / Artist bio / Details / Shipping & returns / Reviews tabs (or accordions).
// Studio › Style › Book page · photos & layout › Order of the tabs (`pdpTabOrder1…5`). Blank everywhere = the built-in order.

export const PDP_TAB_IDS = ["description", "artist", "specs", "policies", "reviews"] as const;
export type PdpTabId = (typeof PDP_TAB_IDS)[number];

export const PDP_TAB_ORDER_KEYS = ["pdpTabOrder1", "pdpTabOrder2", "pdpTabOrder3", "pdpTabOrder4", "pdpTabOrder5"] as const;

/** The chosen positions, in order, ignoring blanks, unknown ids and repeats. */
export function chosenTabOrder(design: Record<string, any> | undefined | null): PdpTabId[] {
  const seen = new Set<string>();
  const out: PdpTabId[] = [];
  for (const key of PDP_TAB_ORDER_KEYS) {
    const v = design?.[key];
    if (typeof v === "string" && (PDP_TAB_IDS as readonly string[]).includes(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v as PdpTabId);
    }
  }
  return out;
}

/** Puts the tabs that exist into the owner's order; tabs the owner didn't place keep their built-in order after the placed ones. */
export function orderTabs<T extends { id: string }>(tabs: T[], design: Record<string, any> | undefined | null): T[] {
  const chosen = chosenTabOrder(design);
  if (!chosen.length) return tabs;
  const rank = (id: string) => { const i = chosen.indexOf(id as PdpTabId); return i < 0 ? chosen.length : i; };
  return tabs.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.id) - rank(b.t.id) || a.i - b.i).map((x) => x.t);
}
