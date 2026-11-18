// Fundraisers (Donations & tips beta, G2; LMB-PLATFORM tasks/todo/2026-11-18-giving-g2.md): a goal, an end day and a
// story on the shop's Support page. One fundraiser runs at a time. Gifts given to it count toward the goal: the server
// adds each one as it is paid (functions/giving.js), so the total can't be faked from a browser. Pure, shared by the
// admin, the Support page and the server (functions/shared copy).

export const MIN_GOAL_MINOR = 10_000;
export const MAX_GOAL_MINOR = 100_000_000;
export const MAX_TITLE = 80;
export const MAX_STORY = 5000;
/** Supporters shown on the wall, newest first (each one asked to be shown). */
export const MAX_WALL = 60;
/** A fundraiser runs for at most this many days. */
export const MAX_DAYS = 366;

export type FundraiserStatus = "draft" | "live" | "ended";
export type FundraiserInput = { title: string; story: string; goalMinor: number; endsOn: string; wall: boolean };
export type WallEntry = { gift: string; name: string; at: string };
/** What anyone may see of a fundraiser (the Support page, the owner's preview). */
export type PublicFundraiser = {
  id: string; title: string; story: string; goalMinor: number; raisedMinor: number; supporters: number; endsOn: string;
  state: FundraiserStatus; wall: { name: string; at: string }[]; showWall: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max);
const whole = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);

/** The day `n` days after a YYYY-MM-DD day (UTC arithmetic, so no clock change moves it). */
export function dayAfter(day: string, n: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The owner's form, cleaned, or why it can't be saved. `today` is the shop's own day (YYYY-MM-DD). */
export function cleanFundraiser(raw: unknown, today: string): FundraiserInput | { problem: string; field: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = text(r.title, MAX_TITLE).replace(/\s+/g, " ");
  if (title.length < 3) return { problem: "Give the fundraiser a name.", field: "title" };
  const story = text(r.story, MAX_STORY);
  const goalMinor = whole(r.goalMinor);
  if (!Number.isFinite(goalMinor) || goalMinor < MIN_GOAL_MINOR) return { problem: "Set a goal of at least 100.", field: "goal" };
  if (goalMinor > MAX_GOAL_MINOR) return { problem: "Set a goal of at most 1,000,000.", field: "goal" };
  const endsOn = String(r.endsOn ?? "");
  if (!DAY.test(endsOn) || Number.isNaN(Date.parse(`${endsOn}T00:00:00Z`))) return { problem: "Pick the last day of the fundraiser.", field: "endsOn" };
  if (endsOn < today) return { problem: "The last day can't be in the past.", field: "endsOn" };
  if (endsOn > dayAfter(today, MAX_DAYS)) return { problem: "A fundraiser can run for a year at most.", field: "endsOn" };
  return { title, story, goalMinor, endsOn, wall: r.wall !== false };
}

/** Draft until started, live until the end of its last day (the shop's day) or until ended early. */
export function fundraiserState(f: { status?: unknown; endsOn?: unknown }, today: string): FundraiserStatus {
  if (f.status === "draft") return "draft";
  if (f.status === "ended") return "ended";
  return typeof f.endsOn === "string" && f.endsOn >= today ? "live" : "ended";
}

/** Whole days left, counting today; 0 once it has ended. */
export function daysLeft(endsOn: string, today: string): number {
  if (!DAY.test(endsOn) || endsOn < today) return 0;
  return Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) + 1;
}

/** How far along, 0 to 100 for the bar (a goal passed shows full), and the real percent for the words. */
export function goalProgress(raisedMinor: number, goalMinor: number): { bar: number; percent: number } {
  if (!(goalMinor > 0)) return { bar: 0, percent: 0 };
  const percent = Math.floor((Math.max(0, raisedMinor) / goalMinor) * 100);
  return { bar: Math.min(100, percent), percent };
}

/** The wall after a gift: newest first, one line per gift, at most MAX_WALL. */
export function wallWith(wall: readonly WallEntry[], entry: WallEntry): WallEntry[] {
  return [entry, ...wall.filter((w) => w.gift !== entry.gift)].slice(0, MAX_WALL);
}

/** The wall without a refunded gift. */
export const wallWithout = (wall: readonly WallEntry[], gift: string): WallEntry[] => wall.filter((w) => w.gift !== gift);

/** A stored fundraiser as anyone may see it: never gift ids or emails. */
export function publicFundraiser(id: string, f: Record<string, unknown>, today: string): PublicFundraiser {
  const showWall = f.wall !== false;
  const wall = showWall && Array.isArray(f.wallEntries) ? (f.wallEntries as WallEntry[]).map((w) => ({ name: String(w?.name || ""), at: String(w?.at || "") })).filter((w) => w.name) : [];
  return {
    id, title: String(f.title || ""), story: String(f.story || ""), goalMinor: Number(f.goalMinor) || 0, raisedMinor: Math.max(0, Number(f.raisedMinor) || 0),
    supporters: Math.max(0, Number(f.supporters) || 0), endsOn: String(f.endsOn || ""), state: fundraiserState(f, today), wall, showWall,
  };
}
