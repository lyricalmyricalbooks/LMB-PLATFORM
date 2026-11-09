// The Chit Chats morning note (control room, follow-up to the Chit Chats page): once a day, an email to the platform
// owner (PLATFORM_ADMIN_EMAIL, else the alert address HEALTH_ALERT_TO; server/jobs.js) naming the paid orders that
// passed three days without a tracking number in the last day, and the orders Chit Chats ran into a problem with in the
// last day. Each order is named once, on the day it goes wrong, so a stuck parcel never nags every morning; the
// control room's Chit Chats table keeps showing it until it is sorted.
//
// Reads the same shipments as control-room/chitChats.js. Nothing new, no email. Safe to run twice: the email's key is
// the day, so a retry the same day never sends a second one. Read only.
//
// Clients passed in:
//   stores     connections.list(); shipments.listOpen(shopId), shipments.listProblems(shopId)
//   registry   getShop(shopId) for the press's name
//   email      sendPlatform(message)
import { eachInTurn } from "./controlRoom.js";
import { WAITING_DAYS } from "./chitChats.js";

export const CHITCHATS_NOTE = "chitchats-late";
const DAY = 86_400_000;
const SHOWN = 10;

const orderOf = (s) => String(s.orderNumber ?? s.orderId ?? "").slice(0, 40) || "an order";

export async function chitChatsNote({ stores, registry, email, to, now = () => new Date() }) {
  const at = now();
  const lateBefore = at.getTime() - WAITING_DAYS * DAY;
  const crossedToday = (iso) => { const t = Date.parse(iso); return t <= lateBefore && t > lateBefore - DAY; };
  const today = (iso) => { const t = Date.parse(iso); return t <= at.getTime() && t > at.getTime() - DAY; };
  const shops = [];
  let stillLate = 0;
  await eachInTurn(await stores.connections.list(), 5, async (row) => {
    const [open, problems, shop] = await Promise.all([
      stores.shipments.listOpen(row.shopId),
      stores.shipments.listProblems ? stores.shipments.listProblems(row.shopId) : [],
      registry.getShop(row.shopId).catch(() => null),
    ]);
    const late = open.filter((s) => typeof s.createdAt === "string" && crossedToday(s.createdAt));
    stillLate += open.filter((s) => typeof s.createdAt === "string" && Date.parse(s.createdAt) <= lateBefore - DAY).length;
    const fresh = problems.filter((s) => today(s.updatedAt ?? s.createdAt));
    if (!late.length && !fresh.length) return;
    shops.push({
      shopId: row.shopId, pressName: shop?.pressName ?? row.shopId,
      late: late.map(orderOf).sort().slice(0, SHOWN), lateCount: late.length,
      problems: fresh.slice(0, SHOWN).map((s) => ({ order: orderOf(s), words: String(s.problem ?? "").slice(0, 200) || null })), problemCount: fresh.length,
    });
  });
  if (!shops.length) return { sent: false, shops: 0, why: "no order went late or ran into a problem in the last day" };
  // A run with nobody to tell fails, so the jobs page and the late-job alert show it.
  if (!to) throw new Error("neither PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO is set, so the Chit Chats note has nobody to go to");
  shops.sort((a, b) => b.problemCount - a.problemCount || a.pressName.localeCompare(b.pressName));
  await email.sendPlatform({ kind: CHITCHATS_NOTE, to, idempotencyKey: `${CHITCHATS_NOTE}-${at.toISOString().slice(0, 10)}`, data: { shops, stillLate, days: WAITING_DAYS } });
  return { sent: true, shops: shops.length };
}
