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
/** The shop's own Bookings settings (Hours & rules): `live` = the Book a time page is open, `googleCalendar` = bookings go into Google Calendar. */
export const BOOKING_SETTINGS_DOC = "bookingSettings/main";

/**
 * What the shop kept from one booking, in cents: what was paid towards the price (all of it once marked paid, else the
 * card and gift card parts), plus a missed-booking fee, less refunds and what went back on a gift card. The same rule as
 * the shop's `moneyKept` (apps/shop src/shared/bookingTimes.ts); bookingsBeta.test.js checks the two agree.
 */
export function keptMinor(b) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const asked = b.payment === "card" ? n(b.priceMinor) : b.payment === "deposit" ? n(b.depositMinor) : 0;
  const bookedPaid = b.payment === "card" ? !!b.paid : b.payment === "deposit" ? !!b.depositPaid : false;
  const gift = Math.min(n(b.giftCard?.amountMinor), asked);
  const giftTaken = bookedPaid ? gift : 0;
  const cardTaken = (bookedPaid ? Math.max(0, asked - gift) : 0) + n(b.rest?.amountMinor);
  const price = b.paid ? n(b.priceMinor) : cardTaken + giftTaken;
  const giftBack = b.giftCard?.returned ? giftTaken : 0;
  return Math.max(0, price + n(b.fee?.amountMinor) - n(b.refund?.amountMinor) - giftBack);
}

/** A shop's month of bookings for the Bookings (beta) page: visits booked (held ones left out), no-shows and money kept by currency. */
export function monthUse(bookings, currency) {
  const counted = bookings.filter((b) => b && b.status !== "held");
  const money = {};
  for (const b of counted) {
    const kept = keptMinor(b);
    if (!kept) continue;
    const cur = String(b.currency || currency || "CAD").toUpperCase();
    money[cur] = (money[cur] || 0) + kept;
  }
  return {
    bookings: counted.filter((b) => b.status === "confirmed").length,
    noShows: counted.filter((b) => b.noShow === true).length,
    cancelled: counted.filter((b) => b.status === "cancelled").length,
    money,
  };
}

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

// `texts` (optional): the platform's text-message reminders (services/texts `forShop`), for this month's texts and cost.
export function createBookingsBeta({ admins, registry, auditLog, shopData, activity = null, texts = null, now = () => new Date() }) {
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
            // Text-message reminders this month and what they cost the shop, at cost; null while texts aren't open.
            texts: texts?.available ? await texts.forShop(shopId).catch(() => null) : null,
          },
        };
      } catch (failure) {
        if (failure.status === 503) throw new ControlError(503, failure.message);
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },

    /**
     * Every live shop with a website, for Shops › Bookings (beta): whether it is on, and for those that have it, whether
     * the Book a time page is open, this month's bookings, no-shows, money kept and whether Google Calendar is on. A
     * shop whose records can't be read shows why and counts as needing a look; it never fails the page.
     */
    async overview(claims) {
      adminOf(claims, admins, now().getTime());
      if (!shopData?.find) throw new ControlError(503, "The control room can't read the shops' own records yet.");
      const today = now();
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      const rows = (await registry.listShops()).filter((row) => !notHere(row))
        .sort((a, b) => (b.bookingsBeta === true) - (a.bookingsBeta === true) || String(a.pressName ?? a.shopId).localeCompare(String(b.pressName ?? b.shopId)));
      const shops = [];
      for (const row of rows) {
        const shop = { shopId: row.shopId, pressName: row.pressName ?? row.shopId, testShop: row.testShop === true, on: row.bookingsBeta === true };
        if (!shop.on) { shops.push(shop); continue; }
        try {
          const settings = (await shopData.get(row.shopId, BOOKING_SETTINGS_DOC)) ?? {};
          const where = [["start", ">=", from.toISOString()], ["start", "<", to.toISOString()]];
          const bookings = (await shopData.find(row.shopId, "bookings", { where, limit: MAX_BOOKINGS })).map((d) => d.data);
          shops.push({ ...shop, live: settings.live === true, google: settings.googleCalendar === true, month: monthUse(bookings, row.currency) });
        } catch (failure) {
          shops.push({ ...shop, problem: `Couldn't read its bookings: ${failure.message}` });
        }
      }
      const on = shops.filter((s) => s.on);
      const money = {};
      for (const s of on) for (const [cur, cents] of Object.entries(s.month?.money ?? {})) money[cur] = (money[cur] || 0) + cents;
      const needsLook = on.filter((s) => s.problem || !s.live).map((s) => ({ shopId: s.shopId, pressName: s.pressName, why: s.problem ?? "Turned on, but its Book a time page isn't open yet." }));
      return {
        month: from.toISOString().slice(0, 7),
        totals: { on: on.length, shops: shops.length, bookings: on.reduce((sum, s) => sum + (s.month?.bookings ?? 0), 0), noShows: on.reduce((sum, s) => sum + (s.month?.noShows ?? 0), 0), money },
        needsLook,
        testShops: { total: shops.filter((s) => s.testShop).length, off: shops.filter((s) => s.testShop && !s.on).length },
        shops,
      };
    },

    /** Turns Bookings on or off for every live test shop at once (each change logged like a single one). */
    async setTestShops(claims, { on } = {}) {
      adminOf(claims, admins, now().getTime());
      if (typeof on !== "boolean") throw new ControlError(400, "Say whether Bookings should be on or off.");
      const rows = (await registry.listShops()).filter((row) => row.testShop === true && !notHere(row));
      const results = [];
      for (const row of rows) {
        try {
          results.push(await this.set(claims, { shopId: row.shopId, on }));
        } catch (failure) {
          results.push({ shopId: row.shopId, on: row.bookingsBeta === true, changed: false, problem: failure.message });
        }
      }
      return { on, shops: results, changed: results.filter((r) => r.changed).length };
    },

    /**
     * The owner's own way in (shop types plan, part 3, 26 November 2026): a product shop changing its type to Services
     * or Products and services turns Bookings on for itself, from Settings › General › What you offer › Change. Only
     * while the control room has "Services shops can sign up" on (`open`, read live), or for a test shop. Never turns
     * it off: a shop that changes back keeps its services and bookings, hidden by its menu. Safe to repeat.
     */
    async ownerOpen({ shopId, by, open = false } = {}) {
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      const words = notHere(row);
      if (words) throw new ControlError(409, "Your shop can't take bookings yet. Ask us from Help.");
      const saved = (await shopData.get(shopId, FEATURES_DOC)) ?? {};
      if (saved.bookings === true) return { shopId, on: true, changed: false };
      if (!open && row.testShop !== true) throw new ControlError(409, "Services aren't open yet. Ask us from Help and we'll let you know when they are.");
      if (!(await auditLog.ready(shopId))) throw new ControlError(409, "Your shop's records aren't ready yet. Try again in a minute.");
      const stamp = at();
      const who = typeof by === "string" && by ? by : "owner";
      await shopData.set(shopId, FEATURES_DOC, { ...saved, bookings: true, bookingsChangedAt: stamp, bookingsChangedBy: who });
      await registry.updateShop(shopId, { bookingsBeta: true });
      await log(shopId, "bookings-opened-by-owner", { by: who, to: true });
      return { shopId, on: true, changed: true };
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
//   GET  /api/control/bookings/overview: every shop's Bookings for Shops › Bookings (beta)
//   POST /api/control/bookings/test-shops { on }: turn it on or off for every test shop
export function bookingsBetaRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/bookings/overview": (claims) => desk.overview(claims),
    "POST /api/control/bookings/test-shops": (claims, request) => desk.setTestShops(claims, body(request)),
    "POST /api/control/bookings": (claims, request) => desk.forShop(claims, body(request)),
    "POST /api/control/bookings/set": (claims, request) => desk.set(claims, body(request)),
  };
}
