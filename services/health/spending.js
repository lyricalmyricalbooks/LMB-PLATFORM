// Spending limits per shop (code plan 8.9). Each shop's Google project has a budget on the billing account; Google sends
// the budget's state to a Pub/Sub topic several times a day. Past its budget, a shop's costly jobs (photo copies, AI
// writing, imports) slow down; far past it, they wait until the next budget month. Checkout, payment events and order
// emails are never slowed: a shopper paying is never what we save money on.
//
// A budget notice (docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications): Pub/Sub attributes
// `billingAccountId`, `budgetId`, `schemaVersion`, and base64 JSON data with `budgetDisplayName`, `costAmount`,
// `costIntervalStart`, `budgetAmount`, `budgetAmountType`, `alertThresholdExceeded` (absent until one is crossed),
// `forecastThresholdExceeded` and `currencyCode`. The level is worked out from the cost and the amount, not from the
// thresholds, so it doesn't depend on which thresholds the budget was given.
//
// Which shop a budget is for: the registry row's `spending.budgetId`, or a budget named `shop:<shop id>`.
//
//   recordBudgetNotice(message, { registry, notify, config: { alertTo }, now }) -> { shopId, level, changed } | null
//   jobPace(level, job) -> { run, perHour, words }: what a costly job may do now
//
// The level sits on the registry row, `spending: { level, costAmount, budgetAmount, currency, intervalStart, at }`, for
// the control room and the shop; a change of level is a registry event and one email to the platform's alert address.

export const LEVELS = Object.freeze(["normal", "slow", "held"]);
/** The share of the budget spent at which each level starts. */
export const SLOW_AT = 1;
export const HELD_AT = 2;

/** The jobs that cost the most per press, and how fast each may run when the shop is past its budget. */
export const COSTLY_JOBS = Object.freeze({
  "photo-copies": Object.freeze({ perHour: 60, words: "photo copies" }),
  "ai-writing": Object.freeze({ perHour: 10, words: "AI writing" }),
  import: Object.freeze({ perHour: 2, words: "imports" }),
});

/** Never slowed or stopped, whatever the spending. */
export const NEVER_SLOWED = Object.freeze(["checkout", "payment-events", "order-emails"]);

/** The level for a cost against a budget. A missing or zero budget is "normal": no budget, no limit. */
export function spendLevel(costAmount, budgetAmount) {
  const cost = Number(costAmount);
  const budget = Number(budgetAmount);
  if (!Number.isFinite(cost) || !Number.isFinite(budget) || budget <= 0) return "normal";
  if (cost >= budget * HELD_AT) return "held";
  if (cost >= budget * SLOW_AT) return "slow";
  return "normal";
}

/**
 * What a job may do at a level. Any job that isn't a costly one (checkout first of all) always runs at full speed;
 * `perHour: null` means no limit.
 */
export function jobPace(level, job) {
  const costly = COSTLY_JOBS[job];
  if (!costly || NEVER_SLOWED.includes(job)) return { run: true, perHour: null };
  if (level === "held") return { run: false, perHour: 0, words: `Your shop has used a lot more than usual this month, so ${costly.words} wait until next month. Everything else, checkout first, works as normal.` };
  if (level === "slow") return { run: true, perHour: costly.perHour, words: `Your shop has used more than usual this month, so ${costly.words} run more slowly until next month. Checkout works as normal.` };
  return { run: true, perHour: null };
}

/** The notice's data, from a Pub/Sub push body ({ message: { attributes, data } }) or the message itself. */
export function readBudgetNotice(body) {
  const message = body?.message ?? body;
  const attributes = message?.attributes ?? {};
  let data = null;
  try {
    data = JSON.parse(Buffer.from(String(message?.data ?? ""), "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || typeof data.budgetDisplayName !== "string") return null;
  return { budgetId: typeof attributes.budgetId === "string" ? attributes.budgetId : "", ...data };
}

async function shopFor(notice, registry) {
  const named = /^shop:([a-z][a-z0-9-]{2,62})$/.exec(notice.budgetDisplayName.trim());
  for (const row of await registry.listShops()) {
    if (notice.budgetId && row.spending?.budgetId === notice.budgetId) return row;
    if (named && row.shopId === named[1]) return row;
  }
  return null;
}

export async function recordBudgetNotice(body, { registry, notify, config = {}, now = () => new Date(), print = () => {} }) {
  const notice = readBudgetNotice(body);
  if (!notice) return null;
  const row = await shopFor(notice, registry);
  if (!row) {
    print(`budget "${notice.budgetDisplayName}" is for no shop on the registry`);
    return null;
  }
  const at = now().toISOString();
  const level = spendLevel(notice.costAmount, notice.budgetAmount);
  const before = row.spending?.level ?? "normal";
  const spending = {
    ...(row.spending ?? {}),
    level,
    costAmount: Number(notice.costAmount) || 0,
    budgetAmount: Number(notice.budgetAmount) || 0,
    currency: typeof notice.currencyCode === "string" ? notice.currencyCode : "",
    intervalStart: typeof notice.costIntervalStart === "string" ? notice.costIntervalStart : "",
    at,
  };
  await registry.updateShop(row.shopId, { spending });
  const changed = level !== before;
  if (changed) {
    await registry.recordEvent(row.shopId, { id: `spending-${at}-${level}`, kind: "spending", from: before, to: level, costAmount: spending.costAmount, budgetAmount: spending.budgetAmount, at });
    if (config.alertTo) {
      try {
        await notify.sendPlatform({
          kind: "health-alert", to: config.alertTo, shopId: row.shopId,
          idempotencyKey: `spending-${row.shopId}-${level}-${spending.intervalStart}`,
          data: {
            pressName: row.pressName ?? row.shopId, shopId: row.shopId, check: "spending",
            state: level === "normal" ? "recovered" : "failing",
            detail: `${spending.costAmount} of a ${spending.budgetAmount} ${spending.currency} budget: costly jobs ${level === "held" ? "wait until next month" : level === "slow" ? "run slowly" : "back to normal"}; checkout is never slowed`,
            since: at,
          },
        });
      } catch (error) {
        // The level is saved either way; the alert is only for us.
        print(`${row.shopId}: couldn't send the spending alert: ${error?.message ?? error}`);
      }
    }
  }
  return { shopId: row.shopId, level, changed };
}
