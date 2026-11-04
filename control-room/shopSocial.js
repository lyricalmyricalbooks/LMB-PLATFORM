// A shop's social channels (control room, code plan 27.8): each network the press connected (Facebook and Instagram,
// Pinterest, TikTok), whether it still works, the account's name, how many pages or boards it posts to, when the
// product file last went to the network's catalog, and the shop's recent posts that didn't go out. Plus the lost
// connections across every shop, so a network that dropped many presses at once is seen in one place. Read only; never
// a token (services/social/social.js controlRoom() leaves them out).
//
// Clients passed in:
//   registry  getShop(shopId); listShops(); readEvents(shopId, { limit }) -> the shop's events, newest first
//   social    optional: controlRoom(shopId) -> [{ network, name, connected, problem, lostAt, lostDetail, accountName,
//             places, catalog, connectedAt, disconnectedAt }]. Missing until the social service has its hosted home.
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { NETWORK_NAMES } from "../services/social/endpoints.js";

export const FAILED_DAYS = 30;
const FAILED_SHOWN = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const OFF_WORDS = "Social channels aren't switched on yet.";

/** The shop's posts that failed in the last 30 days, newest first: [{ at, network, name, detail }]. */
export function failedPosts(events, now) {
  const since = new Date(now.getTime() - FAILED_DAYS * DAY_MS).toISOString();
  return events
    .filter((e) => e?.kind === "social.failed" && typeof e.at === "string" && e.at >= since)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((e) => ({ at: e.at, network: e.network ?? null, name: NETWORK_NAMES[e.network] ?? e.network ?? null, detail: String(e.detail ?? "").slice(0, 200) || null }));
}

export function createShopSocial({ admins, registry, social, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (!social?.controlRoom) return { shopId, networks: null, words: OFF_WORDS };
      try {
        const [networks, events] = await Promise.all([social.controlRoom(shopId), registry.readEvents ? registry.readEvents(shopId, { limit: 300 }) : []]);
        const failed = failedPosts(events, now());
        return { shopId, networks, failed: failed.slice(0, FAILED_SHOWN), failedCount: failed.length };
      } catch (failure) {
        throw new ControlError(502, `Couldn't read the social channels: ${failure.message}`);
      }
    },

    /** Every lost connection across the shops that aren't closed, newest first. */
    async lost(claims) {
      adminOf(claims, admins, now().getTime());
      if (!social?.controlRoom) return { lost: null, words: OFF_WORDS };
      const shops = (await registry.listShops()).filter((row) => row.status !== "closed" && row.status !== "deleted");
      const lost = [];
      const problems = [];
      await eachInTurn(shops, 5, async (row) => {
        try {
          for (const n of await social.controlRoom(row.shopId)) {
            if (n.connected && n.problem === "lost") lost.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, network: n.network, name: n.name, accountName: n.accountName, lostAt: n.lostAt, lostDetail: n.lostDetail });
          }
        } catch (failure) {
          problems.push(`${row.shopId}: ${String(failure?.message ?? failure).slice(0, 120)}`);
        }
      });
      lost.sort((a, b) => (String(a.lostAt) < String(b.lostAt) ? 1 : -1));
      return { lost, problems };
    },
  };
}

//   POST /api/control/shop-social  { shopId }: one shop's social channels and its recent failed posts
//   POST /api/control/social-lost  {}: lost social connections across the shops
export function shopSocialRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/shop-social": (claims, request) => desk.forShop(claims, body(request)),
    "POST /api/control/social-lost": (claims) => desk.lost(claims),
  };
}
