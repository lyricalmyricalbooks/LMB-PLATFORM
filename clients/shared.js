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
//                         it): get(host); create(host, data) -> true, or false when the address was already there
//
// Only the platform writes the record, its copies and the addresses; no browser can read or write them (the rules sit
// inside `match /shops/{shopId}` and refuse the record itself).
import { firestoreClient } from "./firestore.js";
import { googleHttp } from "./http.js";
import { STOCKROOM_DATABASE } from "./shop.js";

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
    },
  };
}
