// What "healthy" means for one platform shop (plan 4.3). Each check returns { ok, detail }; a check that can't be
// made at all is a failure too ("couldn't check: …"), so a broken check never looks like a working shop.
//
//   pages     the shop's home page, /admin and /shop-profile.js, and the stockroom page, answer 200 (siteCheck)
//   checkout  the shop's checkout function answers a browser's preflight from the shop's own address (204, with that
//             address allowed): the function is deployed, running and accepts the shop's pages
//   webhook   the shop's payment events record (adminSecrets/stripeWebhookStatus): no failed delivery newer than the
//             last good one in the past day
//   errors    shoppers' crashes on the cart and checkout pages (the shop's own scrubbed `clientErrors` records, no names or
//             addresses): CHECKOUT_ERROR_JUMP or more new reports since the last run (plan 13.7)
//   backup    the shop's nightly backup record (systemStatus/backup), or the platform's own backup of it, and the
//             platform's backup of the stockroom (the row's platformBackup, nightly.js): each under BACKUP_MAX_HOURS old
//
// Only reads. The shop's data is read with the platform's token (clients/firestore.js).
import { shopPlaces } from "../../clients/shared.js";
import { ownAddress } from "../domains/names.js";
import { appsOf } from "../../setup/later-steps.js";
import { REGION } from "../../setup/steps.js";

export const BACKUP_MAX_HOURS = 26;
export const WEBHOOK_WINDOW_HOURS = 24;
/** New checkout-page error reports in one run (five minutes) that count as a jump. */
export const CHECKOUT_ERROR_JUMP = 10;
const CHECKOUT_PATH = /^\/(?:checkout|cart)(?:\/|$)/;
const TIMEOUT_MS = 10_000;

const message = (error) => (error instanceof Error ? error.message : String(error));
const hoursBetween = (later, earlier) => (Date.parse(later) - Date.parse(earlier)) / 3_600_000;

/**
 * Why a check couldn't be made, in plain words for the control room and the alert email. Google's own answers (long,
 * with console links and project ids) never go on screen; the run's log keeps them.
 */
export function plainCheckProblem(error) {
  const said = message(error);
  if (/has not been used in project|it is disabled|SERVICE_DISABLED/i.test(said)) return "the shop's data couldn't be reached (the platform looked in the wrong place, or the database is off)";
  if (/permission denied|PERMISSION_DENIED|\b403\b/i.test(said)) return "the platform isn't allowed to read this shop's data";
  if (/not found|NOT_FOUND|\b404\b/i.test(said)) return "the shop's data wasn't found";
  if (/timed? ?out|aborted|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed|network|unreachable/i.test(said)) return "the shop didn't answer in time";
  if (/quota|RESOURCE_EXHAUSTED|\b429\b/i.test(said)) return "Google is limiting requests just now";
  return "something went wrong on the platform's side";
}

/** Which checks apply to a shop: the stockroom alone has no checkout or payments. */
export function checksFor(row) {
  const apps = appsOf(row);
  const names = ["pages"];
  if (apps.includes("shop")) names.push("checkout");
  if (apps.includes("shop") && row.payments?.accountId) names.push("webhook");
  if (apps.includes("shop")) names.push("errors");
  names.push("backup");
  return names;
}

/** The shop's own address (its free address in the shared system, else its project's web.app one). */
export const shopUrl = (row) => `https://${ownAddress(row)}`;

export function healthChecks({ siteCheck, fetch, shopDb }) {
  return {
    async pages(row) {
      const apps = appsOf(row);
      const urls = [];
      if (apps.includes("shop")) urls.push(shopUrl(row), `${shopUrl(row)}/admin`, `${shopUrl(row)}/shop-profile.js`);
      if (apps.includes("stockroom")) urls.push(shopPlaces(row).stockroom);
      const bad = [];
      for (const url of urls) {
        const { status, problems = [] } = await siteCheck.get(url);
        if (status !== 200 || problems.length) bad.push(`${url} answered ${status}${problems.length ? ` (${problems.join("; ")})` : ""}`);
      }
      return bad.length ? { ok: false, detail: bad.join("; ") } : { ok: true };
    },

    async checkout(row) {
      const origin = shopUrl(row);
      const url = shopPlaces({ region: REGION, ...row }).fn?.("createStripeCheckoutSession");
      if (!url) return { ok: false, detail: "couldn't check: the registry has no region for this shop" };
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

    // Plan 13.7. The shop counts each distinct error (clientErrors/<signature>.count, lastPath); this run compares the
    // counts with the ones it saved last time (`memo`) and fails when checkout-page errors jumped. The first run only
    // saves a baseline. Records expire after 30 days, so a record that is gone just drops out of the baseline.
    async errors(row, { now, previous }) {
      const since = new Date(now().getTime() - 24 * 3_600_000);
      const records = await shopDb(row.shopId).query("clientErrors", { where: [["lastSeenAt", ">=", since]], orderBy: [["lastSeenAt", "desc"]], limit: 200 });
      const counts = {};
      const seen = [];
      for (const { id, data } of records) {
        const path = String(data.lastPath ?? data.paths?.[0] ?? "");
        if (!CHECKOUT_PATH.test(path)) continue;
        counts[id] = Number(data.count) || 0;
        seen.push({ id, count: counts[id], message: String(data.message ?? "").slice(0, 160) });
      }
      if (!previous?.memo) return { ok: true, memo: counts };
      let jump = 0;
      let worst = null;
      for (const entry of seen) {
        const delta = entry.count - (previous.memo[entry.id] ?? 0);
        if (delta > 0) jump += delta;
        if (delta > 0 && (!worst || delta > worst.delta)) worst = { ...entry, delta };
      }
      if (jump >= CHECKOUT_ERROR_JUMP) return { ok: false, detail: `${jump} new errors on the cart and checkout pages since the last check${worst ? `; most often: "${worst.message}" (${worst.delta})` : ""}`, memo: counts };
      return { ok: true, memo: counts };
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
      results[name] = await checks[name](row, { now, previous: row.health?.checks?.[name] });
    } catch (error) {
      // The whole answer goes to the run's log; the row keeps plain words only.
      console.error(`${row.shopId}: the ${name} check couldn't be made: ${message(error)}`);
      results[name] = { ok: false, detail: `couldn't check: ${plainCheckProblem(error)}` };
    }
  }
  return results;
}
