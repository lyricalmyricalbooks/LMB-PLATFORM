// The shared system's stores (docs/shared-system.md): every shop lives in one Firebase project, each in its own folder.
// The platform reaches a shop through these, never through the shop's own project.
//
//   shopDb(shopId)        the shop's folder in the (default) database (`shops/<id>/…`): what each platform writer into a
//                         shop used to reach in the shop's own project (its data, audit log, plan copies)
//   stockroomDb(shopId)   the shop's folder in the stockroom's named database `stockroom`
//   records               the shop's record, `shops/<id>` in the (default) database: get(shopId); set(shopId, data, { fields })
//   stockroomRecords      the record's copy in the stockroom's database (the stockroom's rules read it): get / set
//   liveRecords           the record's copy in the Realtime Database, `shops/<id>/record`: get / set (replaces it)
//   addresses             `addresses/{host}` -> { shopId }, which shop a web address belongs to (the front door reads
//                         it): get(host); create(host, data) -> true, or false when the address was already there;
//                         remove(host) (the domain service, when a shop lets an address go)
//
// Only the platform writes the record, its copies and the addresses; no browser can read or write them (the rules sit
// inside `match /shops/{shopId}` and refuse the record itself).
import { firestoreClient } from "./firestore.js";
import { googleHttp } from "./http.js";
import { STOCKROOM_DATABASE } from "./shop.js";
import { siteOf } from "./deploy.js";
import { siteUrlOf } from "../services/domains/names.js";

/** The shared project's Realtime Database (the stockroom's live data); `SHARED_SHOPS_DATABASE_URL` when it isn't the default. */
export const liveDatabaseUrl = (projectId, env = {}) => String(env.SHARED_SHOPS_DATABASE_URL ?? "").trim() || `https://${projectId}-default-rtdb.firebaseio.com`;

const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const shopIdOf = (shopId) => {
  if (!SHOP_ID.test(String(shopId ?? ""))) throw new Error(`"${String(shopId).slice(0, 80)}" isn't a shop id`);
  return shopId;
};
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const hostOf = (host) => {
  if (!HOST.test(String(host ?? ""))) throw new Error(`"${String(host).slice(0, 80)}" isn't a web address`);
  return host;
};

/** The Realtime Database's copy of each record, over its REST interface (signed in with the platform's token). */
export function realtimeRecords({ fetch, token, databaseUrl }) {
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/.test(databaseUrl ?? "")) throw new Error("realtimeRecords needs the database's https address");
  const call = googleHttp({ fetch, token });
  const url = (shopId) => `${databaseUrl.replace(/\/$/, "")}/shops/${shopIdOf(shopId)}/record.json`;
  return {
    async get(shopId) {
      const found = await call("GET", url(shopId));
      // The REST answer for nothing there is a bare `null`.
      return found && typeof found === "object" && !("raw" in found) && Object.keys(found).length ? found : null;
    },
    set: (shopId, data) => call("PUT", url(shopId), { body: data }),
  };
}

/**
 * `sharedStores({ fetch, token, projectId, databaseUrl })`: the shared project's stores, as listed above. `databaseUrl`
 * is the project's Realtime Database address (the stockroom's live data); without it `liveRecords` is left out.
 */
export function sharedStores({ fetch, token, projectId, databaseUrl = "" }) {
  const root = firestoreClient({ fetch, token, projectId });
  const stockroomRoot = firestoreClient({ fetch, token, projectId, database: STOCKROOM_DATABASE });
  const recordStore = (db) => ({
    get: (shopId) => db.get(`shops/${shopIdOf(shopId)}`),
    set: (shopId, data, options) => db.set(`shops/${shopIdOf(shopId)}`, data, options),
  });
  return {
    projectId,
    shopDb: (shopId) => firestoreClient({ fetch, token, projectId, folder: `shops/${shopIdOf(shopId)}` }),
    stockroomDb: (shopId) => firestoreClient({ fetch, token, projectId, database: STOCKROOM_DATABASE, folder: `shops/${shopIdOf(shopId)}` }),
    records: recordStore(root),
    stockroomRecords: recordStore(stockroomRoot),
    ...(databaseUrl ? { liveRecords: realtimeRecords({ fetch, token, databaseUrl }) } : {}),
    addresses: {
      get: (host) => root.get(`addresses/${hostOf(host)}`),
      create: (host, data) => root.create(`addresses/${hostOf(host)}`, data),
      remove: (host) => root.remove(`addresses/${hostOf(host)}`),
    },
  };
}

const REGION_NAME = /^[a-z]+-[a-z]+[0-9]{1,2}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/**
 * The shared project's file buckets, where each shop's files sit under shops/<id>/: `SHARED_SHOPS_BUCKETS` (comma
 * separated) when set, else the project's default bucket and the stockroom's.
 */
export function sharedBuckets(env = {}) {
  const listed = String(env.SHARED_SHOPS_BUCKETS ?? "").split(",").map((b) => b.trim()).filter(Boolean);
  if (listed.length) return listed;
  const projectId = String(env.SHARED_SHOPS_PROJECT ?? "").trim();
  return projectId ? [`${projectId}.firebasestorage.app`, `${projectId}-stockroom`] : [];
}

/**
 * Where the platform reads and writes each shop's data: `{ shared, shopDb(shopId), stockroomDb(shopId) }`. With
 * `SHARED_SHOPS_PROJECT` set, every shop is a folder in that project (`shared` is its sharedStores); without it, each
 * shop's own project, as before the shared system. The hosted server and its jobs build theirs here, so every platform
 * writer into a shop (plan copies, messages, closing, health, backups) follows one setting.
 *
 * `rowOf(shopId)` (the registry's getShop), when given, comes first: a shop whose row says it is a folder in a shared
 * project (`shared: true` and that project's id) is reached there, whatever the setting says. The test shops are
 * folders in the shared test project, never in the live one, so without this the health checks, the control room's
 * reset and every other writer looked for them in a project named after the shop (12 November 2026).
 */
export function shopStores({ env = {}, fetch, token, rowOf = null }) {
  const projectId = String(env.SHARED_SHOPS_PROJECT ?? "").trim();
  const shared = projectId ? sharedStores({ fetch, token, projectId, databaseUrl: liveDatabaseUrl(projectId, env) }) : null;
  const byDefault = shared
    ? { shopDb: shared.shopDb, stockroomDb: shared.stockroomDb }
    : {
      shopDb: (shopProject) => firestoreClient({ fetch, token, projectId: shopProject }),
      stockroomDb: (shopProject) => firestoreClient({ fetch, token, projectId: shopProject, database: STOCKROOM_DATABASE }),
    };
  if (typeof rowOf !== "function") return { shared, ...byDefault };

  // A shop never moves between projects, so its place is looked up once. A row that can't be read is not remembered.
  const places = new Map();
  const others = new Map();
  const storesIn = (project) => {
    if (project === projectId) return shared;
    if (!others.has(project)) others.set(project, sharedStores({ fetch, token, projectId: project }));
    return others.get(project);
  };
  const placeOf = async (shopId) => {
    if (!places.has(shopId)) {
      const row = await rowOf(shopId);
      if (!row) return null;
      places.set(shopId, row.shared === true && PROJECT_ID.test(row.projectId ?? "") ? row.projectId : null);
    }
    return places.get(shopId);
  };
  // The same calls as firestoreClient, each finding the shop's place first.
  const found = (kind) => (shopId) => {
    const client = async () => {
      const project = await placeOf(shopIdOf(shopId));
      return (project ? storesIn(project) : byDefault)[kind](shopId);
    };
    return Object.fromEntries(["get", "create", "set", "remove", "query", "transaction"].map((name) => [name, async (...args) => (await client())[name](...args)]));
  };
  return { shared, shopDb: found("shopDb"), stockroomDb: found("stockroomDb") };
}

/**
 * Where one shop answers, from its registry row: `site` (its main address), `stockroom` and `fn(name)`, the address of
 * one of its server functions. A shop in the shared system (`shared: true`) answers at its own addresses on the one
 * front door (the stockroom under /stockroom) and through the shared server, which learns the shop from `?shop=`. A
 * shop with a project of its own answers at that project's addresses. `fn` is null when the row has no usable region or
 * project.
 */
export function shopPlaces(row) {
  const shopId = shopIdOf(row?.shopId);
  const region = row.functionsRegion || row.region;
  const project = row.projectId ?? shopId;
  const site = siteUrlOf(row);
  const usable = REGION_NAME.test(region ?? "") && PROJECT_ID.test(project);
  if (row.shared === true) {
    return { site, stockroom: `${site}/stockroom`, fn: usable ? (name) => `https://${region}-${project}.cloudfunctions.net/${name}?shop=${shopId}` : null };
  }
  return { site, stockroom: `https://${siteOf(shopId, "stockroom")}.web.app`, fn: usable ? (name) => `https://${region}-${project}.cloudfunctions.net/${name}` : null };
}
