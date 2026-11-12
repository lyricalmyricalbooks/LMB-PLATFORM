// The QuickBooks link in the control room (services/accounting, hosted at /api/accounting): whether it's switched on,
// and each shop that connected a QuickBooks company: connected, lost (QuickBooks stopped taking its sales) or
// disconnected by the press, when sales were last sent, and when the connection ends. Read only; never Intuit's
// tokens or the company's QuickBooks id.
//
// Clients passed in:
//   switchedOn   "on" | "off" (ACCOUNTING_ENABLED isn't "true") | "no-keys" (no Intuit keys yet) | "broken" (settings
//                don't go together, so the link stays off)
//   connections  accountingConnections: list()
//   registry     getShop(shopId) for the press's name
import { adminOf } from "./controlRoom.js";

const SWITCH = new Set(["on", "off", "no-keys", "broken"]);
/** Sales go every night, so a connected shop with nothing sent for this long is behind. */
export const BEHIND_MS = 2 * 24 * 60 * 60 * 1000;

/** One shop's QuickBooks row as the page shows it. */
export function quickbooksShop(row, shop, nowMs) {
  const state = !row.disconnectedAt ? "connected" : row.problem === "lost" ? "lost" : "disconnected";
  const since = Date.parse(row.lastSent?.at ?? row.connectedAt ?? "");
  return {
    shopId: row.shopId,
    pressName: shop?.pressName ?? row.shopId,
    company: row.companyName ?? null,
    sandbox: row.mode === "test",
    state,
    connectedAt: row.connectedAt ?? null,
    disconnectedAt: row.disconnectedAt ?? null,
    lastSentDay: row.lastSent?.date ?? null,
    behind: state === "connected" && Number.isFinite(since) && nowMs - since > BEHIND_MS,
    endsOn: state === "connected" && row.warnedFor ? String(row.warnedFor).slice(0, 10) : null,
  };
}

export function createQuickBooksDesk({ admins, switchedOn = "off", connections, registry, now = () => new Date() }) {
  return {
    async overview(claims) {
      const nowMs = now().getTime();
      adminOf(claims, admins, nowMs);
      const rows = connections?.list ? await connections.list() : [];
      const shops = [];
      for (const row of rows) if (row?.shopId) shops.push(quickbooksShop(row, await registry.getShop(row.shopId).catch(() => null), nowMs));
      // Lost first, then behind, then connected, then disconnected by the press; by name within each.
      const rank = (s) => (s.state === "lost" ? 0 : s.behind ? 1 : s.state === "connected" ? 2 : 3);
      shops.sort((a, b) => rank(a) - rank(b) || a.pressName.localeCompare(b.pressName));
      return {
        switchedOn: SWITCH.has(switchedOn) ? switchedOn : "off",
        shops,
        counts: { connected: shops.filter((s) => s.state === "connected").length, lost: shops.filter((s) => s.state === "lost").length, behind: shops.filter((s) => s.behind).length },
      };
    },
  };
}

//   POST /api/control/quickbooks  {}: whether the QuickBooks link is on, and each shop that connected it (read only)
export function quickbooksDeskRoutes(desk) {
  return { "POST /api/control/quickbooks": (claims) => desk.overview(claims) };
}
