// Ready to sell (control room; the shop guide's Set up sales tax and Add your store policies steps, code plan 28.2/28.3):
// for each live shop with a website, whether checkout charges tax (rates set, collection switched off, or neither) and
// which of the four store policies have no words. The shop works these out the same way in its own readiness check
// (apps/shop admin/launchReadiness.ts, from `settings/website`); a test keeps the policy list in step. Read only.
//
// Clients passed in:
//   registry  getShop(shopId); listShops()
//   shopData  get(shopId, "settings/website")
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";

/** The policies a shop must show before it sells, as the shop names them (launchReadiness.ts REQUIRED_POLICIES). */
export const REQUIRED_POLICIES = Object.freeze([["shipping", "Shipping"], ["returns", "Returns"], ["privacy", "Privacy"], ["terms", "Terms"]]);
const hasText = (value) => typeof value === "string" && value.trim().length > 0;

/** { tax: "rates" | "off" | "none", rates, missingPolicies: ["Returns", …] } from the shop's settings. */
export function sellReadyOf(settings) {
  const collecting = settings?.taxes?.collect !== false;
  const rates = collecting ? (settings?.taxes?.rates ?? []).filter((r) => Number(r?.rate) > 0).length : 0;
  return {
    tax: !collecting ? "off" : rates ? "rates" : "none",
    rates,
    missingPolicies: REQUIRED_POLICIES.filter(([key]) => !hasText(settings?.policies?.[key])).map(([, label]) => label),
  };
}

const sells = (row) => row.status === "live" && row.plan !== "stockroom" && !row.testShop;

export function createSellReady({ admins, registry, shopData, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (row.plan === "stockroom") return { shopId, ready: null, words: "A stockroom has no website checkout." };
      return { shopId, ready: sellReadyOf(await shopData.get(shopId, "settings/website")) };
    },

    /** The live shops that charge no tax without saying so, or miss a store policy; missing policies first. */
    async gaps(claims) {
      adminOf(claims, admins, now().getTime());
      const shops = (await registry.listShops()).filter(sells);
      const gaps = [];
      const unread = [];
      await eachInTurn(shops, 5, async (row) => {
        try {
          const ready = sellReadyOf(await shopData.get(row.shopId, "settings/website"));
          if (ready.tax === "none" || ready.missingPolicies.length) gaps.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, ...ready });
        } catch {
          unread.push(row.shopId);
        }
      });
      gaps.sort((a, b) => b.missingPolicies.length - a.missingPolicies.length || a.pressName.localeCompare(b.pressName));
      return { gaps, checked: shops.length, unread };
    },
  };
}

//   POST /api/control/sell-ready  { shopId }: one shop's sales tax and store policies
//   POST /api/control/sell-gaps   {}: live shops with no tax rates (and collection on) or a missing store policy
export function sellReadyRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/sell-ready": (claims, request) => desk.forShop(claims, body(request)),
    "POST /api/control/sell-gaps": (claims) => desk.gaps(claims),
  };
}
