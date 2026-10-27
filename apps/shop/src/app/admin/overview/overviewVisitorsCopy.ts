// The one-line headlines and small formats of the visitor widgets (OverviewVisitors.tsx). Pure, so the sentences are tested
// and the widget file only draws. Every sentence answers the widget's question in plain shop English.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** Seconds as m:ss ("2:05"); an hour or more as h:mm:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** 0 → "12am", 11 → "11am", 13 → "1pm". */
export const hourName = (h: number) => `${(h % 12) || 12}${h % 24 < 12 ? "am" : "pm"}`;

/** A day given as "Sat", "Saturday" or a Monday-first index → "Saturday". */
export function dayName(day: string | number): string {
  if (typeof day === "number") return DAYS[((day % 7) + 7) % 7] || "";
  return SHORT_DAYS[day] || day;
}

const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? "person" : "people"}`;
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Widget "Being read right now". */
export function liveHeadline(nowCount: number | null, topPage: { label: string; people: number } | null): string {
  if (!nowCount) return topPage ? `${people(topPage.people)} reading ${topPage.label} in the last few minutes.` : "Nobody is on the site this minute.";
  return topPage ? `${people(nowCount)} on the site right now — most on ${topPage.label}.` : `${people(nowCount)} on the site right now.`;
}

/** Widget "Pages people actually read". */
export function pageTimeHeadline(top: { label: string; seconds: number; views: number } | null, sort: "time" | "views" = "time"): string {
  if (!top) return "No page had enough views to judge yet.";
  return sort === "views"
    ? `${top.label} is read most — ${top.views.toLocaleString()} views, ${clock(top.seconds)} each.`
    : `${top.label} holds readers longest — ${clock(top.seconds)} a view.`;
}

/** Widget "When visitors come". */
export function visitHoursHeadline(busiest: { day: string | number; hour: number; value: number } | null): string {
  if (!busiest || !(busiest.value > 0)) return "No visits recorded by hour yet.";
  return `Most visitors come on ${dayName(busiest.day)} around ${hourName(busiest.hour)}.`;
}

/** Widget "What visitors do": names the most common action. */
export function actionsHeadline(top: { label: string; people: number } | null, visitors?: number | null): string {
  if (!top || !(top.people > 0)) return "No visitor actions recorded yet.";
  const of = visitors && visitors >= top.people ? ` — ${share(top.people, visitors)}% of visitors` : "";
  return `The most common thing visitors do: ${top.label.toLowerCase()} (${people(top.people)}${of}).`;
}

/** Widget "Links visitors follow away". */
export function outboundHeadline(top: { label: string; clicks: number } | null, totalClicks: number): string {
  if (!top || !(top.clicks > 0)) return "Nobody followed a link away from the shop.";
  const part = totalClicks > top.clicks ? ` — ${share(top.clicks, totalClicks)}% of links followed` : "";
  return `When visitors leave through a link, it is most often to ${top.label}${part}.`;
}

/** Widget "New and returning visitors". `prevReturning` is null when the period before has no figure. */
export function mixHeadline(newCount: number, returning: number, prevNew: number | null, prevReturning: number | null): string {
  const total = newCount + returning;
  if (total <= 0) return "No visitors recorded yet.";
  const r = share(returning, total);
  const prevTotal = (prevNew || 0) + (prevReturning || 0);
  const before = prevReturning !== null && prevTotal > 0 ? share(prevReturning, prevTotal) : null;
  const lead = r >= 50 ? `Most visitors are coming back: ${r}% are returning` : `${r}% of visitors are coming back`;
  if (before === null || before === r) return `${lead}.`;
  return `${lead}, ${r > before ? "up" : "down"} from ${before}% before.`;
}

/** A browser-tab title without the shop's name after it: "Salt Hymns — Lyricalmyrical Books" → "Salt Hymns". */
export function shortPageTitle(title: string): string {
  const t = String(title || "").trim();
  const cut = t.replace(/\s+[—–|·-]\s+[^—–|·]+$/, "").trim();
  return cut || t;
}
