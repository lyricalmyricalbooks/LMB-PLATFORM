// Sales channels and Social posts (code plan 27.4): the admin's steps go to the platform's social service as this shop,
// posts are kept in `socialPosts`, and the sweep sends what is due once. A pretend service and database stand in.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { socialActions, failedPostEmail, productLink, retailerIdOf } = require("./socialLink.js");
const { readShopConfig } = require("./shopConfig.js");

const URL_ = "https://social.platform.example";
const KEY = "service-key-moth-press-0123456789abcdef0123";
const SITE = "https://moth-press.web.app";
const NOW = Date.parse("2026-11-04T12:00:00Z");

/** A small in-memory Firestore: docs, where/orderBy/limit, transactions. */
function fakeDb(seed = {}) {
  const data = new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))]));
  let next = 1;
  const col = (name) => { if (!data.has(name)) data.set(name, new Map()); return data.get(name); };
  const ref = (name, id) => ({
    id,
    get: async () => ({ id, exists: col(name).has(id), data: () => (col(name).has(id) ? structuredClone(col(name).get(id)) : undefined) }),
    set: async (value) => { col(name).set(id, structuredClone(value)); },
    update: async (value) => { col(name).set(id, { ...col(name).get(id), ...structuredClone(value) }); },
  });
  const queryOf = (name, filters = [], order = null, max = Infinity) => ({
    where: (f, op, v) => queryOf(name, [...filters, [f, op, v]], order, max),
    orderBy: (f, dir = "asc") => queryOf(name, filters, [f, dir], max),
    limit: (n) => queryOf(name, filters, order, n),
    get: async () => {
      let rows = [...col(name).entries()].filter(([, d]) => filters.every(([f, op, v]) => (op === "==" ? d[f] === v : op === "<=" ? d[f] != null && d[f] <= v : false)));
      if (order) rows.sort(([, a], [, b]) => (a[order[0]] < b[order[0]] ? -1 : 1) * (order[1] === "desc" ? -1 : 1));
      rows = rows.slice(0, max);
      return { docs: rows.map(([id, d]) => ({ id, ref: ref(name, id), data: () => structuredClone(d) })) };
    },
  });
  return {
    data,
    collection: (name) => ({ doc: (id) => ref(name, id ?? `auto${next++}`), ...queryOf(name) }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, v) => { r.update(v); } }),
  };
}

const BOOK = {
  id: "nm", slug: "night-moths", title: "Night Moths", photoUrl: "https://img.example/cover.jpg",
  photos: [{ url: "https://img.example/cover.jpg" }, { url: "https://img.example/inside.jpg" }, { url: "https://img.example/clip.jpg", type: "video" }],
};
const STATUS = {
  enabled: true,
  networks: [
    { network: "meta", connected: true, places: [{ id: "fb:111", kind: "facebookPage", name: "Moth Press" }, { id: "ig:222", kind: "instagram", name: "@mothpress" }] },
    { network: "pinterest", connected: true, places: [{ id: "pin:900", kind: "pinterestBoard", name: "New books" }] },
    { network: "tiktok", connected: false, places: [] },
  ],
};

function make({ url = URL_, books = { nm: BOOK }, publish, onFailed, makeSquare } = {}) {
  let clock = NOW;
  const calls = [];
  const db = fakeDb({ books });
  const fetch = async (to, init) => {
    const call = { to, headers: init.headers, ...JSON.parse(init.body) };
    calls.push(call);
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (call.op === "social.status") return reply(200, STATUS);
    if (call.op === "social.publish") return publish ? publish(call.args, reply) : reply(200, { state: "posted", remoteId: `r-${call.args.placeId}`, at: new Date(clock).toISOString() });
    return reply(200, { ok: true, op: call.op, args: call.args });
  };
  let ids = 0;
  const actions = socialActions({
    url, shopId: "moth-press", serviceKey: () => KEY, fetch, db, siteUrl: SITE, now: () => clock, randomId: () => `post${++ids}`, onFailed, makeSquare,
    requireAdmin: async (req, res) => (req.admin ? { email: "owner@example.com" } : (res.status(403).json({ error: "Admin access required" }), null)),
  });
  const run = async (body, { admin = true } = {}) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await actions.handleSocial({ body: { action: "social", ...body }, admin }, res);
    return res;
  };
  const doc = (id) => db.data.get("socialPosts").get(id);
  return { run, calls, db, doc, sweep: actions.runDuePosts, tick: (ms) => { clock += ms; } };
}

const later = (ms) => new Date(NOW + ms).toISOString();

describe("the admin's Sales channels steps", () => {
  test("each network step asks the social service as this shop, with its key; the feed address is the shop's own", async () => {
    const { run, calls } = make();
    await run({ step: "status" });
    await run({ step: "connect", network: "meta", returnUrl: `${SITE}/admin#channels` });
    await run({ step: "sendCatalog", network: "pinterest", feedUrl: "https://evil.example/f.csv" });
    await run({ step: "disconnect", network: "tiktok" });
    expect(calls.map((c) => c.op)).toEqual(["social.status", "social.connectLink", "social.sendCatalog", "social.disconnect"]);
    expect(calls[1].args).toEqual({ network: "meta", returnUrl: `${SITE}/admin#channels` });
    expect(calls[2].args).toEqual({ network: "pinterest", feedUrl: `${SITE}/social-product-feed.csv`, currency: "CAD" });
    expect(calls[0].to).toBe(`${URL_}/shop`);
    expect(calls[0].headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${KEY}` });
  });

  test("off without the service: status says so, other platform steps are refused, nothing is sent", async () => {
    const { run, calls } = make({ url: "" });
    expect((await run({ step: "status" })).body).toEqual({ enabled: false, networks: [] });
    const connect = await run({ step: "connect", network: "meta", returnUrl: `${SITE}/admin` });
    expect(connect.statusCode).toBe(409);
    expect(connect.body.code).toBe("not_available");
    expect(calls).toEqual([]);
  });

  test("only an admin may ask; an unknown step is refused", async () => {
    const { run, calls } = make();
    expect((await run({ step: "status" }, { admin: false })).statusCode).toBe(403);
    expect((await run({ step: "nope" })).statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  test("the platform's refusal comes through in its own plain words", async () => {
    const make2 = make({ publish: (_a, reply) => reply(409, { error: { code: "lost", message: "Facebook & Instagram stopped accepting this shop's connection. Connect it again from Sales channels." } }) });
    const res = await make2.run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Out now", placeIds: ["fb:111"] });
    expect(res.statusCode).toBe(200);
    expect(res.body.post.status).toBe("failed");
    expect(res.body.post.results["fb:111"].message).toMatch(/Connect it again/);
  });
});

describe("posts", () => {
  test("post now: each place gets the product's photo, the words and a link that says where the visit came from", async () => {
    const { run, calls, doc } = make();
    const res = await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Out now", placeIds: ["fb:111", "ig:222", "pin:900"] });
    expect(res.statusCode).toBe(200);
    expect(res.body.post.status).toBe("posted");
    const pubs = calls.filter((c) => c.op === "social.publish");
    expect(pubs.map((c) => c.args.placeId)).toEqual(["fb:111", "ig:222", "pin:900"]);
    expect(pubs[1].args).toMatchObject({ postId: "post1", imageUrl: BOOK.photoUrl, caption: "Out now", title: "Night Moths", retailerId: "nm", tagProduct: true });
    expect(pubs[1].args.link).toBe(`${SITE}/books/night-moths?utm_source=instagram&utm_medium=social&utm_campaign=shop-post`);
    expect(pubs[2].args.link).toContain("utm_source=pinterest");
    expect(doc("post1").places.map((p) => p.name)).toEqual(["Moth Press", "@mothpress", "New books"]);
  });

  test("a post is refused before saving: no product, a photo from elsewhere, a video, no words, nowhere, a place not connected, a past time", async () => {
    const { run, db } = make();
    const base = { bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Out now", placeIds: ["fb:111"] };
    expect((await run({ ...base, step: "savePost", bookId: "zz" })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", imageUrl: "https://evil.example/x.jpg" })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", imageUrl: "https://img.example/clip.jpg" })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", caption: " " })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", caption: "x".repeat(2201) })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", placeIds: [] })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", placeIds: ["tt:open-7"] })).statusCode).toBe(409);
    expect((await run({ ...base, step: "savePost", sendAt: later(-5 * 60 * 1000) })).statusCode).toBe(400);
    expect((await run({ ...base, step: "savePost", sendAt: later(400 * 24 * 3600 * 1000) })).statusCode).toBe(400);
    expect(db.data.get("socialPosts")?.size ?? 0).toBe(0);
  });

  test("a scheduled post waits, then the sweep sends it once", async () => {
    const { run, calls, sweep, tick, doc } = make();
    const res = await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Friday", placeIds: ["fb:111"], sendAt: later(60 * 60 * 1000) });
    expect(res.body.post.status).toBe("scheduled");
    expect((await sweep()).sent).toBe(0);
    expect(calls.filter((c) => c.op === "social.publish")).toHaveLength(0);
    tick(61 * 60 * 1000);
    expect((await sweep()).sent).toBe(1);
    expect(doc("post1").status).toBe("posted");
    expect((await sweep()).sent).toBe(0);
    expect(calls.filter((c) => c.op === "social.publish")).toHaveLength(1);
  });

  test("a scheduled post a place refused tells the owner once; a post that went out tells nobody", async () => {
    const told = [];
    const publish = (args, reply) => (args.placeId === "ig:222" ? reply(400, { error: { code: "refused", message: "Instagram only takes JPEG photos." } }) : reply(200, { state: "posted" }));
    const { run, sweep, tick } = make({ publish, onFailed: async (post) => { told.push(post); } });
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Friday", placeIds: ["fb:111", "ig:222"], sendAt: later(60 * 1000) });
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Fine", placeIds: ["fb:111"], sendAt: later(60 * 1000) });
    tick(2 * 60 * 1000);
    await sweep();
    await sweep();
    expect(told.map((p) => p.status)).toEqual(["partly"]);
    const mail = failedPostEmail({ post: { ...told[0], title: "Night <Moths>" }, ownerEmail: "owner@example.com", shopName: "Moth Press", adminLink: `${SITE}/admin#social-posts` });
    expect(mail.to).toEqual(["owner@example.com"]);
    expect(mail.failed).toBe(1);
    expect(mail.subject).toBe("A post didn't go out (Moth Press)");
    expect(mail.html).toContain("Night &lt;Moths&gt;");
    expect(mail.html).toContain("<strong>Instagram</strong> (@mothpress): Instagram only takes JPEG photos.");
    expect(mail.html).not.toContain("Facebook");
    expect(failedPostEmail({ post: told[0], ownerEmail: "", language: "fr" }).subject).toMatch(/^Une publication n'est pas partie/);
  });

  test("the post uses a square copy of the photo unless turned off; a failed copy keeps the photo", async () => {
    const made = [];
    const makeSquare = async (url, id) => { made.push([url, id]); return id === "post2" ? null : `https://img.example/social/${id}.jpg`; };
    const { run, calls } = make({ makeSquare });
    const first = await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Hi", placeIds: ["fb:111"] });
    expect(first.body.post).toMatchObject({ imageUrl: "https://img.example/social/post1.jpg", photoUrl: BOOK.photoUrl, square: true });
    expect(calls.find((c) => c.op === "social.publish").args.imageUrl).toBe("https://img.example/social/post1.jpg");
    const second = await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Hi", placeIds: ["fb:111"] });
    expect(second.body.post).toMatchObject({ imageUrl: BOOK.photoUrl, square: false });
    const third = await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Hi", placeIds: ["fb:111"], square: false });
    expect(third.body.post.imageUrl).toBe(BOOK.photoUrl);
    expect(made.map(([, id]) => id)).toEqual(["post1", "post2"]);
  });

  test("a scheduled post can be cancelled until it goes; then it can't", async () => {
    const { run, sweep, tick, doc } = make();
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "One", placeIds: ["fb:111"], sendAt: later(60_000 * 10) });
    expect((await run({ step: "cancelPost", id: "post1" })).body).toEqual({ cancelled: true });
    tick(60_000 * 11);
    expect((await sweep()).sent).toBe(0);
    expect(doc("post1").status).toBe("cancelled");
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Two", placeIds: ["fb:111"] });
    expect((await run({ step: "cancelPost", id: "post2" })).statusCode).toBe(409);
  });

  test("one place failing leaves the post partly sent; Try again sends only the failed place", async () => {
    let failPin = true;
    const { run, calls } = make({ publish: (args, reply) => (args.placeId === "pin:900" && failPin
      ? reply(422, { error: { code: "refused", message: "Pinterest turned that down. Check the photo and the words, then try again." } })
      : reply(200, { state: "posted", remoteId: "r", at: "2026-11-04T12:00:00.000Z" })) });
    const res = await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Out now", placeIds: ["fb:111", "pin:900"] });
    expect(res.body.post.status).toBe("partly");
    expect(res.body.post.results["pin:900"].message).toMatch(/Pinterest turned that down/);
    failPin = false;
    const retry = await run({ step: "retryPost", id: "post1" });
    expect(retry.body.post.status).toBe("posted");
    expect(calls.filter((c) => c.op === "social.publish").map((c) => c.args.placeId)).toEqual(["fb:111", "pin:900", "pin:900"]);
  });

  test("a sweep that stopped half-way is picked up after a while; the platform keeps it from posting twice", async () => {
    const { run, sweep, tick, db, calls } = make();
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Stuck", placeIds: ["fb:111"], sendAt: later(60_000) });
    tick(2 * 60_000);
    db.data.get("socialPosts").set("post1", { ...db.data.get("socialPosts").get("post1"), status: "sending", claimedAt: later(2 * 60_000) });
    expect((await sweep()).sent).toBe(0);
    tick(20 * 60_000);
    expect((await sweep()).sent).toBe(1);
    expect(calls.filter((c) => c.op === "social.publish")).toHaveLength(1);
  });

  test("a deleted product's scheduled post fails with plain words instead of linking nowhere", async () => {
    const { run, sweep, tick, db, doc } = make();
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Soon", placeIds: ["fb:111"], sendAt: later(60_000) });
    db.data.get("books").delete("nm");
    tick(2 * 60_000);
    await sweep();
    expect(doc("post1").status).toBe("failed");
    expect(doc("post1").results["fb:111"].message).toMatch(/deleted/);
  });

  test("the posts list is newest first", async () => {
    const { run, tick } = make();
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "First", placeIds: ["fb:111"] });
    tick(1000);
    await run({ step: "savePost", bookId: "nm", imageUrl: BOOK.photoUrl, caption: "Second", placeIds: ["fb:111"] });
    const list = await run({ step: "posts" });
    expect(list.body.posts.map((p) => p.caption)).toEqual(["Second", "First"]);
  });
});

describe("helpers and settings", () => {
  test("the product file's id: the first edition's, or the product's own", () => {
    expect(retailerIdOf({ id: "nm" })).toBe("nm");
    expect(retailerIdOf({ id: "nm", variants: [{ id: "pb" }, { id: "hc" }] })).toBe("nm_pb");
  });
  test("a link per place", () => {
    expect(productLink(`${SITE}/`, { slug: "a b" }, "tt:1")).toBe(`${SITE}/books/a%20b?utm_source=tiktok&utm_medium=social&utm_campaign=shop-post`);
    // A shop that doesn't sell books posts its /products/ address (plan 12.18).
    expect(productLink(SITE, { slug: "tee" }, "tt:1", "products")).toBe(`${SITE}/products/tee?utm_source=tiktok&utm_medium=social&utm_campaign=shop-post`);
  });
  test("PLATFORM_SOCIAL_URL turns it on; a plain http address doesn't", () => {
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_SOCIAL_URL: "https://social.platform.example/" }).platformSocialUrl).toBe("https://social.platform.example");
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_SOCIAL_URL: "http://plain.example" }).platformSocialUrl).toBe("");
  });
});
