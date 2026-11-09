// Keeps the bot check inside its free amount (code plan 15.18). reCAPTCHA Enterprise is free for the first 10,000
// assessments a month across the whole organization, then about $8 and then about $1 per thousand. Once a day this adds up
// every live shop's assessments so far this calendar month (Cloud Monitoring, `google.monitoring.assessments`), keeps the
// total on the platform's records (`platformState/botCheck`) for the control room, and emails the platform's alert address
// once a month when the total passes 8,000. Setup lengthens each shop's token lifetime (setup/botCheck.js) to slow the count.
//
//   runBotCheckWatch({ registry, google, platformState, notify, config: { alertTo }, now, print }) -> { month, total, level, byShop }
export const FREE_AMOUNT = 10_000;
export const ALERT_AT = 8_000;
export const STATE_KEY = "botCheck";

const monthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export async function runBotCheckWatch({ registry, google, platformState, notify, config = {}, now = () => new Date(), print = () => {} }) {
  const at = now();
  const from = monthStart(at).toISOString();
  const month = from.slice(0, 7);
  const byShop = {};
  let total = 0;
  const failed = [];
  for (const row of await registry.listShops()) {
    if (row.status !== "live" || row.closing?.stage === "deleted") continue;
    try {
      const count = await google.monitoring.assessments(row.projectId ?? row.shopId, { from, to: at.toISOString() });
      byShop[row.shopId] = count;
      total += count;
    } catch (error) {
      failed.push(row.shopId);
      print(`bot check count for ${row.shopId} failed: ${error?.message ?? error}`);
    }
  }
  const level = total >= FREE_AMOUNT ? "over" : total >= ALERT_AT ? "alert" : "ok";
  const before = await platformState.get(STATE_KEY);
  await platformState.set(STATE_KEY, { month, total, level, byShop, failed, at: at.toISOString(), alertedMonth: before?.alertedMonth ?? null });
  if (level !== "ok" && before?.alertedMonth !== month && config.alertTo) {
    try {
      await notify.sendPlatform({
        kind: "health-alert", to: config.alertTo, shopId: "platform", idempotencyKey: `bot-check-${month}`,
        data: {
          pressName: "Colophon", shopId: "platform", check: "bot check", state: "failing", since: at.toISOString(),
          detail: `${total} bot check assessments so far this month across all shops; the free amount is ${FREE_AMOUNT}. Lengthen the token lifetime or check for a shop sending far more than its share.`,
        },
      });
      await platformState.set(STATE_KEY, { month, total, level, byShop, failed, at: at.toISOString(), alertedMonth: month });
    } catch (error) {
      // The count is saved either way; the alert is tried again on the next run.
      print(`couldn't send the bot check alert: ${error?.message ?? error}`);
    }
  }
  return { month, total, level, byShop, failed };
}
