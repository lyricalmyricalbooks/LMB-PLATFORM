// The Overview's sub tabs (20 October 2026): one tab per topic band, plus "Everything" (the old long board), and a
// second row inside Visitors. The open tab lives in the address (`#overview/visitors/move`) so Back, reloads and links
// open it, and the last one is remembered in this browser. Pure.
import { WIDGETS, type BandId, type Board, type WidgetType } from "./overviewBoard";

export type TopTab = BandId | "all";
export type VisitorGroup = "now" | "from" | "move" | "do" | "leave";
export type OverviewTab = { band: TopTab; sub: VisitorGroup | "all" };

/** Address words for each tab ("traffic" is the Visitors band). */
const SLUGS: Record<TopTab, string> = {
  today: "today", sales: "sales", titles: "titles", traffic: "visitors", search: "search", customers: "customers", stock: "stock", all: "all",
};
const FROM_SLUG = new Map(Object.entries(SLUGS).map(([band, slug]) => [slug, band as TopTab]));

export const VISITOR_GROUPS: Array<{ id: VisitorGroup; label: string }> = [
  { id: "now", label: "Right now" },
  { id: "from", label: "Where they come from" },
  { id: "move", label: "How they move" },
  { id: "do", label: "What they do" },
  { id: "leave", label: "Where they leave" },
];
const GROUP_IDS = new Set<string>(VISITOR_GROUPS.map(g => g.id));

/** Which Visitors sub tab each Visitors widget sits under. */
export const VISITOR_GROUP_OF: Partial<Record<WidgetType, VisitorGroup>> = {
  gaKpis: "now", livePages: "now", newReturning: "now",
  channels: "from", gaSources: "from", landing: "from", gaCountries: "from", gaDevices: "from", sources: "from", campaigns: "from",
  landingSales: "from", devices: "from", firstPage: "from",
  moves: "move", sectionClicks: "move", pageTime: "move", gaPages: "move", visitHours: "move", navLinks: "move", notFound: "move", journeys: "move",
  actions: "do", bookPage: "do", filters: "do", readDepth: "do", clarity: "do",
  dropOff: "leave", funnel: "leave", checkout: "leave", deviceSteps: "leave", outbound: "leave", bagPeek: "leave", exitPages: "leave",
};

export const DEFAULT_TAB: OverviewTab = { band: "today", sub: "all" };

/** `#overview/visitors/move` → the tab; anything else (or no sub-path) → null. */
export function tabFromHash(hash: string): OverviewTab | null {
  const parts = hash.replace(/^#/, "").split("?")[0].split("/");
  if (parts[0] !== "overview" || !parts[1]) return null;
  const band = FROM_SLUG.get(parts[1]);
  if (!band) return null;
  const sub = band === "traffic" && GROUP_IDS.has(parts[2]) ? (parts[2] as VisitorGroup) : "all";
  return { band, sub };
}

export function hashForTab(tab: OverviewTab): string {
  return `#overview/${SLUGS[tab.band]}${tab.band === "traffic" && tab.sub !== "all" ? `/${tab.sub}` : ""}`;
}

/** Tabs that have something on this board, in the board's band order, then Everything. */
export function topTabs(board: Board, editing: boolean): TopTab[] {
  const bands = board.bands.filter(b => !b.hidden && (editing || b.widgets.length > 0)).map(b => b.id as TopTab);
  return [...bands, "all"];
}

/** Visitors sub tabs that hold a widget on this board (none when fewer than two would show). */
export function visitorGroups(board: Board): Array<{ id: VisitorGroup; label: string; count: number }> {
  const band = board.bands.find(b => b.id === "traffic");
  const groups = VISITOR_GROUPS.map(g => ({ ...g, count: (band?.widgets || []).filter(w => groupOf(w.type) === g.id).length })).filter(g => g.count > 0);
  return groups.length > 1 ? groups : [];
}

/** A Visitors widget's sub tab; a widget missing from the map shows under "What they do". */
export const groupOf = (type: WidgetType): VisitorGroup => VISITOR_GROUP_OF[type] || "do";

/** The tab to show: the one asked for when the board has it, else the first tab. */
export function settleTab(tab: OverviewTab, board: Board, editing: boolean): OverviewTab {
  const tops = topTabs(board, editing);
  const band = tops.includes(tab.band) ? tab.band : tops[0];
  if (band !== "traffic") return { band, sub: "all" };
  const groups = visitorGroups(board);
  return { band, sub: tab.sub !== "all" && groups.some(g => g.id === tab.sub) ? tab.sub : "all" };
}

/** The tab a widget of this type is shown under (to switch there after adding or showing it). */
export function tabForType(type: WidgetType): OverviewTab {
  const band = WIDGETS.find(w => w.type === type)!.band;
  return { band, sub: band === "traffic" ? groupOf(type) : "all" };
}

const TAB_KEY = "lm:overview-tab";
export function readSavedTab(): OverviewTab | null {
  try { return tabFromHash(localStorage.getItem(TAB_KEY) || ""); } catch { return null; }
}
export function saveTab(tab: OverviewTab) {
  try { localStorage.setItem(TAB_KEY, hashForTab(tab)); } catch { /* private window: the first tab opens next time */ }
}
