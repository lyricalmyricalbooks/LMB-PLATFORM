// How far new shops get from sign-up to their first order (control room; sign-up to open shop plan, move 5). Each
// shop's own `firstWeek/start` holds the run's steps (apps/shop admin/startRun.ts): the look (`welcome`) is the first
// thing on Home, `bring` is the first product or service, `payments` (or the final check, for a shop whose cards don't
// go through the platform) is getting paid, and `done.firstSale` is written by the shop's server with the first real
// sale's email (functions/firstOrder.js). Open is the published website without its "opening soon" wall
// (`settings/website` › `design.showUnderConstruction` false). Read only; test shops and stockroom-only plans are left out.
//
// Clients passed in:
//   registry  listShops()
//   shopData  get(shopId, path)
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { PLANS } from "../setup/steps.js";

/** The stages in order, with their words. */
export const FUNNEL_STAGES = Object.freeze([
  { id: "signedUp", words: "Signed up" },
  { id: "reachedHome", words: "Reached Home" },
  { id: "firstProduct", words: "Added a first product or service" },
  { id: "paid", words: "Set up getting paid" },
  { id: "open", words: "Opened the shop" },
  { id: "firstOrder", words: "Got a first order" },
]);

/** How many days back the funnel looks by default. */
export const FUNNEL_DAYS = 90;

/** The furthest stage one shop reached (a later stage counts every earlier one, so an older shop's gaps don't drop it). */
export function funnelStage(start, settings) {
  const reached = {
    signedUp: true,
    reachedHome: Boolean(start?.welcome || start?.bring || start?.details),
    firstProduct: Boolean(start?.bring),
    paid: Boolean(start?.payments || start?.finalCheck),
    open: settings?.design?.showUnderConstruction === false,
    firstOrder: Boolean(start?.done?.firstSale),
  };
  let furthest = 0;
  FUNNEL_STAGES.forEach((stage, i) => { if (reached[stage.id]) furthest = i; });
  return FUNNEL_STAGES[furthest].id;
}

/** Each stage with how many shops reached it and its share of those who signed up (whole percent). */
export function funnelTally(stages) {
  const at = (id) => FUNNEL_STAGES.findIndex((s) => s.id === id);
  const total = stages.length;
  return FUNNEL_STAGES.map((stage, i) => {
    const count = stages.filter((id) => at(id) >= i).length;
    return { id: stage.id, words: stage.words, count, percent: total ? Math.round((count / total) * 100) : 0 };
  });
}

const hasWebsite = (row) => (PLANS[row.plan] ?? { shop: true }).shop;
const newShops = (rows, since) => rows.filter((row) => !row.closure && row.testShop !== true && hasWebsite(row)
  && (!row.createdAt || Date.parse(row.createdAt) >= since));

export function createSignupFunnel({ admins, registry, shopData, now = () => new Date() }) {
  return {
    /** The funnel over shops made in the last `days` (FUNNEL_DAYS by default); a shop that can't be read is named. */
    async acrossShops(claims, { days } = {}) {
      adminOf(claims, admins, now().getTime());
      if (!shopData?.get) throw new ControlError(503, "The control room can't read the shops' own records yet.");
      const span = Number.isInteger(days) && days > 0 && days <= 365 ? days : FUNNEL_DAYS;
      const since = now().getTime() - span * 86_400_000;
      const stages = [];
      const unread = [];
      await eachInTurn(newShops(await registry.listShops(), since), 4, async (row) => {
        // A shop still being made has no records yet: it signed up, nothing more.
        if (row.status !== "live") { stages.push("signedUp"); return; }
        try {
          const [start, settings] = await Promise.all([shopData.get(row.shopId, "firstWeek/start"), shopData.get(row.shopId, "settings/website")]);
          stages.push(funnelStage(start, settings));
        } catch (failure) {
          unread.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, error: failure.message });
        }
      });
      return { days: span, shops: stages.length, stages: funnelTally(stages), unread };
    },
  };
}

//   GET /api/control/signup-funnel  how far shops made in the last 90 days got, stage by stage (read only)
export function signupFunnelRoutes(desk) {
  return { "GET /api/control/signup-funnel": (claims) => desk.acrossShops(claims) };
}
