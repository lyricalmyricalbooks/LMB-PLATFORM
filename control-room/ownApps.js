// Colophon's own apps in the control room (services/apps/ownApps.js): for each one, whether it's on the app store, and
// when it isn't, what it's still waiting for. How many shops added each one comes from app use (appUse.js), which the
// App store page already reads. Read only.
//
// Clients passed in:
//   ownApps  names; appOf(name); needs(name); titleOf(name)
//   apps     the app store: get(appId)
import { adminOf } from "./controlRoom.js";
import { ownAppId } from "../services/apps/ownApps.js";

const NEEDS = new Set(["secret", "company", "zapier"]);

/** One own app as the page shows it. */
export function ownAppRow(name, ownApps, record) {
  const needs = ownApps?.needs ? ownApps.needs(name) : "secret";
  return {
    name,
    title: ownApps?.titleOf?.(name) ?? name,
    appId: ownAppId(name),
    onStore: record?.onStore === true,
    // Taken off the store by an admin (not by Colophon while it waited): it stays off until someone puts it back.
    takenOff: record?.status === "unlisted" && record.unlisted?.by !== "colophon",
    needs: NEEDS.has(needs) ? needs : null,
  };
}

export function createOwnAppsDesk({ admins, ownApps, apps, now = () => new Date() }) {
  return {
    async list(claims) {
      adminOf(claims, admins, now().getTime());
      const rows = [];
      for (const name of ownApps?.names ?? []) rows.push(ownAppRow(name, ownApps, await apps.get(ownAppId(name)).catch(() => null)));
      return { apps: rows };
    },
  };
}

//   POST /api/control/own-apps  {}: each of Colophon's own apps, on the store or what it waits for (read only)
export function ownAppsDeskRoutes(desk) {
  return { "POST /api/control/own-apps": (claims) => desk.list(claims) };
}
