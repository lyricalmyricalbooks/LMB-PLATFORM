// Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md) in a live shop's record: turn it on or off
// for one shop, and see how the shop uses it. Off for every shop until turned on here.
//
// How the switch reaches the shop: the platform writes `platform/features` { bookings } into the shop's own folder,
// beside `platform/plan` and `platform/messages`; the shop's functions (apps/shop/functions/bookings.js) check it before
// every booking action, and its admin shows Orders › Bookings only while it is on. The registry row keeps
// `bookingsBeta` so lists can say which shops have it without reading every shop. Each change is logged in the
// registry, the shop's audit log and the activity log. Turning it off keeps every service and booking: turning it on
// again brings them back as they were.
//
// Clients passed in:
//   registry  getShop(shopId); updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog  ready(shopId); write(shopId, id, entry)
//   shopData  get(shopId, path); set(shopId, path, data); find(shopId, collection, { where, limit }) -> [{ id, data }]
//   activity  optional: the activity log (activity.js)
import { createHash } from "node:crypto";
import { ControlError, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { PLANS } from "../setup/steps.js";

/** Where the shop's feature switches live in its own folder (admin-only, like platform/plan). */
export const FEATURES_DOC = "platform/features";
const DAY = 86_400_000;
/** The use shown: bookings in the last and next 30 days. */
export const USE_DAYS = 30;
const MAX_BOOKINGS = 2000;
const MAX_SERVICES = 100;

/** How the shop uses Bookings: services, and bookings either side of now (held ones are still being paid for). */
export function bookingsUse(services, bookings, nowMs) {
  const counted = bookings.filter((b) => b && b.status !== "held");
  const startOf = (b) => Date.parse(b.start);
  const past = counted.filter((b) => startOf(b) < nowMs);
  const coming = counted.filter((b) => startOf(b) >= nowMs);
  const live = (list) => list.filter((b) => b.status === "confirmed");
  return {
    services: services.filter((s) => s && s.active !== false).length,
    hiddenServices: services.filter((s) => s && s.active === false).length,
    lastDays: live(past).length,
    nextDays: live(coming).length,
    cancelled: counted.filter((b) => b.status === "cancelled").length,
    paid: live(counted).filter((b) => b.paid === true).length,
    fromWebsite: live(counted).filter((b) => b.source !== "admin").length,
  };
}

export function createBookingsBeta({ admins, registry, auditLog, shopData, activity = null, now = () => new Date() }) {
  const at = () => now().toISOString();

  async function liveShop(claims, shopId) {
    const by = adminOf(claims, admins, now().getTime());
    const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
    if (!row) throw new ControlError(404, "There's no shop with that id.");
    return { by, row };
  }

  /** Why this shop can't have Bookings now, or null. */
  function notHere(row) {
    if (row.status !== "live") return "Not live yet.";
    if (!(PLANS[row.plan] ?? { shop: true }).shop) return "This plan has no website, so there's no Book a time page.";
    return null;
  }

  async function log(shopId, what, detail) {
    const stamp = at();
    const entry = { id: `control-room-${stamp}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`, source: "control-room", at: stamp, what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    if (activity) await activity.record(activityEntry({ at: stamp, by: detail.by, what, shopId, detail }));
  }

  return {
    async forShop(claims, { shopId } = {}) {
      const { row } = await liveShop(claims, shopId);
      const words = notHere(row);
      if (words) return { shopId, bookings: null, words };
      if (!shopData?.find) throw new ControlError(503, "The control room can't read the shop's own records yet.");
      try {
        const nowMs = now().getTime();
        const features = await shopData.get(shopId, FEATURES_DOC);
        const services = (await shopData.find(shopId, "bookingServices", { limit: MAX_SERVICES })).map((d) => d.data);
        const where = [["start", ">=", new Date(nowMs - USE_DAYS * DAY).toISOString()], ["start", "<", new Date(nowMs + USE_DAYS * DAY).toISOString()]];
        const bookings = (await shopData.find(shopId, "bookings", { where, limit: MAX_BOOKINGS })).map((d) => d.data);
        return {
          shopId,
          bookings: {
            on: features?.bookings === true,
            changedAt: features?.bookingsChangedAt ?? null,
            changedBy: features?.bookingsChangedBy ?? null,
            use: bookingsUse(services, bookings, nowMs),
          },
        };
      } catch (failure) {
        if (failure.status === 503) throw new ControlError(503, failure.message);
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },

    /** Turns Bookings on or off for one shop. Safe to repeat: the same answer writes nothing new. */
    async set(claims, { shopId, on } = {}) {
      const { by, row } = await liveShop(claims, shopId);
      if (typeof on !== "boolean") throw new ControlError(400, "Say whether Bookings should be on or off.");
      const words = notHere(row);
      if (words) throw new ControlError(409, words);
      if (!(await auditLog.ready(shopId))) throw new ControlError(409, "The shop's records aren't ready yet.");
      const saved = (await shopData.get(shopId, FEATURES_DOC)) ?? {};
      if ((saved.bookings === true) === on && row.bookingsBeta === on) return { shopId, on, changed: false };
      const stamp = at();
      await shopData.set(shopId, FEATURES_DOC, { ...saved, bookings: on, bookingsChangedAt: stamp, bookingsChangedBy: by });
      await registry.updateShop(shopId, { bookingsBeta: on });
      await log(shopId, "bookings-set", { by, to: on });
      return { shopId, on, changed: true };
    },
  };
}

//   POST /api/control/bookings      { shopId }: whether Bookings is on and how the shop uses it
//   POST /api/control/bookings/set  { shopId, on }: turn it on or off for that shop
export function bookingsBetaRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/bookings": (claims, request) => desk.forShop(claims, body(request)),
    "POST /api/control/bookings/set": (claims, request) => desk.set(claims, body(request)),
  };
}
