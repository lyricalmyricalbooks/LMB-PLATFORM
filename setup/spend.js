// Spend guards for each shop (code plan 15.17). Google's alerts do not stop spending, so a shop gets two budgets on the
// platform's billing account, both filtered to its own project:
//   - an alerts-only budget named `shop:<shop id>` whose notices go to the platform's Pub/Sub topic. They reach
//     services/health/spending.js (plan 8.9), which marks the shop "watch" in the control room and keeps its cost so far
//     this month for the "cost this month" column.
//   - a spend cap on Cloud Run functions (the shop's server code), set high, that Google enforces by itself. Google allows a
//     cap only on one project and one service, with no Pub/Sub topic and thresholds 50, 80 and 100 per cent, so it is its own
//     budget, named `cap:<shop id>`.
// Both are optional until the platform has set up its side: with no `config.spendGuards` the step does nothing. The ids
// are saved on the registry row so a re-run never makes a second one. Needs the shop's project linked to billing (step 2).

export const ALERT_PREFIX = "shop:";
export const CAP_PREFIX = "cap:";
/** Cloud Run functions in Google's billing catalog (docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps). */
export const CLOUD_RUN_FUNCTIONS = "services/29E7-DA93-CA13";
const CAP_THRESHOLDS = [0.5, 0.8, 1];

/** The guards the platform has switched on: { alert: { topic, usd }, cap: { usd, service } }, either part may be absent. */
export function guardsOf(config) {
  const g = config?.spendGuards;
  const alert = /^projects\/[a-z][a-z0-9-]+\/topics\/[A-Za-z][\w.~+%-]+$/.test(g?.topic ?? "") && g.alertUsd > 0 ? { topic: g.topic, usd: g.alertUsd } : null;
  const cap = g?.capUsd > 0 ? { usd: g.capUsd, service: g.capService ?? CLOUD_RUN_FUNCTIONS } : null;
  return { alert, cap };
}

const money = (usd) => ({ currencyCode: "USD", units: String(Math.floor(usd)) });
const filterOf = (projectNumber) => ({ projects: [`projects/${projectNumber}`], calendarPeriod: "MONTH", creditTypesTreatment: "INCLUDE_ALL_CREDITS" });

export const alertBudget = ({ shopId, projectNumber, topic, usd }) => ({
  displayName: `${ALERT_PREFIX}${shopId}`.slice(0, 60),
  budgetFilter: filterOf(projectNumber),
  amount: { specifiedAmount: money(usd) },
  // No threshold rules: the platform works the level out from the cost itself (services/health/spending.js), and Google
  // wants an email option set whenever a budget has threshold rules.
  notificationsRule: { pubsubTopic: topic, schemaVersion: "1.0" },
});

export const capBudget = ({ shopId, projectNumber, usd, service }) => ({
  displayName: `${CAP_PREFIX}${shopId}`.slice(0, 60),
  budgetFilter: { ...filterOf(projectNumber), services: [service] },
  amount: { specifiedAmount: money(usd) },
  thresholdRules: CAP_THRESHOLDS.map((thresholdPercent) => ({ thresholdPercent, spendBasis: "CURRENT_SPEND" })),
  notificationsRule: { enableProjectLevelRecipients: true },
  spendCap: { inputState: "CONFIGURED" },
});

/** Setup step 18. Safe to run twice: a budget already there (by its name) is left as it is. */
export function spendGuardsStep({ number = 18, google, registry, config }) {
  const { alert, cap } = guardsOf(config);
  async function plan(shop) {
    const billing = await google.billing.get(shop.shopId);
    if (!billing.billingAccountName) throw new Error(`${shop.shopId} isn't linked to the billing account yet (step 2)`);
    const present = new Set((await google.budgets.list(billing.billingAccountName)).map((b) => b.displayName));
    const missing = [];
    if (alert && !present.has(`${ALERT_PREFIX}${shop.shopId}`.slice(0, 60))) missing.push("alert");
    if (cap && !present.has(`${CAP_PREFIX}${shop.shopId}`.slice(0, 60))) missing.push("cap");
    return { billingAccount: billing.billingAccountName, missing };
  }
  return {
    number,
    name: "Add the shop's spend alert and spend cap",
    async check({ shop }) {
      if (!alert && !cap) return true;
      return (await plan(shop)).missing.length === 0;
    },
    async act({ shop }) {
      if (!alert && !cap) return;
      const { billingAccount, missing } = await plan(shop);
      if (!missing.length) return;
      const projectNumber = await google.budgets.projectNumber(shop.shopId);
      const made = {};
      if (missing.includes("alert")) made.alert = await google.budgets.create(billingAccount, alertBudget({ shopId: shop.shopId, projectNumber, ...alert }));
      if (missing.includes("cap")) made.cap = await google.budgets.create(billingAccount, capBudget({ shopId: shop.shopId, projectNumber, ...cap }));
      // The control room matches a notice to its shop by this id as well as by the name (services/health/spending.js).
      const row = await registry.getShop(shop.shopId);
      await registry.updateShop(shop.shopId, {
        spending: { ...(row?.spending ?? {}), ...(made.alert ? { budgetId: made.alert.id } : {}), ...(made.cap ? { capBudgetId: made.cap.id } : {}) },
      });
    },
  };
}
