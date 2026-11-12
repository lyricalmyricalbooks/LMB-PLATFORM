// The wall between shops on the server (shopScope.js, LMB-PLATFORM docs/shared-system.md): shop code only ever reaches
// its own folder, outside any shop nothing works, and a sign-in only counts in the shop whose list it came from.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const {
  inFolder, isShopId, perShop, runInShop, scopedAdmin, scopedBucket, scopedFirestore, shopFolderOf, shopRelative, currentShop,
} = require("./shopScope");

// Folders on, as on the server (the vitest config turns them off for the older handler tests).
let before;
beforeEach(() => { before = process.env.SHOP_FOLDERS; process.env.SHOP_FOLDERS = "on"; });
afterEach(() => { if (before === undefined) delete process.env.SHOP_FOLDERS; else process.env.SHOP_FOLDERS = before; });

/** A Firestore stand-in that only records which paths were asked for. */
function fakeFirestore() {
  const asked = [];
  const ref = path => ({
    path,
    collection: sub => ref(`${path}/${sub}`),
    doc: id => ref(`${path}/${id}`),
    listCollections: async () => { asked.push(`list:${path}`); return []; },
  });
  return {
    asked,
    collection(path) { asked.push(path); return ref(path); },
    doc(path) { asked.push(path); return ref(path); },
    collectionGroup(id) { asked.push(`group:${id}`); return ref(id); },
    listCollections: async () => { asked.push("list:root"); return []; },
    recursiveDelete: async r => { asked.push(`delete:${r.path}`); },
    batch: () => ({ kind: "batch" }),
  };
}

const shopA = { id: "press-a", tenant: "tenant-a" };
const shopB = { id: "press-b", tenant: "tenant-b" };

describe("shop ids and folders", () => {
  it("accepts only lower-case ids and never makes a path outside shops/", () => {
    expect(shopFolderOf("press-a")).toBe("shops/press-a");
    for (const bad of ["", "Press", "../x", "a/b", "-a", "a".repeat(64), null, undefined, 7]) {
      expect(() => shopFolderOf(bad)).toThrow();
      expect(isShopId(bad)).toBe(false);
    }
  });
  it("puts a path in a folder once, and a path from another folder can't escape", () => {
    expect(inFolder("shops/a", "books/x")).toBe("shops/a/books/x");
    expect(inFolder("shops/a", "/books/x")).toBe("shops/a/books/x");
    expect(inFolder("shops/a", "shops/a/books/x")).toBe("shops/a/books/x");
    expect(inFolder("shops/a", "shops/b/books/x")).toBe("shops/a/shops/b/books/x");
  });
  it("names paths without the current shop's folder", () => runInShop(shopA, () => {
    expect(shopRelative("shops/press-a/books/x")).toBe("books/x");
    expect(shopRelative("shops/press-b/books/x")).toBe("shops/press-b/books/x");
  }));
});

describe("Firestore as one shop sees it", () => {
  it("keeps each shop's reads and writes in its own folder, even when two run at once", async () => {
    const real = fakeFirestore();
    const db = scopedFirestore(real);
    const tick = () => new Promise(r => setTimeout(r, 1));
    await Promise.all([
      runInShop(shopA, async () => { await tick(); db.collection("orders").doc("1"); await tick(); db.doc("settings/website"); }),
      runInShop(shopB, async () => { db.collection("orders").doc("1"); await tick(); db.doc("settings/website"); }),
    ]);
    expect(real.asked.sort()).toEqual([
      "shops/press-a/orders", "shops/press-a/settings/website", "shops/press-b/orders", "shops/press-b/settings/website",
    ]);
  });
  it("refuses everything outside a shop", () => {
    const db = scopedFirestore(fakeFirestore());
    expect(() => db.collection("orders")).toThrow(/outside any shop/);
    expect(() => db.doc("settings/website")).toThrow(expect.objectContaining({ code: "outside_shop" }));
  });
  it("refuses collection-group reads, which would cross shops", () => runInShop(shopA, () => {
    const real = fakeFirestore();
    expect(() => scopedFirestore(real).collectionGroup("private")).toThrow(/cross shops/);
    expect(real.asked).toEqual([]);
  }));
  it("lists only the shop's own collections and deletes only inside its folder", () => runInShop(shopA, async () => {
    const real = fakeFirestore();
    const db = scopedFirestore(real);
    await db.listCollections();
    await db.recursiveDelete(db.collection("carts").doc("x"));
    expect(() => db.recursiveDelete({ path: "shops/press-a" })).toThrow();
    expect(() => db.recursiveDelete({ path: "shops/press-b/orders/1" })).toThrow();
    expect(real.asked).toContain("list:shops/press-a");
    expect(real.asked).toContain("delete:shops/press-a/carts/x");
  }));
  it("keeps the shop through timers and callbacks started inside it", async () => {
    const seen = await runInShop(shopB, () => new Promise(r => setTimeout(() => r(currentShop()?.id), 2)));
    expect(seen).toBe("press-b");
    expect(currentShop()).toBe(null);
  });
});

describe("files as one shop sees them", () => {
  function fakeBucket() {
    const asked = [];
    return {
      asked,
      name: "the-bucket",
      file: name => { asked.push(name); return { name }; },
      getFiles: async q => { asked.push(`list:${q.prefix}`); return [[{ name: `${q.prefix}x.jpg` }], null, { prefixes: [`${q.prefix}2026-11-10/`] }]; },
      deleteFiles: async q => { asked.push(`delete:${q.prefix}`); },
    };
  }
  it("names, lists and deletes files only in the shop's folder", () => runInShop(shopA, async () => {
    const real = fakeBucket();
    const bucket = scopedBucket(real);
    bucket.file("products/a.jpg");
    const [, , api] = await bucket.getFiles({ prefix: "backups/" });
    await bucket.getFiles();
    await bucket.deleteFiles({ prefix: "social/" });
    expect(real.asked).toEqual([
      "shops/press-a/products/a.jpg", "list:shops/press-a/backups/", "list:shops/press-a/", "delete:shops/press-a/social/",
    ]);
    // Sub-folders come back the way the caller named them.
    expect(api.prefixes).toEqual(["backups/2026-11-10/"]);
    expect(bucket.name).toBe("the-bucket");
  }));
  it("refuses files outside a shop", () => {
    expect(() => scopedBucket(fakeBucket()).file("products/a.jpg")).toThrow(/outside any shop/);
  });
});

describe("sign-ins as one shop sees them", () => {
  function fakeAdmin() {
    const authFor = tenant => ({
      tenant,
      verifyIdToken: async token => ({ uid: "u1", firebase: { tenant: token.split(":")[0] || undefined } }),
      getUser: async uid => ({ uid, tenant }),
    });
    return {
      firestore: Object.assign(() => fakeFirestore(), { FieldValue: { serverTimestamp: () => "now" } }),
      storage: () => ({ bucket: () => fakeBucket0() }),
      auth: () => ({ ...authFor(""), tenantManager: () => ({ authForTenant: authFor }) }),
      app: () => ({ options: { projectId: "lmb-test-shop" } }),
    };
  }
  const fakeBucket0 = () => ({ file: name => ({ name }) });

  it("uses the shop's own sign-in list and refuses a pass from another shop's list", () => runInShop(shopA, async () => {
    const admin = scopedAdmin(fakeAdmin());
    expect((await admin.auth().getUser("u1")).tenant).toBe("tenant-a");
    await expect(admin.auth().verifyIdToken("tenant-a:pass")).resolves.toMatchObject({ uid: "u1" });
    await expect(admin.auth().verifyIdToken("tenant-b:pass")).rejects.toMatchObject({ code: "auth/tenant-id-mismatch" });
    await expect(admin.auth().verifyIdToken(":pass")).rejects.toMatchObject({ code: "auth/tenant-id-mismatch" });
  }));
  it("a shop with no list of its own takes only the project's own passes", () => runInShop({ id: "demo-shop", tenant: "" }, async () => {
    const admin = scopedAdmin(fakeAdmin());
    await expect(admin.auth().verifyIdToken(":pass")).resolves.toMatchObject({ uid: "u1" });
    await expect(admin.auth().verifyIdToken("tenant-a:pass")).rejects.toMatchObject({ code: "auth/tenant-id-mismatch" });
  }));
  it("refuses sign-ins outside a shop, and keeps the Firestore statics", () => {
    const admin = scopedAdmin(fakeAdmin());
    expect(() => admin.auth()).toThrow(/outside any shop/);
    expect(admin.firestore.FieldValue.serverTimestamp()).toBe("now");
    expect(admin.app().options.projectId).toBe("lmb-test-shop");
  });
  it("puts the scoped Firestore and Storage in the shop's folder", () => runInShop(shopB, () => {
    const admin = scopedAdmin(fakeAdmin());
    expect(admin.firestore().collection("orders").path).toBe("shops/press-b/orders");
    expect(admin.storage().bucket().file("assets/logo.png").name).toBe("shops/press-b/assets/logo.png");
  }));
});

describe("perShop", () => {
  it("makes one service per shop settings, and one for outside any shop", () => {
    let made = 0;
    const svc = perShop(() => ({ n: ++made, hello() { return this.n; } }));
    const configA = Object.freeze({ shop: "a" });
    const configB = Object.freeze({ shop: "b" });
    expect(svc.hello()).toBe(1);
    expect(runInShop({ ...shopA, config: configA }, () => svc.hello())).toBe(2);
    expect(runInShop({ ...shopB, config: configB }, () => svc.hello())).toBe(3);
    expect(runInShop({ ...shopA, config: configA }, () => svc.n)).toBe(2);
    expect(made).toBe(3);
  });
});

describe("a per-shop cache (perShop written to as plain fields)", () => {
  it("keeps each shop's own value: one shop never reads what another shop cached", () => {
    const cache = perShop(() => ({ at: 0, key: "" }));
    const a = { ...shopA, config: Object.freeze({ shop: "a" }) };
    const b = { ...shopB, config: Object.freeze({ shop: "b" }) };
    runInShop(a, () => { cache.at = 5; cache.key = "key-of-a"; });
    expect(runInShop(b, () => [cache.at, cache.key])).toEqual([0, ""]);
    runInShop(b, () => { cache.key = "key-of-b"; });
    expect(runInShop(a, () => cache.key)).toBe("key-of-a");
    expect(runInShop(b, () => cache.key)).toBe("key-of-b");
  });

  it("the server's per-instance caches of shop data are all kept per shop", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    for (const [file, names] of [["index.js", ["inventoryLinkStateCache", "automaticDiscountsCache"]], ["shippoEndpoints.js", ["addressKeyCache"]]]) {
      const source = fs.readFileSync(path.join(__dirname, file), "utf8");
      for (const name of names) expect(source, name).toMatch(new RegExp(`const ${name} = perShop\\(`));
    }
  });
});

describe("a Square shop's dispute warning", () => {
  it("names Square, not Stripe", () => {
    const { labelProblem } = require("./fulfillmentGuard");
    const order = { paymentStatus: "paid", status: "processing", items: [{ title: "A book", quantity: 1 }], disputeStatus: "needs_response" };
    const square = { ...shopA, config: Object.freeze({ paymentProvider: "square" }) };
    expect(runInShop(square, () => labelProblem(order))).toContain("settled in Square");
    expect(runInShop({ ...shopA, config: Object.freeze({ paymentProvider: "stripe" }) }, () => labelProblem(order))).toContain("settled in Stripe");
  });
});

describe("the document copy (backupJson.js) inside a shop", () => {
  it("writes paths without the shop's folder, so a copy restores into any shop", async () => {
    const zlib = require("node:zlib");
    const { runJsonBackup } = require("./backupJson");
    const docs = { "shops/press-a/books": { a: { title: "A" } }, "shops/press-a/books/a/private": { admin: { shelf: "S1" } } };
    const query = (path, name) => {
      const q = {
        orderBy: () => q, limit: () => q, startAfter: () => q,
        get: async () => ({ docs: Object.entries(docs[path] || {}).map(([id, data]) => ({
          ref: { path: `${path}/${id}`, collection: sub => query(`${path}/${id}/${sub}`, sub) }, data: () => data,
        })) }),
        name,
      };
      return q;
    };
    const real = {
      collection: path => query(path),
      doc: path => ({ listCollections: async () => (path === "shops/press-a" ? [{ id: "books" }] : []) }),
      collectionGroup: () => { throw new Error("no"); },
    };
    const files = {};
    const bucket = { file: name => ({ save: async body => { files[name] = body; } }) };
    await runInShop(shopA, () => runJsonBackup({ db: scopedFirestore(real), bucket, folder: "backups/d/json", idField: "__id" }));
    const lines = buf => zlib.gunzipSync(buf).toString("utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
    expect(lines(files["backups/d/json/books.ndjson.gz"])).toEqual([{ path: "books/a", data: { title: "A" } }]);
    expect(lines(files["backups/d/json/_group_private.ndjson.gz"])).toEqual([{ path: "books/a/private/admin", data: { shelf: "S1" } }]);
  });
});
