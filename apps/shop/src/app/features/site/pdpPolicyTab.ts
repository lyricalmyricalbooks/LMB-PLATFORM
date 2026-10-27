// "Shipping & returns" tab on the book page (Shopify themes' collapsible "Shipping & returns" row), Studio ›
// Style › Book page · photos & layout › showPdpPolicyTab (off by default). It shows only the shop's own words
// from Settings › General › Store policies (never invented terms): the Shipping policy for books that are shipped (not e-books
// or gift cards) and the Returns policy for every book, each with a link to the full policy page.
import { isPickupItem } from "./pickupAvailability";
import type { PolicyKey } from "./policyPages";

export type PolicyEntry = { key: PolicyKey; text: string };

/** The policies the tab shows, in order; empty = no tab. */
export function pdpPolicyEntries(policies: Partial<Record<string, unknown>> | null | undefined, book: any, variant?: any): PolicyEntry[] {
  if (!book) return [];
  const text = (k: PolicyKey) => (typeof policies?.[k] === "string" ? String(policies[k]).trim() : "");
  const keys: PolicyKey[] = isPickupItem(book, variant) ? ["shipping", "returns"] : ["returns"];
  return keys.map((key) => ({ key, text: text(key) })).filter((e) => e.text);
}
