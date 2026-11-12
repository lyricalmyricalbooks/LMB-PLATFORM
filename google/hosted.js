// The Google link as the hosted server runs it (server/world.js): the real stores and the real way into each shop.
//
//   hostedGoogleLink({ env, fetch, token, platform, registry, now })
//     -> { config, link, handle(request) } where `handle` answers /api/google/... (http.js handleGoogle), or null when
//        the link's settings are missing or broken (the door then answers "not connected" and shops keep "coming soon")
//
// Stores, in the platform project's database:
//   googleConnections/<shop id>   each shop's sealed Google tokens (tokens.js)
//   googleStates/<state>          one-use sign-in states, 15 minutes each (service.js)
//
// A shop's own place comes from its registry row. In the shared system (`shared: true`) that is the folder
// shops/<shop id> in the row's project (docs/shared-system.md); the platform never writes outside it. The settings are
// the ones the shop's server already reads: settings/website.analytics.ga4MeasurementId (the tag, behind the shop's
// consent rules) and adminSecrets/googleAnalytics.{propertyId, searchConsoleSite} (the Overview's figures). Search
// Console's proof file goes to the shop's own site folder in the project's bucket (shops/<id>/site/<file>), where the
// front door serves it (apps/shop functions/frontDoor.js).
import { firestoreClient } from "../clients/firestore.js";
import { googleHttp } from "../clients/http.js";
import { readGoogleConfig } from "./config.js";
import { createGoogleApi } from "./googleApi.js";
import { domainsBridge } from "./domainBridge.js";
import { googleClosing } from "./closing.js";
import { createGoogleLink } from "./index.js";
import { handleGoogle } from "./http.js";

const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const STATE = /^[0-9a-f]{48}$/;
/** Google's proof file for Search Console: google, then hex, then .html. */
export const VERIFICATION_FILE = /^google[0-9a-f]{8,32}\.html$/;

/** Where a shop's data lives: its project, and its folder there ("" for a shop with a project of its own). */
export function shopPlace(row) {
  const shopId = String(row?.shopId ?? "");
  const projectId = String(row?.projectId ?? "");
  if (!SHOP_ID.test(shopId)) throw new Error(`"${shopId.slice(0, 80)}" isn't a shop id`);
  if (!PROJECT_ID.test(projectId)) throw new Error(`${shopId} has no project yet`);
  return { shopId, projectId, folder: row.shared === true ? `shops/${shopId}` : "" };
}

/** The real `shopFirebase` (connect.js): every write lands in the shop's own folder of its own project. */
export function hostedShopFirebase({ fetch, token }) {
  const call = googleHttp({ fetch, token });
  const dbOf = (row) => {
    const { projectId, folder } = shopPlace(row);
    return firestoreClient({ fetch, token, projectId, folder });
  };
  const numbers = new Map();
  return {
    /**
     * The shop's reporting account: the account its server runs as (Cloud Functions' default, `<project number>-compute@`),
     * which reads Analytics and Search Console for the Overview (apps/shop functions/googleAnalytics.js).
     */
    async serviceAccount(row) {
      const { projectId } = shopPlace(row);
      if (!numbers.has(projectId)) {
        const project = await call("GET", `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`);
        if (!/^\d+$/.test(String(project?.projectNumber ?? ""))) throw new Error(`${projectId} has no project number`);
        numbers.set(projectId, String(project.projectNumber));
      }
      return `${numbers.get(projectId)}-compute@developer.gserviceaccount.com`;
    },
    async writeAnalytics(row, { measurementId, propertyId }) {
      const db = dbOf(row);
      await db.set("adminSecrets/googleAnalytics", { propertyId: String(propertyId) }, { fields: ["propertyId"] });
      await db.set("settings/website", { analytics: { ga4MeasurementId: measurementId } }, { fields: ["analytics.ga4MeasurementId"] });
    },
    async writeSearchConsoleSite(row, site) {
      await dbOf(row).set("adminSecrets/googleAnalytics", { searchConsoleSite: site }, { fields: ["searchConsoleSite"] });
    },
    async publishVerificationFile(row, { name, content }) {
      const { shopId, projectId, folder } = shopPlace(row);
      if (!folder) throw new Error(`${shopId} isn't in the shared system, so its pages can't take Google's proof file`);
      if (!VERIFICATION_FILE.test(String(name))) throw new Error("that isn't Google's proof file name");
      const bucket = typeof row.storageBucket === "string" && row.storageBucket ? row.storageBucket : `${projectId}.firebasestorage.app`;
      await call("POST", `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`, {
        query: { uploadType: "media", name: `shops/${shopId}/site/${name}` },
        raw: String(content), contentType: "text/html; charset=utf-8",
      });
    },
    async clearTag(row) {
      await dbOf(row).set("settings/website", { analytics: { ga4MeasurementId: "" } }, { fields: ["analytics.ga4MeasurementId"] });
    },
    /**
     * A shop in the shared system has no project of its own: its folder goes with the platform's own deletion of the
     * shop, never the project every shop shares. Deleting a shop's own project waits on Julian's go.
     */
    async deleteProject(row) {
      if (row && typeof row === "object" && row.shared === true) return;
      throw new Error("Deleting a shop's own project isn't switched on.");
    },
  };
}

/** `googleConnections/<shop id>` and `googleStates/<state>` in the platform's database. */
export function googleStores(platform) {
  const shopPath = (shopId) => {
    if (!SHOP_ID.test(String(shopId ?? ""))) throw new Error("not a shop id");
    return `googleConnections/${shopId}`;
  };
  return {
    connections: {
      get: (shopId) => platform.get(shopPath(shopId)),
      set: (shopId, value) => platform.set(shopPath(shopId), value),
    },
    states: {
      put: (state, value) => {
        if (!STATE.test(state)) throw new Error("not a sign-in state");
        return platform.set(`googleStates/${state}`, value);
      },
      // One use: read and removed together, so a sign-in answer can't be replayed.
      take: (state) => (STATE.test(String(state)) ? platform.transaction(async (tx) => {
        const found = await tx.get(`googleStates/${state}`);
        if (found) tx.remove(`googleStates/${state}`);
        return found;
      }) : Promise.resolve(null)),
    },
  };
}

/** The audit log in each shop's own folder (record.js), found from its registry row. */
export function rowAuditLog({ fetch, token, registry }) {
  const dbFor = async (shopId) => {
    const row = await registry.getShop(shopId);
    const { projectId, folder } = shopPlace({ ...row, shopId });
    return firestoreClient({ fetch, token, projectId, folder });
  };
  return {
    async ready(shopId) {
      try {
        await (await dbFor(shopId)).get("audit-log/_ready");
        return true;
      } catch (error) {
        if (error?.status === 404 || error?.status === 403 || /no project yet/.test(String(error?.message))) return false;
        throw error;
      }
    },
    write: async (shopId, id, entry) => (await dbFor(shopId)).set(`audit-log/${String(id).replace(/[/]/g, "_")}`, entry),
  };
}

/**
 * The settings with the platform's own address filled in: Google sends the press back to
 * <PLATFORM_URL>/api/google/oauth unless GOOGLE_REDIRECT_URL says otherwise.
 */
export function googleEnv(env = {}) {
  const base = String(env.PLATFORM_URL ?? "").trim().replace(/\/+$/, "");
  const redirect = String(env.GOOGLE_REDIRECT_URL ?? "").trim() || (/^https:\/\//.test(base) ? `${base}/api/google/oauth` : "");
  return { ...env, GOOGLE_REDIRECT_URL: redirect };
}

export function hostedGoogleLink({ env = {}, fetch, token, platform, registry, domains = null, now = () => Date.now(), log = console.error }) {
  let config;
  try {
    config = readGoogleConfig(googleEnv(env), { now: now() });
  } catch (error) {
    log(`The Google link is off: ${error.message}`);
    return null;
  }
  if (!config.app) return null;
  const google = createGoogleApi({ fetch, app: config.app, redirectUrl: config.redirectUrl });
  const shopFirebase = hostedShopFirebase({ fetch, token });
  // `domains` is the platform's web address service (services/domains/hosted.js): Google's proof lines and the email
  // sending lines go in through it, and a deleted shop's own address comes off through it.
  const link = createGoogleLink({
    config, google, ...googleStores(platform), registry, auditLog: rowAuditLog({ fetch, token, registry }),
    shopFirebase, domainsCall: domainsBridge(domains), now,
  });
  const deletion = googleClosing({ teardown: link.teardown, registry, shopFirebase });
  return {
    config, link, handle: (request) => handleGoogle(request, { service: link.service }),
    /**
     * For the closing sweep (services/billing/closing.js): when a shop closes, its Google link is undone (the book feed
     * leaves Shopping, the tag stops, Colophon's access is given back). A shop that never connected Google is left alone.
     * The press's own Google accounts and their history stay theirs.
     */
    closingHooks: {
      onClose: [async (shop) => {
        const row = await registry.getShop(shop.shopId);
        if (!row?.google?.connectedAt && !(await link.tokens.get(shop.shopId))) return;
        await link.teardown.teardownOnClose(shop.shopId);
      }],
      // Deletion (after the 90 days to download and both warning emails): every shop's own address comes off, connected
      // to Google or not, and the teardown refuses until the row says the deletion is due. A shared shop's project is the
      // shared one, so it is never deleted for one shop (hostedShopFirebase.deleteProject).
      beforeDelete: deletion.hooks.beforeDelete,
    },
  };
}
