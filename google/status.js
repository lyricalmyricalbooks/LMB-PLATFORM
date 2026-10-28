// What the control room shows for each shop's Google link (code plan 6.20): connected, closing or deleted, every step
// of the connect and teardown jobs with its state, and **Run again** for a step that failed or waits. The control room
// thread shows these; nothing here edits control-room/.
//
//   googleStatus(shopId)      -> { shopId, stage, accountEmail, connectedAt, closedAt, deletedAt, parts, steps }
//   runAgain(shopId, step)    runs one step of whichever job it belongs to, and returns the step's new outcome
import { CONNECT_STEPS } from "./connect.js";
import { CLOSE_STEPS, DELETE_STEPS, deletionDue } from "./teardown.js";

const PARTS = ["analytics", "searchConsole", "merchantCenter", "domain", "email", "drive", "youtube", "calendar", "businessProfile", "ads"];

export function createGoogleStatus({ registry, connect, teardown, now = () => Date.now() }) {
  async function googleStatus(shopId) {
    const row = await registry.getShop(shopId);
    if (!row) throw new Error(`The registry has no shop ${shopId}`);
    const g = row.google ?? {};
    const stage = g.deletedAt ? "deleted" : g.closedAt ? "closed" : g.connectedAt ? "connected" : "not connected";
    return {
      shopId, stage,
      accountEmail: g.accountEmail ?? null,
      connectedAt: g.connectedAt ?? null,
      closedAt: g.closedAt ?? null,
      deletedAt: g.deletedAt ?? null,
      parts: Object.fromEntries(PARTS.filter((p) => g[p]).map((p) => [p, g[p]])),
      steps: (g.steps ?? []).map((s) => ({ ...s, canRunAgain: s.state !== "done" })),
    };
  }

  async function runAgain(shopId, step) {
    const row = await registry.getShop(shopId);
    if (!row) throw new Error(`The registry has no shop ${shopId}`);
    let results;
    if (CONNECT_STEPS.includes(step)) {
      if (row.google?.closedAt) throw new Error("This shop's Google link is closed; the press connects again from their shop");
      results = (await connect.run(shopId, { only: [step] })).steps;
    } else if (CLOSE_STEPS.includes(step)) {
      results = await teardown.runSteps(shopId, [step]);
    } else if (DELETE_STEPS.includes(step)) {
      // Deleting never runs ahead of plan 6.8's dates and emails, whoever presses the button.
      if (!deletionDue(row, now())) throw new Error("This shop isn't due to be deleted yet");
      results = await teardown.runSteps(shopId, [step]);
    } else {
      throw new Error(`There is no Google step called ${step}`);
    }
    return results.find((r) => r.step === step) ?? { step, state: "waiting", detail: "This part isn't used by this shop." };
  }

  return { googleStatus, runAgain };
}
