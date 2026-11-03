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
//   driftOf({ recent, before, lastSignInAt, sellingWeeks }, nowMs) -> { level, score, reasons }
//   createDriftWatch({ registry, shopData, shopAccess, memberships, email, settings, now }).sweep()
//
// Clients passed in:
//   registry     listShops(), updateShop(shopId, fields), getProfile(shopId)
//   shopData     find(shopId, "orders", { where, limit })
//   shopAccess   signInSafety(shopId, emails) -> [{ email, found, lastSignInAt }] (optional; a failure means "not known")
//   memberships  listByShop(shopId) -> [{ email }] (optional)
//   email        sendPlatform({ kind, to, data, idempotencyKey, shopId })
import { PAYING } from "./today.js";

const DAY = 86_400_000;
const WEEKS = 4;
/** Days between two check-in emails to the same press. */
export const CHECK_IN_EVERY_DAYS = 60;
export const DRIFT_LEVELS = Object.freeze({ fine: 0, watch: 1, drifting: 3 });
const MAX_ORDERS = 2000;

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

export function createDriftWatch({ registry, shopData, shopAccess = null, memberships = null, email, settings = {}, now = () => new Date() }) {
  async function ordersOf(shopId, nowMs) {
    const since = new Date(nowMs - WEEKS * 2 * 7 * DAY).toISOString();
    const split = nowMs - WEEKS * 7 * DAY;
    const docs = await shopData.find(shopId, "orders", { where: [["createdAt", ">=", since]], limit: MAX_ORDERS });
    let recent = 0;
    let before = 0;
    for (const { data } of docs) {
      if (data?.paymentStatus !== "paid" || data.isTest || data.sandboxPayment || data.source === "import") continue;
      if (Date.parse(data.createdAt) >= split) recent += 1;
      else before += 1;
    }
    return { recent, before };
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

  return {
    async sweep() {
      const nowMs = now().getTime();
      const tally = { fine: 0, watch: 0, drifting: 0, emailed: 0, failed: [] };
      for (const row of await registry.listShops()) {
        if (!watched(row)) continue;
        try {
          const { recent, before } = await ordersOf(row.shopId, nowMs);
          const lastSignInAt = await lastSignInOf(row);
          const sellingWeeks = Math.floor((nowMs - Date.parse(row.liveAt ?? row.createdAt ?? "")) / (7 * DAY)) || 0;
          const drift = driftOf({ recent, before, lastSignInAt, sellingWeeks }, nowMs);
          tally[drift.level] += 1;
          const checkedInAt = drift.level === "drifting" ? await checkIn(row, nowMs) : null;
          if (checkedInAt) tally.emailed += 1;
          await registry.updateShop(row.shopId, {
            drift: { ...drift, orders: { recent, before }, lastSignInAt: lastSignInAt ?? null, at: new Date(nowMs).toISOString(), checkedInAt: checkedInAt ?? row.drift?.checkedInAt ?? null },
          });
        } catch (failure) {
          tally.failed.push({ shopId: row.shopId, error: failure.message });
        }
      }
      const summary = `${tally.drifting} drifting, ${tally.watch} to watch, ${tally.fine} fine, ${tally.emailed} emailed${tally.failed.length ? `, ${tally.failed.length} failed` : ""}`;
      if (tally.failed.length) throw new Error(`${summary}: ${tally.failed.map((f) => `${f.shopId} (${f.error})`).join("; ")}`);
      return { ...tally, summary };
    },
  };
}
