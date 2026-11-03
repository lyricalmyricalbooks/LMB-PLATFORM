// Paying presses drifting away (plan 24.4). Once a day, for each paying live shop, two plain signals over recent weeks:
// its orders (the last four weeks against the four before) and its team's sign-ins to the shop admin. Together they
// give a small risk score. The score is kept on the shop's registry row (`drift`), so Today lists the presses drifting
// without reading any shop, and a drifting press gets one gentle email, at most every 60 days, with a few ideas and a way
// to tell us what isn't working.
//
// Read only on each shop: its own `orders` since eight weeks ago (paid, not practice, not brought over from an old shop)
// and when each person last signed in to its own sign-in. A sign-in the platform can't read yet (hosted, until each
// shop's sign-in is reached) is left out, and the score uses the orders alone.
//
// The same daily sweep also looks at every live shop's "Your move so far" (Get started, plan 23.17): a press part-way
// through bringing its old shop over, whose last part was ticked a week ago or more, gets `moveStuck` on its row, so
// Today can say so before the old shop closes with things still on it.
//
// The owner can snooze a press (`drift.snoozedUntil`, 30 days by default, with a reason in the activity log): Today
// leaves it out and no check-in email goes until the snooze ends. "Presses at risk" lists the paying presses drifting or
// to watch, with the monthly income they bring in.
//
//   driftOf({ recent, before, lastSignInAt, sellingWeeks }, nowMs) -> { level, score, reasons }
//   moveStuck(start, nowMs) -> { done, of, left, lastDay, days } | null
//   createDriftWatch({ registry, shopData, shopAccess, memberships, email, settings, now }).sweep()
//   createDriftDesk({ admins, registry, settings, activity, now }): atRisk(claims), snooze(claims, { shopId, days, reason })
//
// Clients passed in:
//   registry     listShops(), updateShop(shopId, fields), getProfile(shopId)
//   shopData     find(shopId, "orders", { where, limit })
//   stockroomData optional: ready, get (the stockroom's own database). Fair till checkouts count as orders, so a press
//                that sells mostly at fairs isn't read as drifting.
//   shopAccess   signInSafety(shopId, emails) -> [{ email, found, lastSignInAt }] (optional; a failure means "not known")
//   memberships  listByShop(shopId) -> [{ email }] (optional)
//   email        sendPlatform({ kind, to, data, idempotencyKey, shopId })
import { PAYING, monthlyCents } from "./today.js";
import { ControlError, MIN_REASON, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { moveOf } from "./broughtOver.js";
import { histOf } from "./salesChannels.js";
import { PLANS } from "../setup/steps.js";

const DAY = 86_400_000;
const WEEKS = 4;
/** Days between two check-in emails to the same press. */
export const CHECK_IN_EVERY_DAYS = 60;
export const DRIFT_LEVELS = Object.freeze({ fine: 0, watch: 1, drifting: 3 });
const MAX_ORDERS = 2000;
/** How long a snooze lasts unless the owner picks another length, and the longest one. */
export const SNOOZE_DAYS = 30;
export const MAX_SNOOZE_DAYS = 180;
/** A move counts as stuck when nothing has been ticked for this many days. */
export const MOVE_STUCK_DAYS = 7;

/** Whether the owner snoozed this press and the snooze hasn't ended. */
export const snoozed = (row, nowMs) => Date.parse(row?.drift?.snoozedUntil ?? "") > nowMs;

/**
 * A move left part-way: the press brought its shop over in Get started, some parts are ticked and some aren't, the list
 * isn't put away, and the last tick is a week old or more. Null otherwise (and for a move with nothing ticked yet, which
 * the trial tips already nudge).
 */
export function moveStuck(start, nowMs) {
  const move = moveOf(start);
  if (!move || move.putAway || move.done >= move.of) return null;
  const ticks = move.steps.map((step) => start.done?.[step.id]).filter((d) => typeof d === "string" && d).sort();
  if (!ticks.length) return null;
  const lastDay = ticks.at(-1).slice(0, 10);
  const days = Math.floor((nowMs - Date.parse(`${lastDay}T00:00:00Z`)) / DAY);
  if (!(days >= MOVE_STUCK_DAYS)) return null;
  return { done: move.done, of: move.of, left: move.steps.filter((s) => !s.done).map((s) => s.title), lastDay, days };
}

/** The score and its reasons, in plain words. `lastSignInAt` undefined = not known; null = known, nobody signed in. */
export function driftOf({ recent, before, lastSignInAt, sellingWeeks }, nowMs) {
  let score = 0;
  const reasons = [];
  // Orders only once the shop has sold for the full eight weeks, so a new shop's empty "before" isn't read as a drop.
  if (sellingWeeks >= WEEKS * 2) {
    if (recent === 0 && before > 0) {
      score += 2;
      reasons.push(`no orders in the last ${WEEKS} weeks (${before} the ${WEEKS} before)`);
    } else if (before >= 4 && recent <= before / 2) {
      score += 1;
      reasons.push(`orders down from ${before} to ${recent} over ${WEEKS} weeks`);
    }
  }
  if (lastSignInAt !== undefined) {
    const days = lastSignInAt ? Math.floor((nowMs - Date.parse(lastSignInAt)) / DAY) : null;
    if (days === null || days >= 30) {
      score += 2;
      reasons.push(days === null ? "no one has signed in to the shop admin" : `no one signed in for ${days} days`);
    } else if (days >= 14) {
      score += 1;
      reasons.push(`no one signed in for ${days} days`);
    }
  }
  const level = score >= DRIFT_LEVELS.drifting ? "drifting" : score >= DRIFT_LEVELS.watch ? "watch" : "fine";
  return { level, score, reasons };
}

/** A shop the watch looks at: paying, live, not closed, not the test shop. */
export const watched = (row) => row?.testShop !== true && row?.status === "live" && !row.closure && PAYING.has(row.billing?.status);

export function createDriftWatch({ registry, shopData, stockroomData = null, shopAccess = null, memberships = null, email, settings = {}, now = () => new Date() }) {
  async function ordersOf(row, nowMs) {
    const shopId = row.shopId;
    const since = new Date(nowMs - WEEKS * 2 * 7 * DAY).toISOString();
    const split = nowMs - WEEKS * 7 * DAY;
    const apps = PLANS[row.plan] ?? { shop: true, stockroom: true };
    let recent = 0;
    let before = 0;
    if (apps.shop) {
      const docs = await shopData.find(shopId, "orders", { where: [["createdAt", ">=", since]], limit: MAX_ORDERS });
      for (const { data } of docs) {
        if (data?.paymentStatus !== "paid" || data.isTest || data.sandboxPayment || data.source === "import") continue;
        if (Date.parse(data.createdAt) >= split) recent += 1;
        else before += 1;
      }
    }
    // Fair till checkouts (one per sale number, a voided row left out), by the till's own day.
    const fair = { recent: 0, before: 0 };
    if (apps.stockroom && stockroomData && (await stockroomData.ready(shopId))) {
      const sinceDay = since.slice(0, 10);
      const splitDay = new Date(split).toISOString().slice(0, 10);
      const seen = new Set();
      for (const [bookId, rows] of Object.entries(await histOf(stockroomData, shopId))) {
        for (const [i, h] of rows.entries()) {
          if (!h || h.chan !== "Book Fair" || h.voided || typeof h.date !== "string" || h.date < sinceDay) continue;
          const key = h.num ? `${h.date} ${h.num}` : `${bookId} ${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (h.date >= splitDay) fair.recent += 1;
          else fair.before += 1;
        }
      }
    }
    return { recent: recent + fair.recent, before: before + fair.before, fair };
  }

  async function lastSignInOf(row) {
    if (!shopAccess?.signInSafety) return undefined;
    const emails = new Set([row.ownerEmail, ...(memberships ? (await memberships.listByShop(row.shopId)).map((m) => m.email) : [])]
      .filter(Boolean).map((e) => String(e).toLowerCase()));
    try {
      const people = await shopAccess.signInSafety(row.shopId, [...emails]);
      const times = people.map((p) => p.lastSignInAt).filter(Boolean).sort();
      return times.at(-1) ?? null;
    } catch {
      return undefined; // not reachable yet (hosted) or a passing failure: the orders decide alone
    }
  }

  async function checkIn(row, nowMs) {
    if (snoozed(row, nowMs)) return null;
    const last = Date.parse(row.drift?.checkedInAt ?? "");
    if (Number.isFinite(last) && nowMs - last < CHECK_IN_EVERY_DAYS * DAY) return null;
    if (!row.ownerEmail) return null;
    const profile = await registry.getProfile(row.shopId);
    const site = profile?.siteUrl ?? `https://${row.shopId}.web.app`;
    const at = new Date(nowMs).toISOString();
    await email.sendPlatform({
      kind: "quiet-shop", to: row.ownerEmail, shopId: row.shopId,
      // One per 60-day window, so a sweep run twice in a day sends one email.
      idempotencyKey: `quiet-shop-${row.shopId}-${Math.floor(nowMs / (CHECK_IN_EVERY_DAYS * DAY))}`,
      data: { pressName: row.pressName || row.shopId, link: `${site}/admin#overview`, helpLink: `${String(settings.platformUrl ?? "").replace(/\/$/, "")}/help/` },
    });
    return at;
  }

  // A live shop's move: written to the row only when it changed (a move that was never stuck writes nothing).
  async function checkMove(row, nowMs) {
    if (row.testShop === true || row.status !== "live" || row.closure || !shopData.get) return false;
    const stuck = moveStuck(await shopData.get(row.shopId, "firstWeek/start"), nowMs);
    // The shop's own stalled-move email (apps/shop moveReminder, once per stall): when it went, if it was for this stall.
    if (stuck) {
      const mark = await shopData.get(row.shopId, "systemStatus/moveReminder");
      if (mark?.sentAt && String(mark.forLastMoved ?? "").slice(0, 10) >= stuck.lastDay) stuck.remindedAt = mark.sentAt;
    }
    if (JSON.stringify(stuck) !== JSON.stringify(row.moveStuck ?? null)) await registry.updateShop(row.shopId, { moveStuck: stuck });
    return Boolean(stuck);
  }

  return {
    async sweep() {
      const nowMs = now().getTime();
      const tally = { fine: 0, watch: 0, drifting: 0, emailed: 0, movesStuck: 0, failed: [] };
      for (const row of await registry.listShops()) {
        try {
          if (await checkMove(row, nowMs)) tally.movesStuck += 1;
        } catch (failure) {
          tally.failed.push({ shopId: row.shopId, error: `move: ${failure.message}` });
        }
        if (!watched(row)) continue;
        try {
          const { recent, before, fair } = await ordersOf(row, nowMs);
          const lastSignInAt = await lastSignInOf(row);
          const sellingWeeks = Math.floor((nowMs - Date.parse(row.liveAt ?? row.createdAt ?? "")) / (7 * DAY)) || 0;
          const drift = driftOf({ recent, before, lastSignInAt, sellingWeeks }, nowMs);
          tally[drift.level] += 1;
          const checkedInAt = drift.level === "drifting" ? await checkIn(row, nowMs) : null;
          if (checkedInAt) tally.emailed += 1;
          await registry.updateShop(row.shopId, {
            drift: {
              ...drift, orders: { recent, before, ...(fair.recent || fair.before ? { fair } : {}) }, lastSignInAt: lastSignInAt ?? null, at: new Date(nowMs).toISOString(), checkedInAt: checkedInAt ?? row.drift?.checkedInAt ?? null,
              // The owner's snooze is kept until it ends.
              ...(snoozed(row, nowMs) ? { snoozedUntil: row.drift.snoozedUntil, snoozedBy: row.drift.snoozedBy ?? null } : {}),
            },
          });
        } catch (failure) {
          tally.failed.push({ shopId: row.shopId, error: failure.message });
        }
      }
      const summary = `${tally.drifting} drifting, ${tally.watch} to watch, ${tally.fine} fine, ${tally.emailed} emailed, ${tally.movesStuck} move${tally.movesStuck === 1 ? "" : "s"} stuck${tally.failed.length ? `, ${tally.failed.length} failed` : ""}`;
      if (tally.failed.length) throw new Error(`${summary}: ${tally.failed.map((f) => `${f.shopId} (${f.error})`).join("; ")}`);
      return { ...tally, summary };
    },
  };
}

/** The paying presses drifting or to watch, most at risk first, with the monthly income they bring in. */
export function atRiskSummary(rows, settings, nowMs) {
  const presses = rows
    .filter((row) => watched(row) && (row.drift?.level === "drifting" || row.drift?.level === "watch"))
    .map((row) => ({
      shopId: row.shopId, pressName: row.pressName ?? row.shopId, ownerEmail: row.ownerEmail ?? null,
      level: row.drift.level, score: row.drift.score ?? 0, reasons: row.drift.reasons ?? [], checkedInAt: row.drift.checkedInAt ?? null,
      monthlyCents: monthlyCents(row, settings), snoozedUntil: snoozed(row, nowMs) ? row.drift.snoozedUntil : null,
    }))
    .sort((a, b) => b.score - a.score || b.monthlyCents - a.monthlyCents);
  const of = (level) => presses.filter((p) => p.level === level);
  const sum = (list) => list.reduce((n, p) => n + p.monthlyCents, 0);
  return {
    presses,
    drifting: { count: of("drifting").length, monthlyCents: sum(of("drifting")) },
    watch: { count: of("watch").length, monthlyCents: sum(of("watch")) },
    currency: settings.currency,
  };
}

export function createDriftDesk({ admins, registry, settings = {}, activity = null, now = () => new Date() }) {
  return {
    async atRisk(claims) {
      const nowMs = now().getTime();
      adminOf(claims, admins, nowMs);
      return atRiskSummary(await registry.listShops(), settings, nowMs);
    },

    /** Snooze a press for `days` (default 30), or wake it again with `days: 0`. The reason goes in the activity log. */
    async snooze(claims, { shopId, days = SNOOZE_DAYS, reason } = {}) {
      const nowMs = now().getTime();
      const by = adminOf(claims, admins, nowMs);
      const why = typeof reason === "string" ? reason.trim() : "";
      if (why.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the activity log.`);
      const length = Number(days);
      if (!Number.isInteger(length) || length < 0 || length > MAX_SNOOZE_DAYS) throw new ControlError(400, `Snooze for 0 to ${MAX_SNOOZE_DAYS} whole days.`);
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (!row.drift) throw new ControlError(409, "The drift watch hasn't looked at this shop yet, so there's nothing to snooze.");
      const at = new Date(nowMs).toISOString();
      const snoozedUntil = length ? new Date(nowMs + length * DAY).toISOString() : null;
      const { snoozedUntil: _until, snoozedBy: _by, ...rest } = row.drift;
      await registry.updateShop(shopId, { drift: { ...rest, ...(snoozedUntil ? { snoozedUntil, snoozedBy: by } : {}) } });
      if (activity) await activity.record(activityEntry({ at, by, what: length ? "drift-snoozed" : "drift-woken", shopId, detail: { days: length, until: snoozedUntil, reason: why.slice(0, 500) } }));
      return { shopId, snoozedUntil };
    },
  };
}

//   GET  /api/control/at-risk      the paying presses drifting or to watch, with their monthly income
//   POST /api/control/drift-snooze { shopId, days, reason }: leave a press off Today (and its check-in email) for a while
export function driftRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/at-risk": (claims) => desk.atRisk(claims),
    "POST /api/control/drift-snooze": (claims, request) => desk.snooze(claims, body(request)),
  };
}
