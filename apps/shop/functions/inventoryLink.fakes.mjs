// In-memory stand-ins for the inventory link tests: enough of the Admin SDK's Firestore (documents with
// update times, transactions, simple queries) and of inventoryLinkStore.js. Not a test file itself.
let clock = 0;
export const resetClock = () => { clock = 0; };
export const tick = () => { clock += 1; const seconds = 1700000000 + clock; return { seconds, nanoseconds: 0, toDate: () => new Date(seconds * 1000) }; };
const isDelete = v => v && typeof v === "object" && /Delete/i.test(v.constructor?.name || "") ;
const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  keys.slice(0, -1).forEach(k => { o[k] = o[k] && typeof o[k] === "object" ? { ...o[k] } : {}; o = o[k]; });
  if (isDelete(value)) delete o[keys[keys.length - 1]]; else o[keys[keys.length - 1]] = value;
}
function mergeDeep(base, patch) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (isDelete(v)) delete out[k];
    else if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = mergeDeep(out[k], v);
    else out[k] = v;
  }
  return out;
}
export function fakeDb(seed = {}) {
  const docs = {};
  for (const [path, data] of Object.entries(seed)) docs[path] = { data: structuredClone(data), updateTime: tick() };
  let autoId = 0;
  const snapOf = path => {
    const d = docs[path];
    const id = path.split("/").pop();
    return { id, exists: !!d, data: () => (d ? structuredClone(d.data) : undefined), get: f => (d ? getPath(d.data, f) : undefined), updateTime: d?.updateTime, ref: { path } };
  };
  const write = (path, fn) => { const t = tick(); docs[path] = { data: fn(docs[path]?.data), updateTime: t }; return { writeTime: t }; };
  const ops = {
    set: (path, data, opts) => write(path, cur => (opts?.merge ? mergeDeep(cur, data) : Object.fromEntries(Object.entries(data).filter(([, v]) => !isDelete(v))))),
    update: (path, data) => {
      if (!docs[path]) throw new Error(`No document to update: ${path}`);
      return write(path, cur => { const next = structuredClone(cur); for (const [k, v] of Object.entries(data)) setPath(next, k, v); return next; });
    },
  };
  const docRef = (col, id) => {
    const path = `${col}/${id}`;
    return {
      path, id,
      get: async () => snapOf(path),
      set: async (data, opts) => ops.set(path, data, opts),
      update: async data => ops.update(path, data),
    };
  };
  const query = (col, filters = [], order = [], max = Infinity, after = null) => ({
    where: (f, op, v) => query(col, [...filters, [f, op, v]], order, max, after),
    orderBy: f => query(col, filters, [...order, f], max, after),
    limit: n => query(col, filters, order, n, after),
    startAfter: (...vals) => query(col, filters, order, max, vals),
    count: () => ({ get: async () => { const snap = await query(col, filters, order, max, after).get(); return { data: () => ({ count: snap.size }) }; } }),
    get: async () => {
      let rows = Object.keys(docs).filter(p => p.startsWith(`${col}/`) && p.split("/").length === 2).map(snapOf);
      for (const [f, op, v] of filters) {
        rows = rows.filter(s => {
          const x = getPath(s.data(), f);
          if (op === "==") return x === v;
          if (op === ">=") return x != null && x >= v;
          if (op === ">") return x != null && x > v;
          return false;
        });
      }
      const key = (s, f) => (typeof f === "string" ? getPath(s.data(), f) : s.id);
      rows.sort((a, b) => { for (const f of order) { const x = key(a, f), y = key(b, f); if (x < y) return -1; if (x > y) return 1; } return 0; });
      if (after) rows = rows.filter(s => order.map(f => key(s, f)).join("\u0000") > after.join("\u0000"));
      rows = rows.slice(0, max);
      return { docs: rows, size: rows.length, empty: !rows.length };
    },
  });
  return {
    docs,
    collection: col => ({ doc: id => docRef(col, id ?? `auto${++autoId}`), ...query(col) }),
    getAll: async (...refs) => refs.map(r => snapOf(r.path)),
    runTransaction: async fn => {
      const queued = [];
      const result = await fn({
        get: async r => snapOf(r.path),
        set: (r, data, opts) => queued.push(() => ops.set(r.path, data, opts)),
        update: (r, data) => queued.push(() => ops.update(r.path, data)),
      });
      queued.forEach(q => q());
      return result;
    },
  };
}
export function fakeStore({ failWrites = false } = {}) {
  const store = {
    orders: {}, feeds: {}, replies: [], shipments: [], heartbeats: 0, writes: 0,
    heartbeat: async () => { store.heartbeats += 1; },
    pastOrders: [],
    markPastOrders: async ({ from, at }) => {
      if (store.failPastOrders) throw new Error("UNAVAILABLE");
      store.pastOrders.push({ from, at });
    },
    writeWebsiteOrder: async (id, web) => {
      if (failWrites) throw new Error("PERMISSION_DENIED");
      const cur = store.orders[id]?.web;
      if (cur && cur.hash === web.hash) return "same";
      if (cur && cur.sourceUpdatedAt > web.sourceUpdatedAt) return "older";
      store.writes += 1;
      const prev = store.orders[id] || {};
      store.orders[id] = { ...prev, web, pending: true, pendingSince: prev.pending && prev.pendingSince ? prev.pendingSince : new Date().toISOString() };
      return "written";
    },
    waitingShipments: async () => store.shipments,
    replyShipment: async (id, hash, reply) => { store.replies.push({ id, hash, ...reply }); return true; },
    readFeeds: async ids => Object.fromEntries(ids.filter(id => store.feeds[id]).map(id => [id, store.feeds[id]])),
    pendingSummary: async () => ({ count: 0, oldestSince: null }),
    readAppHeartbeat: async () => store.appDoc || null,
    websiteSide: null, shopCatalog: null, websiteSideWrites: 0,
    writeWebsiteSide: async side => { store.websiteSideWrites += 1; store.websiteSide = side; },
    writeShopCatalog: async catalog => { store.shopCatalog = catalog; },
    serviceAccountEmail: async () => "123-compute@developer.gserviceaccount.com",
    checkConnection: async () => (store.connected === false ? { ok: false, problem: "not-granted", serviceAccount: "sa" } : { ok: true, serviceAccount: "sa" }),
    readCatalog: async () => store.catalog || [{ id: "hound", title: "The Hound" }, { id: "altrove", title: "Altrove" }],
  };
  return store;
}
