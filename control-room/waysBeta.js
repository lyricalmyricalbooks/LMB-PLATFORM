// Ways to sell (beta, 17 November 2026; tasks/todo/2026-11-17-ways-to-sell-switches.md) in the control room: turn each
// of the six ways (events, classes, digital goods, donations, memberships, rentals; shared/ways/ways.js) on or off for
// one shop, and see which shops have which. Off for every shop until turned on here.
//
// How a switch reaches the shop: the platform writes `platform/features` { ways: { events: true } } into the shop's own
// folder, beside Bookings' switch (bookingsBeta.js); the shop's admin then offers the way in Settings › General › Ways
// to sell, marked Beta, and the owner switches it on. The registry row keeps `waysBeta` (the ids that are on) so lists
// can say which shops have what without reading every shop. Each change is logged in the registry, the shop's audit
// log and the activity log. Turning a way off keeps everything the shop made with it.
//
// A way that isn't built yet (`built: false`) can't be turned on: no shop is shown a switch that does nothing.
//
// Clients passed in:
//   registry  getShop(shopId); listShops(); updateShop(shopId, fields); recordEvent(shopId, entry)
//   auditLog  ready(shopId); write(shopId, id, entry)
//   shopData  get(shopId, path); set(shopId, path, data)
//   activity  optional: the activity log (activity.js)
//   ways      the ways (shared/ways/ways.js WAYS); tests pass their own to try a built one
import { createHash } from "node:crypto";
import { ControlError, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { FEATURES_DOC } from "./bookingsBeta.js";
import { PLANS } from "../setup/steps.js";
import { WAYS, waysIn } from "../shared/ways/ways.js";

/** Where the owner's own switches are kept (Settings › General › Ways to sell). */
export const START_DOC = "firstWeek/start";

/** How a shop uses Events: its events, how many are still to come, and tickets sold (eventPlaces/{eventId}.sold). */
export function eventsUse(events, places, nowMs) {
  const live = events.filter((e) => e && e.status !== "cancelled");
  const count = (sold) => Object.values(sold ?? {}).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  return {
    events: events.length,
    coming: live.filter((e) => Date.parse(e.start) > nowMs).length,
    onSale: live.filter((e) => e.status === "live" && Date.parse(e.start) > nowMs).length,
    ticketsSold: places.reduce((sum, p) => sum + count(p?.sold), 0),
    paidMinor: places.reduce((sum, p) => sum + (Number.isFinite(p?.paidMinor) && p.paidMinor > 0 ? p.paidMinor : 0), 0),
  };
}
/** The most events read for the use line (the shop's own cap, apps/shop/src/shared/eventTickets.ts MAX_EVENTS). */
const MAX_EVENTS = 200;

export function createWaysBeta({ admins, registry, auditLog, shopData, activity = null, ways = WAYS, now = () => new Date() }) {
  const at = () => now().toISOString();
  const ids = ways.map((way) => way.id);
  const onIn = (map) => waysIn(map).filter((id) => ids.includes(id));

  async function liveShop(claims, shopId) {
    const by = adminOf(claims, admins, now().getTime());
    const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
    if (!row) throw new ControlError(404, "There's no shop with that id.");
    return { by, row };
  }

  /** Why this shop can't have ways to sell now, or null. */
  function notHere(row) {
    if (row.status !== "live") return "Not live yet.";
    if (!(PLANS[row.plan] ?? { shop: true }).shop) return "This plan has no website, so there's nowhere to sell these.";
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
    /** One shop's six ways: built or not, on or off here, and whether the owner has switched it on. */
    async forShop(claims, { shopId } = {}) {
      const { row } = await liveShop(claims, shopId);
      const words = notHere(row);
      if (words) return { shopId, ways: null, words };
      try {
        const features = (await shopData.get(shopId, FEATURES_DOC)) ?? {};
        const start = await shopData.get(shopId, START_DOC);
        const owner = onIn(start?.ways);
        const asked = Array.isArray(start?.alsoSells) ? start.alsoSells : [];
        const allowed = onIn(features.ways);
        // How the shop uses what it has. A use that can't be read is left out: the switches still show.
        const use = {};
        if (allowed.includes("events") && shopData.find) {
          try {
            const [events, places] = await Promise.all(["events", "eventPlaces"].map((name) => shopData.find(shopId, name, { limit: MAX_EVENTS })));
            use.events = eventsUse(events.map((d) => d.data), places.map((d) => d.data), now().getTime());
          } catch { /* the line is left out */ }
        }
        return {
          shopId,
          ways: ways.map((way) => ({
            id: way.id, label: way.label, built: way.built === true, on: allowed.includes(way.id), ownerOn: allowed.includes(way.id) && owner.includes(way.id), asked: asked.includes(way.id),
            changedAt: features.waysChanged?.[way.id]?.at ?? null, changedBy: features.waysChanged?.[way.id]?.by ?? null,
            use: use[way.id] ?? null,
          })),
        };
      } catch (failure) {
        throw new ControlError(502, `Couldn't read the shop's records: ${failure.message}`);
      }
    },

    /** Every live shop with a website and the ways it has, for Shops › Ways to sell (beta). Reads the registry only. */
    async overview(claims) {
      adminOf(claims, admins, now().getTime());
      const shops = (await registry.listShops()).filter((row) => !notHere(row))
        .map((row) => ({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, testShop: row.testShop === true, ways: (Array.isArray(row.waysBeta) ? row.waysBeta : []).filter((id) => ids.includes(id)), asked: ids.filter((id) => Array.isArray(row.alsoSells) && row.alsoSells.includes(id)) }))
        .sort((a, b) => b.ways.length - a.ways.length || String(a.pressName).localeCompare(String(b.pressName)));
      return {
        ways: ways.map((way) => ({ id: way.id, label: way.label, built: way.built === true, shops: shops.filter((s) => s.ways.includes(way.id)).length, asked: shops.filter((s) => s.asked.includes(way.id)).length })),
        totals: { shops: shops.length, withAny: shops.filter((s) => s.ways.length).length },
        shops,
      };
    },

    /** Turns one way on or off for one shop. Safe to repeat: the same answer writes nothing new. */
    async set(claims, { shopId, way: id, on } = {}) {
      const { by, row } = await liveShop(claims, shopId);
      const way = ways.find((w) => w.id === id);
      if (!way) throw new ControlError(400, "Pick one of the six ways to sell.");
      if (typeof on !== "boolean") throw new ControlError(400, `Say whether ${way.label} should be on or off.`);
      const words = notHere(row);
      if (words) throw new ControlError(409, words);
      if (on && way.built !== true) throw new ControlError(409, `${way.label} isn't built yet, so there's nothing to turn on.`);
      if (!(await auditLog.ready(shopId))) throw new ControlError(409, "The shop's records aren't ready yet.");
      const saved = (await shopData.get(shopId, FEATURES_DOC)) ?? {};
      const before = onIn(saved.ways);
      const listed = (Array.isArray(row.waysBeta) ? row.waysBeta : []).includes(id);
      if (before.includes(id) === on && listed === on) return { shopId, way: id, on, changed: false };
      const stamp = at();
      const next = ids.filter((w) => (w === id ? on : before.includes(w)));
      await shopData.set(shopId, FEATURES_DOC, {
        ...saved,
        ways: Object.fromEntries(next.map((w) => [w, true])),
        waysChanged: { ...(saved.waysChanged ?? {}), [id]: { at: stamp, by } },
      });
      await registry.updateShop(shopId, { waysBeta: next });
      await log(shopId, "ways-set", { by, way: id, to: on });
      return { shopId, way: id, on, changed: true };
    },
  };
}

//   POST /api/control/ways      { shopId }: the shop's six ways
//   POST /api/control/ways/set  { shopId, way, on }: turn one on or off for that shop
//   GET  /api/control/ways/overview: every shop's ways for Shops › Ways to sell (beta)
export function waysBetaRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/ways/overview": (claims) => desk.overview(claims),
    "POST /api/control/ways": (claims, request) => desk.forShop(claims, body(request)),
    "POST /api/control/ways/set": (claims, request) => desk.set(claims, body(request)),
  };
}
