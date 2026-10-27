// Order detail › Customer › "How they found you": the order's `acquisition` (src/app/lib/visitSource.ts) as plain
// rows. Orders placed before it was recorded only have `referralSource` (a short site name, or "direct").
import { cleanAcquisition } from "../lib/visitSource";

export type AcquisitionRow = { label: string; value: string };

const MEDIUM_WORDS: Record<string, string> = {
  organic: "search results",
  social: "social media",
  referral: "a link on another site",
  cpc: "a paid ad",
  paid: "a paid ad",
  email: "an email",
  "(none)": "typed the address or used a bookmark",
};

const CLICK_WORDS: Record<string, string> = {
  gclid: "Google Ads", gbraid: "Google Ads", wbraid: "Google Ads", fbclid: "Facebook or Instagram",
  msclkid: "Microsoft (Bing) Ads", ttclid: "TikTok", li_fat_id: "LinkedIn",
};

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Phone · iPhone", "Computer · Windows"… from the browser description checkout saved on the order. */
export function deviceFromUserAgent(ua: unknown): string {
  const text = typeof ua === "string" ? ua : "";
  if (!text) return "";
  const system = /iPhone/.test(text) ? "iPhone" : /iPad/.test(text) ? "iPad" : /Android/.test(text) ? "Android"
    : /Windows/.test(text) ? "Windows" : /Mac OS X|Macintosh/.test(text) ? "Mac" : /CrOS/.test(text) ? "Chromebook" : /Linux/.test(text) ? "Linux" : "";
  const kind = /iPad|Tablet/.test(text) || (/Android/.test(text) && !/Mobile/.test(text)) ? "Tablet"
    : /Mobi|iPhone|Android/.test(text) ? "Phone" : "Computer";
  return system ? `${kind} · ${system}` : kind;
}

export function sourceSummary(order: any): string {
  const a = cleanAcquisition(order?.acquisition);
  const source = a?.source || (typeof order?.referralSource === "string" ? order.referralSource : "");
  if (!source) return "";
  if (source === "direct") return "Direct visit";
  const medium = a?.medium && a.medium !== "(none)" ? ` (${MEDIUM_WORDS[a.medium] || a.medium})` : "";
  return `${capital(source)}${medium}`;
}

export function acquisitionRows(order: any): AcquisitionRow[] {
  const a = cleanAcquisition(order?.acquisition);
  const rows: AcquisitionRow[] = [];
  const summary = sourceSummary(order);
  if (summary) rows.push({ label: "Came from", value: summary });
  if (a) {
    if (a.campaign) rows.push({ label: "Campaign", value: a.campaign });
    if (a.content) rows.push({ label: "Ad or link", value: a.content });
    if (a.term) rows.push({ label: "Search words", value: a.term });
    if (a.clickId) rows.push({ label: "Ad click", value: `Yes, from ${CLICK_WORDS[a.clickId] || a.clickId}` });
    if (a.referrer) rows.push({ label: "Referring page", value: a.referrer });
    if (a.landingPage) rows.push({ label: "First page seen", value: a.landingPage });
    const first = Date.parse(a.firstSeenAt);
    if (Number.isFinite(first)) rows.push({ label: "First visit", value: new Date(first).toLocaleString() });
  } else if (summary) {
    rows.push({ label: "Note", value: "Placed before campaigns and landing pages were recorded; only the site name was saved." });
  }
  const device = deviceFromUserAgent(order?.metadata?.userAgent);
  if (device) rows.push({ label: "Device", value: device });
  return rows;
}
