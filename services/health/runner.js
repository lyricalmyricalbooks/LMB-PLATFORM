// The five-minute health run (plan 4.3): check every live platform shop, keep each check's state on the shop's
// registry row, and email the platform's alert address when a check starts failing, keeps failing, or recovers.
//
//   runHealth({ registry, checks, notify, config: { alertTo }, now, print })
//
// - Shops come only from the registry (live rows; services/release-runner/rings.js `leftOut`), so the owner's own
//   original shop, which has no row, is never checked.
// - The row's `health` is { checkedAt, ok, checks: { <name>: { ok, detail?, since, failures, alertedAt?,
//   recoveryUnsent? } } }; the
//   control room reads it. Each change of state is also a registry event (`recordEvent`, kind "health").
// - Alerts: pages and checkout must fail CONFIRM_RUNS runs in a row before an alert (one slow answer is not an
//   outage); webhook and backup alert at once, since their records already span hours. A failing check is reminded
//   every REMIND_HOURS, and its recovery is announced once. An alert that couldn't be sent is tried again next run.
import { leftOut } from "../release-runner/rings.js";
import { checkShop } from "./checks.js";

export const CONFIRM_RUNS = { pages: 2, checkout: 2, webhook: 1, backup: 1 };
export const REMIND_HOURS = 6;
export const HEALTH_ALERT = "health-alert";

const message = (error) => (error instanceof Error ? error.message : String(error));

/** One check's next state, and the alert it calls for ("failing", "still-failing", "recovered" or null). */
export function nextState(name, previous, result, at) {
  if (result.ok) {
    const alert = (previous && !previous.ok && previous.alertedAt) || previous?.recoveryUnsent ? "recovered" : null;
    return { state: { ok: true, since: previous?.ok ? previous.since : at, failures: 0 }, alert };
  }
  const wasFailing = previous && !previous.ok;
  const state = { ok: false, detail: result.detail, since: wasFailing ? previous.since : at, failures: (wasFailing ? previous.failures : 0) + 1 };
  if (wasFailing && previous.alertedAt) state.alertedAt = previous.alertedAt;
  if (state.failures < (CONFIRM_RUNS[name] ?? 1)) return { state, alert: null };
  if (!state.alertedAt) return { state, alert: "failing" };
  if ((Date.parse(at) - Date.parse(state.alertedAt)) / 3_600_000 >= REMIND_HOURS) return { state, alert: "still-failing" };
  return { state, alert: null };
}

export async function runHealth({ registry, checks, notify, config = {}, now = () => new Date(), print = () => {} }) {
  if (!config.alertTo) throw new Error("the health run needs an address to send alerts to (HEALTH_ALERT_TO)");
  const rows = (await registry.listShops()).filter((row) => !leftOut(row));
  const summary = [];
  for (const row of rows) {
    const at = now().toISOString();
    const results = await checkShop(row, checks, { now });
    const before = row.health?.checks ?? {};
    const after = {};
    const alerts = [];
    for (const [name, result] of Object.entries(results)) {
      const { state, alert } = nextState(name, before[name], result, at);
      after[name] = state;
      if (alert) alerts.push({ name, alert, state });
      if (Boolean(before[name]?.ok) !== state.ok || !before[name]) {
        await registry.recordEvent(row.shopId, { id: `health-${at}-${name}`, kind: "health", check: name, ok: state.ok, ...(state.detail ? { detail: state.detail } : {}), at });
      }
    }
    for (const { name, alert, state } of alerts) {
      try {
        await notify.sendPlatform({
          kind: HEALTH_ALERT, to: config.alertTo, shopId: row.shopId,
          idempotencyKey: `health-${row.shopId}-${name}-${alert}-${state.since}-${at}`,
          data: { pressName: row.pressName ?? row.shopId, shopId: row.shopId, check: name, state: alert, detail: state.detail ?? "", since: state.since },
        });
        if (alert === "recovered") delete after[name].alertedAt;
        else after[name].alertedAt = at;
        print(`${row.shopId}: ${name} ${alert}${state.detail ? `: ${state.detail}` : ""}`);
      } catch (error) {
        // Left unmarked, so the next run sends it again.
        print(`${row.shopId}: couldn't send the ${name} alert: ${message(error)}`);
        if (alert === "recovered") after[name].recoveryUnsent = true;
      }
    }
    const ok = Object.values(after).every((state) => state.ok);
    await registry.updateShop(row.shopId, { health: { checkedAt: at, ok, checks: after } });
    summary.push({ shopId: row.shopId, ok, failing: Object.keys(after).filter((name) => !after[name].ok), alerts: alerts.map((a) => `${a.name}:${a.alert}`) });
  }
  return { checked: summary.length, shops: summary };
}
