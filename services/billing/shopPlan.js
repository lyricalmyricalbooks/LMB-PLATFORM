// The shop's own copy of its plan (code plan 6.6, 6.7). On every billing change billing.js hands the saved row to
// `shopPlanCopies(...).write`, which writes two documents into the shop's database:
//
//   platform/plan     admin-only: state, trial end, next payment, has card, payment way, the closing dates, and the
//                     link to the platform's Plan & billing page. The shop admin reads it for the trial banner, the
//                     payment-problem banner and Settings › Plan (apps/shop/src/app/admin/platformPlan.ts).
//   platform/status   public: only `access` ("open", "paused" or "closed"). The storefront reads it to show the fixed
//                     "taking a short break" page and the shop's server (priceOrder, which every checkout goes through)
//                     reads it to refuse new orders. It carries nothing about money.
//
// The shop's rules let no browser write either one (apps/shop/firestore.rules `match /platform/{docId}`); only the
// platform writes them, with its own access. A shop on the stockroom gets the same `platform/plan` in the stockroom's
// own database, which opens the stockroom read-only while the plan is paused or closed.
//
// The closing sweep (closing.js) keeps its stage on the registry row (`closing`); a closed or deleted stage wins over
// Stripe's status, so a shop the sweep closed stays closed even though Stripe still calls its plan "paused".
import { PLAN_APPS } from "./plans.js";
import { currentPaymentWay } from "./paymentWayState.js";

export const PLAN_DOC = "platform/plan";
export const STATUS_DOC = "platform/status";

const ENDED = new Set(["canceled", "incomplete_expired"]);

/** Open, paused or closed: the closing sweep's stage first, then what Stripe's status means (billing.js ACCESS). */
export function shopAccess(row, closing = null) {
  if (closing?.stage === "closed" || closing?.stage === "deleted") return "closed";
  return ["open", "paused", "closed"].includes(row?.access) ? row.access : "paused";
}

/** The shop's one word for where its plan is: trial, active, payment-problem, paused or closed. */
export function shopState(row, closing = null) {
  const access = shopAccess(row, closing);
  if (access !== "open") return access;
  if (row.status === "past_due") return "payment-problem";
  if (row.status === "trialing") return "trial";
  return "active";
}

/** When the next charge is due, or null when none is coming (no card in a trial, cancelling, paused or ended). */
export function nextPaymentAt(row, closing = null) {
  if (shopAccess(row, closing) !== "open" || ENDED.has(row.status) || row.cancelAtPeriodEnd) return null;
  if (row.status === "trialing") return row.hasCard ? row.trialEnd ?? null : null;
  return row.currentPeriodEnd ?? null;
}

/** The admin-only document. `link` is the platform's Plan & billing page for this shop. */
export function planDocument(row, { link, at, closing = null }) {
  const access = shopAccess(row, closing);
  // Paying as it sells (paymentWay.js, plan 6.19): open with no subscription, nothing to pay ahead and no trial.
  const paymentWay = currentPaymentWay(row, Date.parse(at));
  const asItSells = paymentWay === "payAsYouSell" && access === "open";
  const endsAt = !asItSells && row.cancelAtPeriodEnd && !ENDED.has(row.status) ? (row.status === "trialing" ? row.trialEnd : row.currentPeriodEnd) ?? null : null;
  return {
    plan: row.plan ?? null,
    state: asItSells ? "active" : shopState(row, closing),
    access,
    trialEnd: !asItSells && row.status === "trialing" ? row.trialEnd ?? null : null,
    nextPaymentAt: asItSells ? null : nextPaymentAt(row, closing),
    hasCard: Boolean(row.hasCard),
    cancelAtPeriodEnd: !asItSells && Boolean(row.cancelAtPeriodEnd),
    endsAt,
    paymentWay,
    link,
    // Only what the admin shows: when it closed, until when everything can be downloaded, and the day it is deleted.
    closing: closing && closing.stage !== "paused"
      ? { stage: closing.stage, closedAt: closing.closedAt ?? null, downloadUntil: closing.downloadUntil ?? null, deleteAfter: closing.deleteAfter ?? null }
      : null,
    updatedAt: at,
  };
}

/** The public document: whether the shop is open, and nothing else. */
export const statusDocument = (plan) => ({ access: plan.access, updatedAt: plan.updatedAt });

/**
 * Writes the shop's copies. Clients:
 *   shopData        set(shopId, path, data): the shop's default database (clients/shop.js shopDataClient)
 *   stockroomData   optional: set(shopId, path, data) and ready(shopId) -> whether the stockroom's database exists yet
 *   registry        getShop(shopId): for the closing stage and the plan's apps
 * The caller checks the shop's database exists first (billing.js uses the audit log's `ready`).
 */
export function shopPlanCopies({ shopData, stockroomData = null, registry }) {
  return {
    async write(shopId, row, { link, at }) {
      const shop = await registry.getShop(shopId);
      const doc = planDocument(row, { link, at, closing: shop?.closing ?? null });
      await shopData.set(shopId, PLAN_DOC, doc);
      await shopData.set(shopId, STATUS_DOC, statusDocument(doc));
      const apps = PLAN_APPS[row.plan ?? shop?.plan];
      if (stockroomData && apps?.stockroom && (await stockroomData.ready(shopId))) await stockroomData.set(shopId, PLAN_DOC, doc);
      return doc;
    },
  };
}
