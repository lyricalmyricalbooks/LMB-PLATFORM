import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOUD_RUN_FUNCTIONS, alertBudget, capBudget, guardsOf, spendGuardsStep } from "./spend.js";
import { fakeGoogle, fakeRegistry } from "./fakes.js";

const P = "lmb-test-shop";
const shop = { shopId: P };
const config = { spendGuards: { topic: "projects/lmb-platform-prod/topics/shop-budget", alertUsd: 10, capUsd: 50 } };

async function world() {
  const google = fakeGoogle();
  google.world.projects.set(P, { projectId: P });
  google.world.billing.set(P, { billingEnabled: true, billingAccountName: "billingAccounts/0-0-0" });
  const registry = fakeRegistry();
  await registry.createShop(P, { shopId: P, status: "creating" });
  return { google, registry };
}

test("the step makes the alert budget and the cap once, and saves the alert's id for the control room", async () => {
  const { google, registry } = await world();
  const step = spendGuardsStep({ google, registry, config });
  assert.equal(await step.check({ shop }), false);
  await step.act({ shop });
  assert.equal(await step.check({ shop }), true);
  const names = google.world.budgets.map((b) => b.displayName).sort();
  assert.deepEqual(names, [`cap:${P}`, `shop:${P}`]);
  const row = await registry.getShop(P);
  assert.equal(row.spending.budgetId, "budget-1");
  assert.equal(row.spending.capBudgetId, "budget-2");
  await step.act({ shop });
  assert.equal(google.world.budgets.length, 2, "a re-run adds nothing");
});

test("a shop that has only one of the two gets the missing one", async () => {
  const { google, registry } = await world();
  google.world.budgets.push({ id: "old", displayName: `shop:${P}`, body: {} });
  await spendGuardsStep({ google, registry, config }).act({ shop });
  assert.deepEqual(google.world.budgets.map((b) => b.displayName), [`shop:${P}`, `cap:${P}`]);
});

test("without the platform's settings the step does nothing", async () => {
  const { google, registry } = await world();
  const step = spendGuardsStep({ google, registry, config: {} });
  assert.equal(await step.check({ shop }), true);
  await step.act({ shop });
  assert.equal(google.world.budgets.length, 0);
  assert.deepEqual(guardsOf({ spendGuards: { topic: "nonsense", alertUsd: 10 } }), { alert: null, cap: null });
});

test("a shop not linked to billing stops for a person", async () => {
  const { google, registry } = await world();
  google.world.billing.set(P, { billingEnabled: false, billingAccountName: "" });
  await assert.rejects(spendGuardsStep({ google, registry, config }).check({ shop }), /billing account/);
});

test("the budgets follow what Google allows", () => {
  const alert = alertBudget({ shopId: P, projectNumber: "123", topic: config.spendGuards.topic, usd: 10 });
  assert.deepEqual(alert.budgetFilter.projects, ["projects/123"]);
  assert.equal(alert.thresholdRules, undefined);
  assert.equal(alert.spendCap, undefined);
  const cap = capBudget({ shopId: P, projectNumber: "123", usd: 50, service: CLOUD_RUN_FUNCTIONS });
  assert.deepEqual(cap.budgetFilter.services, [CLOUD_RUN_FUNCTIONS]);
  assert.deepEqual(cap.thresholdRules.map((r) => r.thresholdPercent), [0.5, 0.8, 1]);
  assert.equal(cap.notificationsRule.pubsubTopic, undefined, "a cap takes no topic");
  assert.equal(cap.notificationsRule.enableProjectLevelRecipients, true);
  assert.equal(cap.spendCap.inputState, "CONFIGURED");
  assert.ok(cap.displayName.length <= 60);
});
