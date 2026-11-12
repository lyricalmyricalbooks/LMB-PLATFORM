// The tax threshold watch (code plan 15.20). A business selling into Canada must register for GST/HST, and for Quebec's
// and British Columbia's provincial taxes, once its sales pass a line over the last 12 months. Crossing one means
// registering within weeks, so the control room totals Colophon's own plan sales and turns amber at 70% of each line.
// The lines are the ones Stripe lists for Canada (research 2026-10-29 round 2, G22): $30,000 across Canada for GST/HST,
// $30,000 of sales to Quebec for QST and $10,000 of sales to British Columbia for PST.
//
// US presses (12 November 2026) are billed in US dollars: their sales are added up by state, in US dollars, against a
// US$100,000 watch line, the lowest line most states use. A few states' lines are higher; Stripe Tax's own Registrations
// page shows each state's exact line. Registering in a state is done in Stripe (Tax > Registrations), and from then on
// Stripe adds that state's tax to the bills of presses there.
const DAY = 24 * 60 * 60;
export const WATCH_WINDOW_DAYS = 365;
export const AMBER_AT = 0.7;

export const TAX_LINES = Object.freeze([
  { id: "gst", label: "GST/HST, all of Canada", limit: 3_000_000, states: null },
  { id: "qc", label: "Quebec sales tax (QST), sales to Quebec", limit: 3_000_000, states: ["QC"] },
  { id: "bc", label: "British Columbia PST, sales to British Columbia", limit: 1_000_000, states: ["BC"] },
]);

/** The watch line for each US state, in US cents. */
export const US_STATE_LINE = 10_000_000;

const money = (cents, sign = "$") => `${sign}${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const levelOf = (share) => (share >= 1 ? "over" : share >= AMBER_AT ? "amber" : "ok");

/**
 * invoices: [{ created (seconds), amount (cents before tax), currency, state (the press's province code) }].
 * Only Canadian-dollar invoices inside the last 12 months count. Sales with no province count toward the Canada line only.
 */
export function taxWatch({ invoices = [], now = Date.now() } = {}) {
  const since = Math.floor(now / 1000) - WATCH_WINDOW_DAYS * DAY;
  const counted = invoices.filter((i) => i && i.created >= since && String(i.currency ?? "cad").toLowerCase() === "cad" && Number.isFinite(i.amount));
  const byProvince = {};
  for (const i of counted) {
    const code = String(i.state ?? "").trim().toUpperCase() || "unknown";
    byProvince[code] = (byProvince[code] ?? 0) + i.amount;
  }
  const lines = TAX_LINES.map((line) => {
    const total = line.states ? line.states.reduce((sum, s) => sum + (byProvince[s] ?? 0), 0) : Object.values(byProvince).reduce((a, b) => a + b, 0);
    const share = total / line.limit;
    const state = share >= 1 ? "over" : share >= AMBER_AT ? "amber" : "ok";
    return {
      id: line.id, label: line.label, total, limit: line.limit, percent: Math.floor(share * 100), state,
      words: state === "over"
        ? `${money(total)} of ${money(line.limit)}: past the line. Register now, then add the registration in Stripe.`
        : state === "amber"
          ? `${money(total)} of ${money(line.limit)}: close to the line. Get ready to register.`
          : `${money(total)} of ${money(line.limit)} over the last 12 months.`,
    };
  });
  // US sales by state, in US dollars, biggest first.
  const byState = {};
  for (const i of invoices.filter((x) => x && x.created >= since && String(x.currency ?? "").toLowerCase() === "usd" && Number.isFinite(x.amount))) {
    const code = String(i.state ?? "").trim().toUpperCase() || "unknown";
    byState[code] = (byState[code] ?? 0) + i.amount;
  }
  const states = Object.entries(byState).sort((a, b) => b[1] - a[1]).map(([state, total]) => {
    const level = levelOf(total / US_STATE_LINE);
    const words = `${money(total, "US$")} of ${money(US_STATE_LINE, "US$")}`;
    return {
      state, total, limit: US_STATE_LINE, percent: Math.floor((total / US_STATE_LINE) * 100), level,
      words: state === "unknown"
        ? `${money(total, "US$")} from US presses with no state on file yet.`
        : level === "over" ? `${words}: past the watch line. Check ${state}'s exact line in Stripe Tax, and register there if it applies.`
          : level === "amber" ? `${words}: close to the watch line. Check ${state}'s exact line in Stripe Tax.` : `${words} over the last 12 months.`,
    };
  });
  return { since: new Date(since * 1000).toISOString(), lines, byProvince, states, attention: lines.some((l) => l.state !== "ok") || states.some((s) => s.level !== "ok" && s.state !== "unknown") };
}
