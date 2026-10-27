/**
 * Cleans an order number a shopper typed or pasted: the thank-you page and
 * emails show it after a "#" sign, copies often carry spaces, and a "/" would make
 * the Firestore document lookup throw. Returns "" when nothing usable is left.
 */
export function normalizeOrderNumber(input: string): string {
  const cleaned = String(input || "").replace(/\s+/g, "").replace(/^#+/, "");
  return cleaned.includes("/") ? "" : cleaned;
}
