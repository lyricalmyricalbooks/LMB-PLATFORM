// The Design page (redesign, 11 November 2026, mockup "Online store"): the look that is live, what is waiting to be
// published, and the shop's pages. Pure, so the words can be tested without Firestore or Studio.
import type { DiffItem } from "./studio/designDiff";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Published 6 Nov" (the year only when it isn't this one), or "" when the date is missing or unreadable. */
export function publishedLine(at: unknown, now = new Date()): string {
  const d = typeof at === "string" || typeof at === "number" ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `Published ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** The live look's name: the theme it started from, or "Your own" when it was made from scratch. */
export function liveLookName(design: any): string {
  const name = design?.themeBase?.name;
  return typeof name === "string" && name.trim() ? name.trim() : "Your own";
}

/** Where the waiting changes are, in a few words: "Home page, footer". */
export function waitingWhere(items: DiffItem[], max = 3): string {
  const places: string[] = [];
  for (const item of items) {
    const place = item.area.split(" · ")[0].trim();
    if (place && !places.some((p) => p.toLowerCase() === place.toLowerCase())) places.push(place);
  }
  const shown = places.slice(0, max).map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)));
  return places.length > max ? `${shown.join(", ")} and more` : shown.join(", ");
}

export type PageRow = { id: string; name: string; live: boolean; studio: string };

/** Home first, then the shop's own pages in their order; each row opens that page in Studio. */
export function pageRows(pages: { id: string; title?: string; slug?: string; status?: string; order?: number }[]): PageRow[] {
  const own = [...pages]
    .filter((p) => p.slug)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => ({ id: p.id, name: (p.title || "").trim() || p.slug!, live: p.status === "published", studio: `page:${p.slug}` }));
  return [{ id: "home", name: "Home", live: true, studio: "heroPage" }, ...own];
}
