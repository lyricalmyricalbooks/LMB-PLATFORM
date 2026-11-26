// Shop types in the control room (shop types plan, part 5, 26 November 2026): how many live shops are a Product shop,
// Services, or Products and services, how many of the product shops sell books, and every change of type an owner made
// in Settings › General › What you offer › Change type (newest first, with Switch back marked). Read only.
//
// The type lives in the shop's own `firstWeek/start` (apps/shop admin/servicesSetup.ts `shopKindOf`): a services answer
// in `sells` is Services, or Products and services when `sellsProducts` is true; any other answer is a Product shop.
// A shop that hasn't answered in Settings yet goes by its sign-up answer (the registry's `publishes`). A change is the
// `typeChange` record (admin/shopTypeChange.ts): { at, from, to, website, undoneAt? }.
//
// Clients passed in:
//   registry  listShops()
//   shopData  get(shopId, path)
import { ControlError, adminOf } from "./controlRoom.js";
import { PLANS } from "../setup/steps.js";
import { sellsBooks, sellsOf, sellsServices } from "../shared/sells/sells.js";

export const START_DOC = "firstWeek/start";
const KINDS = ["products", "services", "both"];
export const TYPE_WORDS = Object.freeze({ products: "Product shop", services: "Services", both: "Products and services" });
const WEBSITE_WORDS = Object.freeze({ follow: "website followed", pick: "picked another website", later: "website left for later" });

/** The shop's type from its own record, or its sign-up answer when it can't be read. */
export function shopTypeOf(start, row) {
  const answer = sellsOf(start, row);
  if (!sellsServices(answer)) return "products";
  return start?.sellsProducts === true ? "both" : "services";
}

/** The change an owner made, in the shape the room shows, or null for none (or a record that isn't one). */
export function typeChangeOf(start) {
  const tc = start?.typeChange;
  if (!tc || typeof tc.at !== "string" || !KINDS.includes(tc.from) || !KINDS.includes(tc.to)) return null;
  return {
    at: tc.at, from: tc.from, to: tc.to,
    website: WEBSITE_WORDS[tc.website] ?? null,
    undoneAt: typeof tc.undoneAt === "string" ? tc.undoneAt : null,
  };
}

/** One line for a change: "Product shop → Services · website followed · switched back 2 Dec". */
export function changeLine(change) {
  if (!change) return "";
  const back = change.undoneAt ? `switched back ${new Date(change.undoneAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : null;
  return [`${TYPE_WORDS[change.from]} → ${TYPE_WORDS[change.to]}`, change.website, back].filter(Boolean).join(" · ");
}

export function createShopTypes({ admins, registry, shopData, now = () => new Date() }) {
  /** A shop the counts leave out: not live, or a plan with no website. */
  const notHere = (row) => row.status !== "live" || !(PLANS[row.plan] ?? { shop: true }).shop;

  return {
    /** Counts per type, book sellers among the product shops, and every change of type, newest first. */
    async overview(claims) {
      adminOf(claims, admins, now().getTime());
      if (!shopData?.get) throw new ControlError(503, "The control room can't read the shops' own records yet.");
      const rows = (await registry.listShops()).filter((row) => !notHere(row));
      const shops = [];
      for (const row of rows) {
        const shop = { shopId: row.shopId, pressName: row.pressName ?? row.shopId, testShop: row.testShop === true };
        let start = null;
        let unread = false;
        try { start = await shopData.get(row.shopId, START_DOC); } catch { unread = true; }
        const type = shopTypeOf(start, row);
        const answer = sellsOf(start, row);
        shops.push({ ...shop, type, books: type !== "services" && sellsBooks(answer), change: typeChangeOf(start), ...(unread ? { unread: true } : {}) });
      }
      const counts = Object.fromEntries(KINDS.map((k) => [k, shops.filter((s) => s.type === k).length]));
      const changes = shops.filter((s) => s.change)
        .map((s) => ({ shopId: s.shopId, pressName: s.pressName, testShop: s.testShop, ...s.change, line: changeLine(s.change) }))
        .sort((a, b) => b.at.localeCompare(a.at));
      return {
        totals: { shops: shops.length, ...counts, books: shops.filter((s) => s.books).length, changed: changes.length, switchedBack: changes.filter((c) => c.undoneAt).length, unread: shops.filter((s) => s.unread).length },
        changes,
        shops: shops.sort((a, b) => KINDS.indexOf(a.type) - KINDS.indexOf(b.type) || String(a.pressName).localeCompare(String(b.pressName))),
      };
    },
  };
}

//   GET /api/control/shop-types: counts per type and every change, for Shops › Shop types
export function shopTypesRoutes(desk) {
  return { "GET /api/control/shop-types": (claims) => desk.overview(claims) };
}
