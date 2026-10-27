// Pure helpers shared by the storefront's analytics writes (lib/commerce.ts) and the admin Overview's reads.
// They live here, not in admin/overview/overviewTraffic.ts, so the shopper bundle never pulls in admin analytics code.

/**
 * The key a source/category/book is stored under in a daily `analytics/<date>` map: Firestore dislikes some
 * characters in map keys, so "duckduckgo.com" is stored as "duckduckgo com". The Overview applies the same
 * function to an order's referral source so visits and orders land on one row.
 */
export const analyticsKey = (v: string) => String(v ?? "").replace(/[.~*/[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

export const deviceOf = (width: number): "mobile" | "tablet" | "desktop" => (width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop");

/**
 * A search term safe to store: lowercase, trimmed, ≤40 chars, no characters Firestore map keys dislike.
 * Returns null for anything that looks personal (an email address, an order or phone number) or is empty.
 */
export function cleanSearchTerm(raw: unknown): string | null {
  const t = String(raw ?? "").toLowerCase().replace(/[.~*/[\]\\`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  if (t.length < 2) return null;
  if (/@|https?:|www\./.test(String(raw ?? "").toLowerCase())) return null;
  if (/\d{6,}/.test(t.replace(/[\s-]/g, ""))) return null;
  return t;
}
