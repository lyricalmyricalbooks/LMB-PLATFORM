// What "healthy" means for one platform shop (plan 4.3). Each check returns { ok, detail }; a check that can't be
// made at all is a failure too ("couldn't check: …"), so a broken check never looks like a working shop.
//
//   pages     the shop's home page, /admin and /shop-profile.js, and the stockroom page, answer 200 (siteCheck)
//   checkout  the shop's checkout function answers a browser's preflight from the shop's own address (204, with that
//             address allowed): the function is deployed, running and accepts the shop's pages
//   webhook   the shop's payment events record (adminSecrets/stripeWebhookStatus): no failed delivery newer than the
//             last good one in the past day
//   backup    the shop's nightly backup record (systemStatus/backup), or the platform's own backup of it, and the
//             platform's backup of the stockroom (the row's platformBackup, nightly.js): each under BACKUP_MAX_HOURS old
//
// Only reads. The shop's data is read with the platform's token (clients/firestore.js).
import { siteOf } from "../../clients/deploy.js";
import { appsOf } from "../../setup/later-steps.js";
import { REGION } from "../../setup/steps.js";

export const BACKUP_MAX_HOURS = 26;
export const WEBHOOK_WINDOW_HOURS = 24;
const TIMEOUT_MS = 10_000;

const message = (error) => (error instanceof Error ? error.message : String(error));
const hoursBetween = (later, earlier) => (Date.parse(later) - Date.parse(earlier)) / 3_600_000;

/** Which checks apply to a shop: the stockroom alone has no checkout or payments. */
export function checksFor(row) {
  const apps = appsOf(row);
  const names = ["pages"];
  if (apps.includes("shop")) names.push("checkout");
  if (apps.includes("shop") && row.payments?.accountId) names.push("webhook");
  names.push("backup");
  return names;
}

export const shopUrl = (row) => `https://${siteOf(row.shopId, "shop")}.web.app`;

export function healthChecks({ siteCheck, fetch, shopDb }) {
  return {
    async pages(row) {
      const apps = appsOf(row);
      const urls = [];
      if (apps.includes("shop")) urls.push(shopUrl(row), `${shopUrl(row)}/admin`, `${shopUrl(row)}/shop-profile.js`);
      if (apps.includes("stockroom")) urls.push(`https://${siteOf(row.shopId, "stockroom")}.web.app`);
      const bad = [];
      for (const url of urls) {
        const { status, problems = [] } = await siteCheck.get(url);
        if (status !== 200 || problems.length) bad.push(`${url} answered ${status}${problems.length ? ` (${problems.join("; ")})` : ""}`);
      }
      return bad.length ? { ok: false, detail: bad.join("; ") } : { ok: true };
    },

    async checkout(row) {
      const origin = shopUrl(row);
      const url = `https://${row.region ?? REGION}-${row.shopId}.cloudfunctions.net/createStripeCheckoutSession`;
      const response = await fetch(url, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status !== 204) return { ok: false, detail: `the checkout answered ${response.status}` };
      if (response.headers.get("access-control-allow-origin") !== origin) {
        return { ok: false, detail: `the checkout doesn't accept the shop's own pages (${origin})` };
      }
      return { ok: true };
    },

    async webhook(row, { now }) {
      const status = (await shopDb(row.shopId).get("adminSecrets/stripeWebhookStatus")) ?? {};
      const failures = [[status.lastFailureAt, status.lastFailure], [status.lastProcessingFailureAt, status.lastProcessingFailure]]
        .filter(([at]) => at && hoursBetween(now().toISOString(), at) <= WEBHOOK_WINDOW_HOURS)
        .filter(([at]) => !status.lastReceivedAt || at > status.lastReceivedAt)
        .sort(([a], [b]) => (a < b ? 1 : -1));
      if (failures.length) return { ok: false, detail: `payment events are failing since ${failures[0][0]}: ${failures[0][1] ?? "no detail"}` };
      return { ok: true };
    },

    async backup(row, { now }) {
      const apps = appsOf(row);
      const problems = [];
      const tooOld = (at) => !at || hoursBetween(now().toISOString(), at) > BACKUP_MAX_HOURS;
      if (apps.includes("shop")) {
        const status = await shopDb(row.shopId).get("systemStatus/backup");
        // The shop's own nightly backup, or the platform's stand-in when that one was late (nightly.js).
        const lastGood = [status?.lastSuccessAt, row.platformBackup?.shopAt].filter(Boolean).sort().at(-1);
        const lastTry = status?.ok === false && status.error ? ` (last try: ${status.error})` : "";
        if (!lastGood) problems.push(`the shop has no good backup yet${lastTry}`);
        else if (tooOld(lastGood)) problems.push(`the shop's last good backup is ${Math.floor(hoursBetween(now().toISOString(), lastGood))} hours old${lastTry}`);
      }
      // Nothing in the stockroom backs itself up; the platform's nightly backup is the only one.
      if (apps.includes("stockroom") && tooOld(row.platformBackup?.stockroomAt)) {
        problems.push(row.platformBackup?.stockroomAt ? `the stockroom's last backup is ${Math.floor(hoursBetween(now().toISOString(), row.platformBackup.stockroomAt))} hours old` : "the stockroom has no backup yet");
      }
      return problems.length ? { ok: false, detail: problems.join("; ") } : { ok: true };
    },
  };
}

/** Runs the checks that apply to one shop. Every check runs, even after one fails. */
export async function checkShop(row, checks, { now = () => new Date() } = {}) {
  const results = {};
  for (const name of checksFor(row)) {
    try {
      results[name] = await checks[name](row, { now });
    } catch (error) {
      results[name] = { ok: false, detail: `couldn't check: ${message(error)}` };
    }
  }
  return results;
}
