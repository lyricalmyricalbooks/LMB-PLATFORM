// Shops not yet selling (control room features, 11 November 2026): live shops opened more than two weeks ago that
// haven't taken a real sale yet, each with a Send tips button that emails the press a short note on getting a first
// order. Reads each shop's own `orders` (paid, not practice, not brought over from an old shop), like driftWatch.js.
// Sending is once a day per shop at most (the email key is the day), and the last send is kept on the registry row.
//
// Clients passed in:
//   registry  getShop(shopId); listShops(); updateShop(shopId, patch)
//   shopData  find(shopId, "orders", { where, limit })
//   email     sendPlatform({ kind, to, shopId, idempotencyKey, data })
//   activity  optional: record(entry)
import { ControlError, adminOf, eachInTurn } from "./controlRoom.js";
import { activityEntry } from "./activity.js";

const DAY = 86_400_000;
export const QUIET_DAYS = 14;
/** After Send tips, a shop leaves the Shops list for this many days, so the same tips aren't sent twice by mistake. */
export const TIPS_REST_DAYS = 7;
export const FIRST_SALE_TIPS = "first-sale-tips";
const LOOK = 50;

const candidate = (row, nowMs) => row.testShop !== true && row.status === "live" && !row.closure && row.plan !== "stockroom"
  && Boolean(row.createdAt) && nowMs - Date.parse(row.createdAt) > QUIET_DAYS * DAY;
export const realSale = (data) => data?.paymentStatus === "paid" && !data.isTest && !data.sandboxPayment && data.source !== "import";

/** The live shops open over two weeks with no real sale yet, longest-waiting first, plus any whose orders couldn't be read. */
export async function notSellingShops({ rows, shopData, nowMs, restDays = 0 }) {
  const shops = [];
  const unread = [];
  const resting = (r) => restDays > 0 && nowMs - Date.parse(r.firstSaleTipsAt ?? "") < restDays * DAY;
  await eachInTurn(rows.filter((r) => candidate(r, nowMs) && !resting(r)), 5, async (row) => {
    try {
      const docs = await shopData.find(row.shopId, "orders", { where: [["paymentStatus", "==", "paid"]], limit: LOOK });
      if (docs.some(({ data }) => realSale(data))) return;
      shops.push({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, ownerEmail: row.ownerEmail ?? null, days: Math.floor((nowMs - Date.parse(row.createdAt)) / DAY), tipsSentAt: row.firstSaleTipsAt ?? null });
    } catch {
      unread.push(row.shopId);
    }
  });
  shops.sort((a, b) => b.days - a.days);
  return { shops, unread };
}

export function createNotSelling({ admins, registry, shopData, email, activity = null, now = () => new Date() }) {
  return {
    async list(claims) {
      const nowMs = now().getTime();
      adminOf(claims, admins, nowMs);
      return notSellingShops({ rows: await registry.listShops(), shopData, nowMs, restDays: TIPS_REST_DAYS });
    },

    async sendTips(claims, { shopId } = {}) {
      const at = now();
      const admin = adminOf(claims, admins, at.getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (!row.ownerEmail) throw new ControlError(409, "This shop has no owner email.");
      const sentAt = at.toISOString();
      await email.sendPlatform({ kind: FIRST_SALE_TIPS, to: row.ownerEmail, shopId, idempotencyKey: `${shopId}/${FIRST_SALE_TIPS}/${sentAt.slice(0, 10)}`, data: { pressName: row.pressName ?? shopId } });
      await registry.updateShop(shopId, { firstSaleTipsAt: sentAt });
      if (activity) await activity.record(activityEntry({ at: sentAt, by: admin, what: FIRST_SALE_TIPS, shopId }));
      return { sent: true, to: row.ownerEmail, tipsSentAt: sentAt };
    },
  };
}

//   POST /api/control/not-selling       {}: live shops open over two weeks with no real sale
//   POST /api/control/first-sale-tips   { shopId }: email the press the first-sale tips
export function notSellingRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/not-selling": (claims) => desk.list(claims),
    "POST /api/control/first-sale-tips": (claims, request) => desk.sendTips(claims, body(request)),
  };
}
