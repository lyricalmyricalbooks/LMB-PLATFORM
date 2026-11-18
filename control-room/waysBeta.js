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
/**
 * How a shop uses Donations & tips: gifts paid (test gifts left out), what they came to, and the tries the card-testing
 * guard refused in the last 30 days, per reason (givingBlocked/{YYYY-MM-DD}, written by the shop's functions/giving.js).
 * Many refused tries on a shop means someone is testing stolen cards on its Support page. Also the tax receipts given
 * (G3: issued, never a test gift's or a cancelled one) and the fundraisers (running now, and what all of them raised).
 */
export function givingUse(gifts, blockedDays, nowMs, fundraisers = []) {
  const paid = gifts.filter((g) => g && g.status === "paid" && g.mode !== "test");
  const since = new Date(nowMs - 29 * 86_400_000).toISOString().slice(0, 10);
  const blocked = { tooSmall: 0, tooMany: 0, bot: 0, total: 0 };
  for (const d of blockedDays) {
    if (!d || typeof d.day !== "string" || d.day < since) continue;
    for (const k of Object.keys(blocked)) blocked[k] += Number.isFinite(d[k]) && d[k] > 0 ? d[k] : 0;
  }
  return {
    gifts: paid.length,
    givenMinor: paid.reduce((sum, g) => sum + (Number.isFinite(g.chargedMinor) && g.chargedMinor > 0 ? g.chargedMinor : 0), 0),
    currency: String(paid.find((g) => typeof g.currency === "string")?.currency || "CAD").toUpperCase(),
    blocked,
    receipts: gifts.filter((g) => g && g.mode !== "test" && g.receipt && g.receipt.status === "issued" && g.receipt.test !== true).length,
    fundraisers: {
      count: fundraisers.filter(Boolean).length,
      live: fundraisers.filter((f) => f && f.status === "live").length,
      raisedMinor: fundraisers.reduce((sum, f) => sum + (Number.isFinite(f?.raisedMinor) && f.raisedMinor > 0 ? f.raisedMinor : 0), 0),
    },
  };
}
/**
 * How a shop uses Memberships: members now (on a free trial, paying, ending at the period's end, or with a failed
 * payment; test members left out), how many have a failed payment, and what they bring in a month (a yearly plan as a
 * twelfth). Written by the shop's functions/memberships.js; no member's name or email is read into the line.
 */
export function membershipsUse(members, posts = []) {
  const real = members.filter((m) => m && m.mode !== "test");
  const live = real.filter((m) => ["trial", "active", "ending", "pastDue"].includes(m.state));
  const monthly = (plan) => {
    const price = Number.isFinite(plan?.priceMinor) && plan.priceMinor > 0 ? plan.priceMinor : 0;
    return plan?.interval === "year" ? Math.round(price / 12) : price;
  };
  // Members per plan (M5c): the plan's name as the shop saved it, biggest first, at most 10.
  const byPlan = new Map();
  for (const m of live) {
    const name = typeof m.plan?.name === "string" && m.plan.name.trim() ? m.plan.name.trim().slice(0, 80) : "A plan";
    byPlan.set(name, (byPlan.get(name) ?? 0) + 1);
  }
  return {
    members: live.length,
    trial: live.filter((m) => m.state === "trial").length,
    pastDue: live.filter((m) => m.state === "pastDue").length,
    // A gift is paid once, so it brings nothing in a month.
    monthlyMinor: live.filter((m) => m.state !== "trial" && !m.gift).reduce((sum, m) => sum + monthly(m.plan), 0),
    currency: live.find((m) => m.plan?.currency)?.plan.currency ?? "CAD",
    paused: real.filter((m) => m.state === "paused").length,
    gifts: live.filter((m) => m.gift).length,
    plans: [...byPlan].map(([name, count]) => ({ name, members: count })).sort((a, b) => b.members - a.members || a.name.localeCompare(b.name)).slice(0, 10),
    posts: posts.filter(Boolean).length,
  };
}
/**
 * How a shop uses Rentals (R3): items and units (out for repair, written off or sold), rentals still to come and out
 * now, deposit cards held on rentals not yet back, fees charged and pay links waiting. Written by the shop's
 * functions/rentals.js; no customer's name, email or card is read into the line. Test rentals are left out.
 */
export function rentalsUse(items, rentals, nowMs) {
  const real = rentals.filter((r) => r && r.mode !== "test");
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  const fees = real.flatMap((r) => (Array.isArray(r.fees) ? r.fees : []));
  return {
    items: items.filter(Boolean).length,
    units: items.reduce((sum, i) => sum + (Number.isInteger(i?.units) ? i.units : 0), 0),
    repair: items.reduce((sum, i) => sum + count(i?.repair), 0),
    gone: items.reduce((sum, i) => sum + count(i?.gone), 0),
    coming: real.filter((r) => r.status === "paid" && r.startMs > nowMs).length,
    out: real.filter((r) => r.status === "out").length,
    late: real.filter((r) => r.status === "out" && r.endMs < nowMs).length,
    held: real.filter((r) => r.status === "held").length,
    cardsKept: real.filter((r) => r.card && ["paid", "out"].includes(r.status)).length,
    fees: fees.length,
    feesMinor: fees.reduce((sum, f) => sum + (Number.isFinite(f?.amountMinor) && f.amountMinor > 0 ? f.amountMinor : 0), 0),
    payLinks: real.reduce((sum, r) => sum + (Array.isArray(r.extraPages) ? r.extraPages.filter((p) => Date.parse(p?.closesAt || "") > nowMs).length : 0), 0),
    currency: real.find((r) => r.currency)?.currency ?? "CAD",
  };
}
/** The most rental items and rentals read (the shop's own caps, rentalRules.ts MAX_ITEMS and the admin list's 500). */
const MAX_RENTAL_ITEMS = 60;
const MAX_RENTALS = 500;
/** The most members' posts read (the shop's own cap, membershipRules.ts MAX_POSTS). */
const MAX_POSTS = 100;
/** The most memberships read for the use line (the admin's own list, functions/memberships.js MAX_LISTED, reads as many). */
const MAX_MEMBERS = 500;
/** The most gifts read for the use line (the admin's own list, functions/giving.js MAX_LISTED, reads as many). */
const MAX_GIFTS = 500;
/** The most fundraisers read (the shop keeps every one it made; one runs at a time). */
const MAX_FUNDRAISERS = 200;
/** One record per day with refused tries; a year and a bit covers every shop's last 30 days. */
const MAX_BLOCKED_DAYS = 400;

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
        if (allowed.includes("giving") && shopData.find) {
          try {
            const [gifts, blocked, fundraisers] = await Promise.all([
              shopData.find(shopId, "gifts", { limit: MAX_GIFTS }),
              shopData.find(shopId, "givingBlocked", { limit: MAX_BLOCKED_DAYS }),
              shopData.find(shopId, "fundraisers", { limit: MAX_FUNDRAISERS }),
            ]);
            use.giving = givingUse(gifts.map((d) => d.data), blocked.map((d) => d.data), now().getTime(), fundraisers.map((d) => d.data));
          } catch { /* the line is left out */ }
        }
        if (allowed.includes("memberships") && shopData.find) {
          try {
            const [members, posts] = await Promise.all([
              shopData.find(shopId, "memberships", { limit: MAX_MEMBERS }),
              shopData.find(shopId, "memberPosts", { limit: MAX_POSTS }),
            ]);
            use.memberships = membershipsUse(members.map((d) => d.data), posts.map((d) => d.data));
          } catch { /* the line is left out */ }
        }
        if (allowed.includes("rentals") && shopData.find) {
          try {
            const [items, rentals] = await Promise.all([
              shopData.find(shopId, "rentalItems", { limit: MAX_RENTAL_ITEMS }),
              shopData.find(shopId, "rentals", { limit: MAX_RENTALS }),
            ]);
            use.rentals = rentalsUse(items.map((d) => d.data), rentals.map((d) => d.data), now().getTime());
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
