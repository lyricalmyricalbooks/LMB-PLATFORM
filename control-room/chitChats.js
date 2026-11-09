// Colophon's own Chit Chats app in the control room (code plan 26.11 follow-up): whether it's switched on, and for each
// connected shop how many paid orders wait for a tracking number (the oldest flagged after three days), the orders that
// ran into a problem, and the last problem Chit Chats reported. Read only; never the press's Chit Chats details.
//
// Clients passed in:
//   chitchats  ready() -> whether the app has its id, secret and sealing key (services/chitchats/app.js)
//   stores     connections.list(), connections.get(shopId); shipments.listOpen(shopId), shipments.listProblems(shopId)
//   registry   getShop(shopId) for the press's name
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";

export const WAITING_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROBLEMS_SHOWN = 3;
const SHOP_SHOWN = 20;

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

    /** One shop's Chit Chats orders, for its record: those waiting for tracking (oldest first) and those with a problem. */
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      if (typeof shopId !== "string" || !shopId) throw new ControlError(404, "There's no shop with that id.");
      const row = await stores.connections.get(shopId);
      if (!row) return { connected: false };
      const [open, problems] = await Promise.all([
        stores.shipments.listOpen(shopId),
        stores.shipments.listProblems ? stores.shipments.listProblems(shopId) : [],
      ]);
      const late = new Date(now().getTime() - WAITING_DAYS * DAY_MS).toISOString();
      const order = (s) => s.orderNumber ?? s.orderId ?? null;
      open.sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? -1 : 1));
      problems.sort((a, b) => (String(a.updatedAt ?? a.createdAt) < String(b.updatedAt ?? b.createdAt) ? 1 : -1));
      return {
        connected: true, connectedAt: row.connectedAt ?? null, waitingDays: WAITING_DAYS,
        lastProblem: row.lastProblem ? { at: row.lastProblem.at ?? null, words: String(row.lastProblem.words ?? "").slice(0, 200) } : null,
        waiting: open.slice(0, SHOP_SHOWN).map((s) => ({ order: order(s), since: s.createdAt ?? null, late: typeof s.createdAt === "string" && s.createdAt < late })),
        waitingCount: open.length,
        problems: problems.slice(0, SHOP_SHOWN).map((s) => ({ order: order(s), words: String(s.problem ?? "").slice(0, 200) || null, at: s.updatedAt ?? s.createdAt ?? null })),
        problemCount: problems.length,
      };
    },
  };
}

//   POST /api/control/chitchats  {}: whether Chit Chats is on, and each connected shop's waiting and problem orders
//   POST /api/control/shop-chitchats  { shopId }: one shop's waiting and problem orders, for its record
export function chitChatsDeskRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/chitchats": (claims) => desk.overview(claims),
    "POST /api/control/shop-chitchats": (claims, request) => desk.forShop(claims, body(request)),
  };
}
