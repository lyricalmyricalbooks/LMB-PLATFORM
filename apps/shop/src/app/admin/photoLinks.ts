// Photo links in an import preview (plan 23.3). An old shop's file names each photo by its address on the old shop,
// and some of those already lead nowhere (a deleted picture, a closed shop). Before anything is saved, the preview
// tries to load each new photo the way a page would (an <img>, so no permission from the old shop is needed) and
// lists the ones that fail. Books › Import then leaves those out, so a book never arrives with a blank photo and the
// shop's server doesn't keep retrying to copy them. A photo that is only slow counts as fine: only a real failure
// to load is reported.
import { useEffect, useState } from "react";
import type { ImportPlan } from "./catalogImport";

/** At most this many photos are tried per preview; the rest are taken as they are. */
export const MAX_CHECKED = 300;
const CONCURRENCY = 6;
const TIMEOUT_MS = 10_000;

export type ImageLoader = (url: string) => Promise<boolean>;

/** True when the picture loaded, false when it failed; true when it took too long (only slow, not gone). */
export const loadsInBrowser: ImageLoader = (url) => new Promise((resolve) => {
  if (typeof Image === "undefined") { resolve(true); return; }
  const img = new Image();
  const timer = setTimeout(() => { img.src = ""; resolve(true); }, TIMEOUT_MS);
  img.onload = () => { clearTimeout(timer); resolve(true); };
  img.onerror = () => { clearTimeout(timer); resolve(false); };
  img.referrerPolicy = "no-referrer";
  img.src = url;
});

let loader: ImageLoader = loadsInBrowser;
/** Tests and the Studio fixture answer photo checks themselves. */
export function setImageLoader(next: ImageLoader | null) { loader = next ?? loadsInBrowser; }

const workRows = (plan: ImportPlan) => plan.rows.filter((r) => r.action === "create" || r.action === "update");

/** The new photo addresses a preview would save, each once, in file order. */
export function photoUrlsOf(plan: ImportPlan): string[] {
  const urls = new Set<string>();
  for (const row of workRows(plan)) for (const p of Array.isArray(row.patch?.photos) ? row.patch.photos : []) if (typeof p?.url === "string" && /^https:\/\//.test(p.url)) urls.add(p.url);
  return [...urls];
}

/** The addresses among `urls` whose picture fails to load (up to MAX_CHECKED tried, a few at a time). */
export async function brokenPhotos(urls: string[], load: ImageLoader = loader): Promise<Set<string>> {
  const broken = new Set<string>();
  const queue = urls.slice(0, MAX_CHECKED);
  const worker = async () => { for (let url = queue.shift(); url; url = queue.shift()) if (!(await load(url).catch(() => true))) broken.add(url); };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return broken;
}

/** The plan with the broken photos left out of every row that had them, each such row saying so. */
export function withoutBrokenPhotos(plan: ImportPlan, broken: Set<string>): ImportPlan {
  if (!broken.size) return plan;
  return {
    ...plan,
    rows: plan.rows.map((row) => {
      const photos: any[] = Array.isArray(row.patch?.photos) ? row.patch.photos : [];
      const gone = photos.filter((p) => broken.has(p?.url)).length;
      if (!gone || (row.action !== "create" && row.action !== "update")) return row;
      const kept = photos.filter((p) => !broken.has(p?.url));
      const note = `${gone === 1 ? "A photo" : `${gone} photos`} couldn't be loaded from the old shop, so ${gone === 1 ? "it was" : "they were"} left out. Add ${gone === 1 ? "it" : "them"} in the book editor.`;
      return { ...row, patch: { ...row.patch, photos: kept }, warnings: [...row.warnings, note] };
    }),
  };
}

/** The preview's photo check: `checking` while it runs, then the broken addresses. Re-runs when the plan changes. */
export function useBrokenPhotos(plan: ImportPlan | null | undefined): { checking: boolean; broken: Set<string>; checked: number } {
  const [state, setState] = useState<{ checking: boolean; broken: Set<string>; checked: number }>({ checking: false, broken: new Set(), checked: 0 });
  useEffect(() => {
    const urls = plan && !plan.problems.length ? photoUrlsOf(plan) : [];
    if (!urls.length) { setState({ checking: false, broken: new Set(), checked: 0 }); return; }
    let live = true;
    setState({ checking: true, broken: new Set(), checked: 0 });
    void brokenPhotos(urls).then((broken) => { if (live) setState({ checking: false, broken, checked: Math.min(urls.length, MAX_CHECKED) }); });
    return () => { live = false; };
  }, [plan]);
  return state;
}

/** One plain line for the preview, or "" when there's nothing to say. */
export function photoCheckLine({ checking, broken }: { checking: boolean; broken: Set<string> }, keptAnyway = false): string {
  if (checking) return "Checking that each photo can still be loaded from the old shop…";
  if (!broken.size) return "";
  const n = broken.size;
  return keptAnyway
    ? `${n} photo${n === 1 ? "" : "s"} couldn't be loaded from the old shop. ${n === 1 ? "That book comes" : "Those books come"} over without ${n === 1 ? "it" : "them"}: add new photos in the book editor once your shop is open.`
    : `${n} photo${n === 1 ? "" : "s"} couldn't be loaded from the old shop, so ${n === 1 ? "it is" : "they are"} left out. The books affected say so below.`;
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The file's text with each broken photo address blanked wherever it stands as a whole cell or list item, for setup
 * mode, which keeps the file itself for the shop to bring in later. An address written differently in the file stays.
 */
export function fileWithoutPhotos(text: string, broken: Set<string>): string {
  let out = text;
  for (const url of broken) out = out.replace(new RegExp(`${escaped(url)}(?=$|[",;|\\r\\n])`, "g"), "");
  return out;
}
