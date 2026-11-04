// Why presses leave, and who might still stay (code plan 19.8). Pure reading of the registry rows: each shop's
// `billing.leaving` (the press's optional answer when it cancelled, services/billing/leaving.js) and where its plan
// stands. The test shop never counts.
//
// - leavingSummary: the answers by month and by reason, newest first; counts for this month and the last six months
//   (this one included); the latest words. An answer from a press that kept its plan afterwards (`keptAt`) is counted
//   apart, as "stayed", not as a leaving reason.
// - saveList: shops the owner could still reach out to: a plan set to end (cancelled, open until the end of the month
//   or trial) or paused for a missing card (closes PAUSED_DAYS after the pause began), soonest first, with the reason if
//   one was given.
import { LEAVING_REASONS } from "../services/billing/leaving.js";
import { PAUSED_DAYS } from "../services/billing/closing.js";
import { dayKey } from "./incomeHistory.js";

const DAY = 86_400_000;
const REASONS = Object.keys(LEAVING_REASONS);
const zero = () => Object.fromEntries(REASONS.map((reason) => [reason, 0]));
const monthOf = (at) => dayKey(new Date(at)).slice(0, 7);

function monthsBack(month, back) {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Every answer on the rows, newest first. */
function answers(rows) {
  return rows
    .filter((row) => row.testShop !== true && row.billing?.leaving?.at)
    .map((row) => {
      const { reason, words, at, keptAt } = row.billing.leaving;
      return { shopId: row.shopId, pressName: row.pressName ?? row.shopId, reason, label: LEAVING_REASONS[reason] ?? LEAVING_REASONS.other, words: words ?? "", at, stayed: Boolean(keptAt) };
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function leavingSummary(rows, now = new Date()) {
  const all = answers(rows);
  const thisMonth = dayKey(now).slice(0, 7);
  const sixMonths = new Set(Array.from({ length: 6 }, (_, i) => monthsBack(thisMonth, i)));
  const months = new Map();
  const counts = { thisMonth: zero(), lastSixMonths: zero(), stayedThisMonth: 0, stayedLastSixMonths: 0 };
  for (const answer of all) {
    const month = monthOf(answer.at);
    if (!months.has(month)) months.set(month, { month, total: 0, stayed: 0, reasons: zero() });
    const entry = months.get(month);
    if (answer.stayed) entry.stayed += 1;
    else {
      entry.total += 1;
      entry.reasons[answer.reason in entry.reasons ? answer.reason : "other"] += 1;
    }
    const counted = answer.reason in LEAVING_REASONS ? answer.reason : "other";
    if (month === thisMonth) {
      if (answer.stayed) counts.stayedThisMonth += 1;
      else counts.thisMonth[counted] += 1;
    }
    if (sixMonths.has(month)) {
      if (answer.stayed) counts.stayedLastSixMonths += 1;
      else counts.lastSixMonths[counted] += 1;
    }
  }
  return {
    reasons: REASONS.map((id) => ({ id, label: LEAVING_REASONS[id] })),
    months: [...months.values()],
    ...counts,
    latest: all.filter((a) => a.words).slice(0, 10),
  };
}

/** Shops whose plan is set to end, or paused for a missing card: who to reach out to, soonest first. */
export function saveList(rows, now = new Date()) {
  const list = [];
  for (const row of rows) {
    const billing = row.billing ?? {};
    if (row.testShop === true || row.closure) continue;
    let why = null;
    let endsAt = null;
    if (billing.cancelAtPeriodEnd && billing.access !== "closed") {
      why = "cancelled";
      // billing.js mirror writes `endsAt` (a press paying as they sell leaves on its own date); older rows have none.
      endsAt = billing.endsAt ?? (billing.status === "trialing" ? billing.trialEnd : billing.currentPeriodEnd);
    } else if (billing.access === "paused" && !billing.hasCard) {
      why = "no-card";
      const pausedAt = row.closing?.stage === "paused" ? row.closing.pausedAt : billing.troubleSince ?? billing.updatedAt;
      endsAt = pausedAt ? new Date(Date.parse(pausedAt) + PAUSED_DAYS * DAY).toISOString() : null;
    }
    if (!why) continue;
    const leaving = billing.leaving && !billing.leaving.keptAt ? billing.leaving : null;
    list.push({
      shopId: row.shopId, pressName: row.pressName ?? row.shopId, ownerEmail: row.ownerEmail ?? null, plan: billing.plan ?? row.plan ?? null,
      why, endsAt: endsAt ?? null,
      daysLeft: endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / DAY)) : null,
      reason: leaving?.reason ?? null, label: leaving ? LEAVING_REASONS[leaving.reason] ?? LEAVING_REASONS.other : null, words: leaving?.words ?? "",
    });
  }
  return list.sort((a, b) => (a.endsAt ?? "9999") < (b.endsAt ?? "9999") ? -1 : (a.endsAt ?? "9999") > (b.endsAt ?? "9999") ? 1 : a.pressName.localeCompare(b.pressName));
}
