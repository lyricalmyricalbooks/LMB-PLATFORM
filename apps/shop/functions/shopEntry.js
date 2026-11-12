// How each way into the server finds its shop (the shared system, LMB-PLATFORM docs/shared-system.md):
//
//   a database trigger   from the document's path: every trigger listens on shops/{shopId}/<its old path>
//   a web request        from ?shop=<id> on the address (the shop's pages, emailed links and webhooks all carry it)
//   the five-minute tick once for every shop that isn't closed, one shop at a time, each in its own folder
//
// Then the work runs inside runInShop (shopScope.js), with the shop's record: its sign-in list (tenant), owner address
// and server settings (shopConfig.js). The record lives at shops/<id> in the database root and only the platform
// writes it; shop code never reads or writes the root itself.

const { currentShop, foldersOn, isShopId, runInShop } = require("./shopScope");
const { configForShop } = require("./shopConfig");
const { timed, usageLine } = require("./usageLog");

const RECORD_TTL_MS = 30 * 1000;

/**
 * @param {object} deps
 * @param {() => any} deps.rootDb Firestore at the database root (unscoped), read only for shop records
 * @param {object} [deps.env] process.env
 * @param {(entry: object) => void} [deps.usage] the usage line writer (usageLog.js)
 */
function shopEntries({ rootDb, env = process.env, now = () => Date.now(), log = console, usage = usageLine } = {}) {
  const cache = new Map();
  /** Runs work in its shop and writes the shop's usage line (usageLog.js): the server time each shop's meter counts. */
  const inShop = (shop, kind, fn) => timed(shop.id, kind, () => runInShop(shop, fn), { usage, now });

  /** The shop for an id, with its config; null when there is no such shop. Cached for half a minute. */
  async function loadShop(id) {
    if (!isShopId(id)) return null;
    const hit = cache.get(id);
    if (hit && now() - hit.at < RECORD_TTL_MS) return hit.shop;
    const snap = await rootDb().collection("shops").doc(id).get();
    // A record with no sign-in list named at all is a half-made shop (setup writes the profile first): no shop yet.
    // Without this, its empty list would accept any sign-in of the whole project. (`tenant: ""` is the demo's choice.)
    const data = snap.exists ? snap.data() || {} : null;
    const record = data && typeof data.tenant === "string" ? data : null;
    const shop = record ? { id, tenant: typeof record.tenant === "string" ? record.tenant : "", status: record.status || "open", record, config: configForShop(id, record, env) } : null;
    if (cache.size >= 5000) cache.clear(); // made-up ids can't grow it without end
    cache.set(id, { at: now(), shop });
    return shop;
  }

  /** Every shop that isn't closed, in id order. */
  async function listShops() {
    const out = [];
    let last = null;
    for (;;) {
      let q = rootDb().collection("shops").orderBy("__name__").limit(200);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      for (const d of snap.docs) {
        const record = d.data() || {};
        if (record.status === "closed" || !isShopId(d.id) || typeof record.tenant !== "string") continue;
        out.push({ id: d.id, tenant: typeof record.tenant === "string" ? record.tenant : "", status: record.status || "open", record, config: configForShop(d.id, record, env) });
      }
      if (snap.docs.length < 200) return out;
      last = snap.docs[snap.docs.length - 1];
    }
  }

  /** A database trigger's path, moved into the shop folders. */
  const inShops = opts => (typeof opts === "string"
    ? `shops/{shopId}/${opts}`
    : { ...opts, document: `shops/{shopId}/${opts.document}` });

  /** Runs a trigger's handler in the shop its document belongs to. */
  const forEvent = handler => async event => {
    const id = event?.params?.shopId;
    if (!id) {
      if (foldersOn()) throw new Error("A database change came in with no shop in its path.");
      return handler(event);
    }
    const shop = await loadShop(id);
    if (!shop) { log.warn?.(`A change in shops/${id} has no shop record; skipped.`); return undefined; }
    return inShop(shop, "event", () => handler(event));
  };

  /** The shop a web request is for: ?shop=<id>. */
  const shopIdOf = req => {
    const q = req?.query?.shop;
    return typeof q === "string" ? q : "";
  };

  /** Runs a web request's handler in its shop; answers 400/404 itself when the shop is missing or unknown. */
  const forRequest = handler => async (req, res) => {
    if (currentShop()) return handler(req, res);
    const id = shopIdOf(req);
    if (!id) {
      if (!foldersOn()) return handler(req, res);
      return res.status(400).json({ error: "This address doesn't say which shop it is for.", code: "no_shop" });
    }
    const shop = isShopId(id) ? await loadShop(id) : null;
    if (!shop) return res.status(404).json({ error: "There is no shop at this address.", code: "no_shop" });
    return inShop(shop, "request", () => handler(req, res));
  };

  /** Runs fn once for every shop that isn't closed, a few at a time; one shop's failure never stops the others. */
  async function eachShop(fn, { concurrency = 4 } = {}) {
    if (!foldersOn()) return [{ id: null, ok: true, value: await fn(null) }];
    const shops = await listShops();
    const results = [];
    let next = 0;
    const worker = async () => {
      while (next < shops.length) {
        const shop = shops[next++];
        try {
          results.push({ id: shop.id, ok: true, value: await inShop(shop, "tick", () => fn(currentShop())) });
        } catch (err) {
          log.error?.(`shop ${shop.id}:`, err?.message || err);
          results.push({ id: shop.id, ok: false, error: String(err?.message || err).slice(0, 300) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, shops.length) }, worker));
    return results;
  }

  return {
    loadShop, listShops, eachShop, forEvent, forRequest, inShops, shopIdOf,
    /** firebase-functions' onDocument* with the path moved into the shop folders and the handler run in its shop. */
    trigger: make => (opts, handler) => make(inShops(opts), forEvent(handler)),
    /** firebase-functions' onRequest with the handler run in the shop the address names. */
    request: make => (...args) => { const handler = args.pop(); return make(...args, forRequest(handler)); },
    forget: id => (id ? cache.delete(id) : cache.clear()),
  };
}

module.exports = { shopEntries, RECORD_TTL_MS };
