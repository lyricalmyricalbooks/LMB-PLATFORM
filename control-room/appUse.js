// How outside apps are used (control room, the App store page; code plan 26.4 follow-up): how many shops each app is on,
// and the apps whose alerts are failing, with one action to send an app's failed alerts again once its maker has fixed
// their end. Reads the app installs and the alerts outbox (services/apps/installs.js, alerts.js); never an app's key.
//
// Clients passed in:
//   installs  listActive() -> every active install [{ appId, shopId, testing, installedAt }]
//   outbox    listByStatus(status) -> alerts [{ id, appId, shopId, topic, status, tries, lastError, failedAt }]; put(id, alert)
import { ControlError, adminOf } from "./controlRoom.js";
import { RETRY_MINUTES } from "../services/apps/alerts.js";

/** Failed alerts older than this are history: not counted, not sent again (shops have moved on). */
export const FAILING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESEND_MAX = 200;

/** Active installs per app: { [appId]: { shops, testing } }, where `testing` counts the maker's own test installs. */
export function installsByApp(installs) {
  const byApp = {};
  for (const install of installs) {
    const row = (byApp[install.appId] ??= { shops: 0, testing: 0 });
    if (install.testing) row.testing += 1;
    else row.shops += 1;
  }
  return byApp;
}

/** The apps whose alerts failed in the last week, worst first: [{ appId, alerts, shops, lastError, lastFailedAt }]. */
export function failingApps(failed, now) {
  const since = new Date(now.getTime() - FAILING_DAYS * DAY_MS).toISOString();
  const byApp = new Map();
  for (const alert of failed) {
    if (typeof alert.failedAt !== "string" || alert.failedAt < since) continue;
    const row = byApp.get(alert.appId) ?? { appId: alert.appId, alerts: 0, shopIds: new Set(), lastError: null, lastFailedAt: "" };
    row.alerts += 1;
    row.shopIds.add(alert.shopId);
    if (alert.failedAt > row.lastFailedAt) Object.assign(row, { lastFailedAt: alert.failedAt, lastError: alert.lastError ?? null });
    byApp.set(alert.appId, row);
  }
  return [...byApp.values()]
    .map(({ shopIds, ...row }) => ({ ...row, shops: shopIds.size }))
    .sort((a, b) => b.alerts - a.alerts || (a.lastFailedAt < b.lastFailedAt ? 1 : -1));
}

export function createAppUse({ admins, installs, outbox, now = () => new Date() }) {
  const at = () => now().toISOString();
  return {
    async overview(claims) {
      adminOf(claims, admins, now().getTime());
      const [active, failed] = await Promise.all([installs.listActive(), outbox.listByStatus("failed")]);
      const names = new Map(active.map((install) => [install.appId, install.appName]));
      const failing = failingApps(failed, now()).map((row) => ({ ...row, appName: names.get(row.appId) ?? null }));
      return { byApp: installsByApp(active), failing, failingDays: FAILING_DAYS };
    },

    /** Sends an app's failed alerts from the last week once more (one try each; if it fails again it stays failed). */
    async resend(claims, { appId } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (typeof appId !== "string" || !appId) throw new ControlError(400, "Say which app.");
      const since = new Date(now().getTime() - FAILING_DAYS * DAY_MS).toISOString();
      const failed = (await outbox.listByStatus("failed"))
        .filter((alert) => alert.appId === appId && typeof alert.failedAt === "string" && alert.failedAt >= since)
        .slice(0, RESEND_MAX);
      if (!failed.length) throw new ControlError(404, "That app has no failed alerts from the last week.");
      for (const alert of failed) {
        // tries at the last step: the next failure gives it up again instead of starting another day of retries.
        await outbox.put(alert.id, { ...alert, status: "waiting", tries: RETRY_MINUTES.length, nextAt: at(), resentAt: at(), resentBy: by });
      }
      return { appId, resent: failed.length };
    },
  };
}

//   POST /api/control/app-use         {}: active shops per app and the apps whose alerts are failing
//   POST /api/control/app-use/resend  { appId }: send that app's failed alerts from the last week once more
export function appUseRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/control/app-use": (claims) => desk.overview(claims),
    "POST /api/control/app-use/resend": (claims, request) => desk.resend(claims, body(request)),
  };
}
