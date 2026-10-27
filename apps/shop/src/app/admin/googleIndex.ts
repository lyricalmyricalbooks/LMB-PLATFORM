// Books › Google indexing: which public book pages Google has in its index (functions/searchConsole.js op "inspect",
// Google's URL Inspection API). Pure helpers; the dialog is GoogleIndexDialog.tsx.
import { isLiveBook } from "../features/site/liveBook";
import { resolveProductRoutes } from "../features/site/productRoutes";
import type { BadgeTone } from "./riso/components";

export const MAX_INSPECT = 30; // functions/searchConsole.js MAX_INSPECT

export interface IndexPage { id: string; title: string; url: string }
export interface Inspection {
  url: string; verdict: "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL" | "UNKNOWN"; coverageState?: string; lastCrawlTime?: string;
  googleCanonical?: string; link?: string; error?: boolean;
}

/** The shop's home page, then every book page Google may list (same rules as the sitemap: live, not hidden from search). */
export function indexPages(books: any[], siteUrl: string, now = new Date().toISOString()): IndexPage[] {
  const base = siteUrl.replace(/\/$/, "");
  const live = books.filter(b => b && b.productType !== "giftCard" && isLiveBook(b, now));
  const routed = resolveProductRoutes(live).filter((b: any) => b.seoNoindex !== true);
  return [
    { id: "_home", title: "Home page", url: `${base}/` },
    ...routed.map((b: any) => ({ id: b.id, title: String(b.title || "Untitled"), url: `${base}/books/${encodeURIComponent(b.slug)}` })),
  ].slice(0, MAX_INSPECT);
}

/** Google's answer in plain words, with a badge colour. Google's own reason is shown alongside it. */
export function indexStatus(result: Inspection | undefined): { label: string; tone: BadgeTone } {
  if (!result) return { label: "Not checked", tone: "neutral" };
  if (result.error) return { label: "Couldn't check", tone: "warning" };
  if (result.verdict === "PASS") return { label: "On Google", tone: "success" };
  if (result.verdict === "PARTIAL") return { label: "On Google, with warnings", tone: "info" };
  if (result.verdict === "FAIL") return { label: "Google can't index it", tone: "danger" };
  return { label: "Not on Google yet", tone: "warning" };
}

/** Google picked another address as the main copy of this page (it then shows that one instead). */
export function otherCanonical(result: Inspection | undefined): string {
  const g = result?.googleCanonical || "";
  if (!g || !result) return "";
  const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
  return norm(g) === norm(result.url) ? "" : g;
}
