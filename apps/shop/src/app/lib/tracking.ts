// Carrier tracking links shared by the admin, the customer account and order
// tracking. Keep in step with getTrackingUrl in functions/index.js.
export const CARRIERS = ["Canada Post", "Purolator", "UPS", "FedEx", "DHL", "USPS", "Canpar", "Chit Chats", "Stallion Express"];

// Only plain web links may be stored and shown to shoppers (no javascript: etc.).
export function cleanTrackingLink(url: unknown): string {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function getTrackingUrl(carrier: string, trackingNum: string, customUrl?: string): string {
  const custom = cleanTrackingLink(customUrl);
  if (custom) return custom;
  // Shippo reports carriers as tokens ("canada_post"), people type "Canada Post".
  const c = (carrier || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const n = encodeURIComponent((trackingNum || "").trim());
  if (c.includes("canada post")) return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${n}`;
  if (c.includes("purolator")) return `https://www.purolator.com/en/shipping/tracker?pin=${n}`;
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes("fedex")) return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${n}`;
  if (c.includes("dhl")) return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
  if (c.includes("canpar")) return `https://www.canpar.com/en/tracking/delivery_options.htm?barcode=${n}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier || ""} ${trackingNum || ""}`.trim())}`;
}
