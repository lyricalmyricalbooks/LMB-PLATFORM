// The shared system (LMB-PLATFORM docs/shared-system.md): one copy of this server code runs every shop, and each shop's
// data and files live only in its own folder, `shops/<shopId>`. This file is the wall on the server side.
//
//   runInShop(shop, fn)   runs fn for one shop. Everything fn starts (awaits, timers, callbacks) stays in that shop.
//   scopedAdmin(admin)    the Admin SDK as the shop code sees it: admin.firestore() reads and writes only the current
//                         shop's folder, admin.storage() only its file folder, and admin.auth() only accepts sign-ins
//                         from the shop's own sign-in list (its tenant).
//
// Outside a shop (no runInShop), the database, files and sign-ins refuse to work, so a forgotten wrapper can never
// write to another shop or to the database root. The one exception is SHOP_FOLDERS=off, which only the server's older
// handler tests set (vitest.config.ts): they run one shop's code against an in-memory database with no folders.

const { AsyncLocalStorage } = require("node:async_hooks");

const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const store = new AsyncLocalStorage();

class OutsideShopError extends Error {
  constructor(what) {
    super(`${what} was asked for outside any shop. Shop code runs inside runInShop (functions/shopScope.js).`);
    this.code = "outside_shop";
  }
}

/** True unless the older single-shop handler tests turned the folders off. */
const foldersOn = () => process.env.SHOP_FOLDERS !== "off";

/** The folder for a shop id; throws on anything that isn't one, so a bad id can never point at the database root. */
function shopFolderOf(shopId) {
  if (typeof shopId !== "string" || !SHOP_ID.test(shopId)) throw new Error(`"${String(shopId).slice(0, 80)}" isn't a shop id.`);
  return `shops/${shopId}`;
}
const isShopId = id => typeof id === "string" && SHOP_ID.test(id);

/** The shop this code is running for: { id, folder, tenant, record, config }, or null. */
const currentShop = () => store.getStore() || null;

/** Runs fn for `shop` ({ id, tenant?, record?, config? }); returns what fn returns. */
function runInShop(shop, fn) {
  const folder = shopFolderOf(shop?.id);
  return store.run(Object.freeze({ ...shop, folder, tenant: typeof shop.tenant === "string" ? shop.tenant : "" }), fn);
}

/** The current shop's folder, "" with the folders off, or a throw outside any shop. */
function folderNow(what) {
  const shop = currentShop();
  if (shop) return shop.folder;
  if (foldersOn()) throw new OutsideShopError(what);
  return "";
}

/** A path in `folder`. A path already in it is returned as it is (paths read back from refs and file addresses). */
function inFolder(folder, path) {
  const clean = String(path ?? "").replace(/^\/+/, "");
  if (!folder) return clean;
  return clean.startsWith(`${folder}/`) ? clean : `${folder}/${clean}`;
}

/** A path without the current shop's folder in front (the path the shop's own code names), or the path as it is. */
function shopRelative(path) {
  const folder = currentShop()?.folder;
  const clean = String(path ?? "");
  return folder && clean.startsWith(`${folder}/`) ? clean.slice(folder.length + 1) : clean;
}

const bound = (target, prop) => {
  const value = target[prop];
  return typeof value === "function" ? value.bind(target) : value;
};

/**
 * Firestore as one shop sees it. collection()/doc() land in the shop's folder; transactions, batches and getAll take
 * refs made here, so they stay in it too. A collection-group read would cross every shop, so it is refused.
 */
function scopedFirestore(real) {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "collection") return path => target.collection(inFolder(folderNow(`The "${path}" collection`), path));
      if (prop === "doc") return path => target.doc(inFolder(folderNow(`The "${path}" document`), path));
      if (prop === "collectionGroup") {
        return id => {
          if (foldersOn() || currentShop()) throw new Error(`A "${id}" collection-group read would cross shops. Read each parent's sub-collection instead.`);
          return target.collectionGroup(id);
        };
      }
      if (prop === "listCollections") {
        return () => {
          const folder = folderNow("The list of collections");
          return folder ? target.doc(folder).listCollections() : target.listCollections();
        };
      }
      if (prop === "recursiveDelete") {
        return (ref, ...rest) => {
          // A whole shop is closed by the platform, never by the shop's own code.
          if (!ref || typeof ref.path !== "string" || (foldersOn() && !ref.path.startsWith(`${folderNow("A delete")}/`))) {
            throw new Error("Only a part of this shop's own folder can be deleted.");
          }
          return target.recursiveDelete(ref, ...rest);
        };
      }
      return bound(target, prop);
    },
  });
}

/** A bucket as one shop sees it: file names and listing prefixes are in the shop's folder. */
function scopedBucket(real) {
  const relativePrefixes = api => (api && Array.isArray(api.prefixes) ? { ...api, prefixes: api.prefixes.map(shopRelative) } : api);
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "file") return (name, ...rest) => target.file(inFolder(folderNow("A file"), name), ...rest);
      if (prop === "getFiles" || prop === "deleteFiles") {
        return async (query = {}, ...rest) => {
          const opts = typeof query === "object" && query !== null ? query : {};
          const folder = folderNow("A file list");
          const scoped = { ...opts, prefix: folder ? inFolder(folder, opts.prefix || "") : opts.prefix };
          if (folder && !opts.prefix) scoped.prefix = `${folder}/`;
          const out = await target[prop](scoped, ...rest);
          // Listing answers name sub-folders the way the caller asked: inside the shop's folder.
          return prop === "getFiles" && Array.isArray(out) ? [out[0], out[1], relativePrefixes(out[2])] : out;
        };
      }
      return bound(target, prop);
    },
  });
}

function scopedStorage(real) {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "bucket") return (...args) => scopedBucket(target.bucket(...args));
      return bound(target, prop);
    },
  });
}

/**
 * Sign-ins as one shop sees them: the shop's own sign-in list (its Identity Platform tenant), and a pass only counts when
 * it came from that list. A shop record with tenant "" uses the project's own list (the demo and a single-shop test).
 */
function scopedAuth(real) {
  const shop = currentShop();
  if (!shop) {
    if (foldersOn()) throw new OutsideShopError("Sign-in");
    return real;
  }
  const tenant = shop.tenant || "";
  const auth = tenant ? real.tenantManager().authForTenant(tenant) : real;
  return new Proxy(auth, {
    get(target, prop) {
      if (prop === "verifyIdToken") {
        return async (token, ...rest) => {
          const decoded = await target.verifyIdToken(token, ...rest);
          if ((decoded?.firebase?.tenant || "") !== tenant) {
            throw Object.assign(new Error("This sign-in belongs to another shop."), { code: "auth/tenant-id-mismatch" });
          }
          return decoded;
        };
      }
      return bound(target, prop);
    },
  });
}

/** The Admin SDK (adminSdk.js shape) with every shop-data door scoped to the current shop. */
function scopedAdmin(admin) {
  let db = null;
  const firestore = app => (app ? admin.firestore(app) : (db ||= scopedFirestore(admin.firestore())));
  for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(admin.firestore))) {
    if (key !== "length" && key !== "name" && key !== "prototype") Object.defineProperty(firestore, key, desc);
  }
  return new Proxy(admin, {
    get(target, prop) {
      if (prop === "firestore") return firestore;
      if (prop === "auth") return app => scopedAuth(target.auth(app));
      if (prop === "storage") return app => scopedStorage(target.storage(app));
      return bound(target, prop);
    },
  });
}

/**
 * One `make()` per shop, made the first time a shop uses it and kept while that shop's settings stay the same: for
 * services built from the shop's settings (its card payment provider, its email sender). Property reads and calls go
 * to the current shop's own one; outside any shop, to one made from the server's own settings.
 */
function perShop(make) {
  const made = new WeakMap();
  let outside = null;
  const now = () => {
    const config = currentShop()?.config;
    if (!config) return (outside ||= make());
    if (!made.has(config)) made.set(config, make());
    return made.get(config);
  };
  return new Proxy({}, {
    get(_, prop) { const it = now(); const value = it[prop]; return typeof value === "function" ? value.bind(it) : value; },
    // Written to the current shop's own one, so a per-shop cache can be kept as plain fields.
    set(_, prop, value) { now()[prop] = value; return true; },
    has: (_, prop) => prop in now(),
    ownKeys: () => Reflect.ownKeys(now()),
    getOwnPropertyDescriptor: (_, prop) => (prop in now() ? { value: now()[prop], enumerable: true, configurable: true, writable: false } : undefined),
  });
}

/** A value worked out again each time it is read (an id, an address): `valueOf(x)` for code that takes either. */
const valueOf = value => (typeof value === "function" ? value() : value);

module.exports = {
  perShop, valueOf,
  OutsideShopError, currentShop, foldersOn, inFolder, isShopId, runInShop, scopedAdmin, scopedAuth, scopedBucket,
  scopedFirestore, shopFolderOf, shopRelative,
};
