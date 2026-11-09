// A shop's outside apps (control room, code plan 26.5 follow-up): the apps installed on it, with their permissions, the
// alerts that stopped reaching each one in the last week, and the changes apps asked the shop to make (the shop's
// `appRequests/<id>`, answered by its own checks), in plain words. For "an app changed my stock" or "the app stopped
// seeing my orders". Read only; never an app's key.
//
// Clients passed in:
//   registry   getShop(shopId)
//   installs   listByShop(shopId) -> [{ installId, appId, appName, scopes, status, installedAt, installedBy, testing, removedAt }]
//   outbox     listByInstall(installId) -> alerts [{ status, failedAt, lastError }]
//   shopData   list(shopId, "appRequests") -> [{ id, data: { op, appId, appName, input, status, reason, createdAt } }]
import { ControlError, adminOf } from "./controlRoom.js";
import { scopeWords } from "../services/apps/scopes.js";

export const CHANGES_SHOWN = 20;
const FAILING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One change an app asked for, in plain words (the shop's Settings › Apps says the same). */
export function changeWords(doc = {}) {
  const input = doc.input ?? {};
  if (doc.op === "order.dispatch") {
    return input.shipped === false
      ? `Added tracking to order ${input.orderId ?? ""}`
      : `Marked order ${input.orderId ?? ""} sent (${[input.trackingCarrier, input.trackingNumber].filter(Boolean).join(" ")})`;
  }
  if (doc.op === "inventory.adjust") {
    const n = Number(input.change) || 0;
    return `${n > 0 ? "Added" : "Took away"} ${Math.abs(n)} of ${input.productId ?? ""}${input.variantId ? ` (${input.variantId})` : ""}`;
  }
  return "Asked for a change the shop doesn't know";
}

export function createShopApps({ admins, registry, installs, outbox, shopData, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      const since = new Date(now().getTime() - FAILING_DAYS * DAY_MS).toISOString();
      const [all, requests] = await Promise.all([installs.listByShop(shopId), shopData?.list ? shopData.list(shopId, "appRequests") : []]);
      const apps = [];
      for (const install of all.filter((i) => i.status === "active").sort((a, b) => String(a.installedAt) < String(b.installedAt) ? 1 : -1)) {
        const failed = outbox?.listByInstall
          ? (await outbox.listByInstall(install.installId)).filter((a) => a.status === "failed" && typeof a.failedAt === "string" && a.failedAt >= since)
          : [];
        failed.sort((a, b) => (a.failedAt < b.failedAt ? 1 : -1));
        apps.push({
          appId: install.appId, name: install.appName ?? install.appId, permissions: scopeWords(install.scopes ?? []),
          installedAt: install.installedAt ?? null, installedBy: install.installedBy ?? null, testing: install.testing === true,
          failedAlerts: failed.length, lastError: failed[0]?.lastError ?? null,
        });
      }
      const changes = requests
        .map(({ id, data }) => ({ id, data: data ?? {} }))
        .sort((a, b) => (String(a.data.createdAt ?? "") < String(b.data.createdAt ?? "") ? 1 : -1))
        .map(({ id, data }) => ({
          id, app: data.appName || data.appId || "An app", what: changeWords(data).replace(/\s+/g, " ").trim(), at: data.createdAt ?? null,
          state: data.status === "done" || data.status === "refused" ? data.status : "waiting", reason: data.status === "refused" ? String(data.reason ?? "").slice(0, 200) : null,
        }));
      return {
        shopId, apps, removed: all.filter((i) => i.status === "removed").length,
        changes: changes.slice(0, CHANGES_SHOWN), changeCount: changes.length, refused: changes.filter((c) => c.state === "refused").length,
      };
    },
  };
}

//   POST /api/control/shop-apps  { shopId }: the shop's installed apps and the changes they asked for
export function shopAppsRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return { "POST /api/control/shop-apps": (claims, request) => desk.forShop(claims, body(request)) };
}
