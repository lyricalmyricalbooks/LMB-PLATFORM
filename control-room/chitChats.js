// Colophon's own Chit Chats app in the control room (code plan 26.11 follow-up): whether it's switched on, and for each
// connected shop how many paid orders wait for a tracking number (the oldest flagged after three days), the orders that
// ran into a problem, and the last problem Chit Chats reported. Read only; never the press's Chit Chats details.
//
// Clients passed in:
//   chitchats  ready() -> whether the app has its id, secret and sealing key (services/chitchats/app.js)
//   stores     connections.list(); shipments.listOpen(shopId), shipments.listProblems(shopId)
//   registry   getShop(shopId) for the press's name
import { adminOf, eachInTurn } from "./controlRoom.js";

export const WAITING_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROBLEMS_SHOWN = 3;

export function createChitChatsDesk({ admins, chitchats, stores, registry, now = () => new Date() }) {
  return {
    async overview(claims) {
      adminOf(claims, admins, now().getTime());
      const ready = Boolean(chitchats?.ready?.());
      const rows = await stores.connections.list();
      const late = new Date(now().getTime() - WAITING_DAYS * DAY_MS).toISOString();
      const shops = [];
      await eachInTurn(rows, 5, async (row) => {
        const [open, problems, shop] = await Promise.all([
          stores.shipments.listOpen(row.shopId),
          stores.shipments.listProblems ? stores.shipments.listProblems(row.shopId) : [],
          registry.getShop(row.shopId).catch(() => null),
        ]);
        const oldest = open.map((s) => s.createdAt).filter((a) => typeof a === "string").sort()[0] ?? null;
        problems.sort((a, b) => (String(a.updatedAt ?? a.createdAt) < String(b.updatedAt ?? b.createdAt) ? 1 : -1));
        shops.push({
          shopId: row.shopId, pressName: shop?.pressName ?? row.shopId, connectedAt: row.connectedAt ?? null,
          waiting: open.length, oldestWaitingAt: oldest, late: Boolean(oldest && oldest < late),
          problems: problems.length,
          problemOrders: problems.slice(0, PROBLEMS_SHOWN).map((s) => ({ orderNumber: s.orderNumber ?? s.orderId, words: String(s.problem ?? "").slice(0, 200) || null, at: s.updatedAt ?? s.createdAt ?? null })),
          lastProblem: row.lastProblem ? { at: row.lastProblem.at ?? null, words: String(row.lastProblem.words ?? "").slice(0, 200) } : null,
        });
      });
      const needs = (s) => (s.lastProblem ? 4 : 0) + (s.problems ? 2 : 0) + (s.late ? 1 : 0);
      shops.sort((a, b) => needs(b) - needs(a) || a.pressName.localeCompare(b.pressName));
      return { ready, shops, waitingDays: WAITING_DAYS };
    },
  };
}

//   POST /api/control/chitchats  {}: whether Chit Chats is on, and each connected shop's waiting and problem orders
export function chitChatsDeskRoutes(desk) {
  return { "POST /api/control/chitchats": (claims) => desk.overview(claims) };
}
