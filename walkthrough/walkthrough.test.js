// The walkthrough server (`npm run walkthrough`) starts on a free port and every page answers: the waitlist, sign-up and
// account pages and Plan & billing, with their own files, on pretend data. The start page path stays a placeholder for
// the control room's start page. Nothing here uses the network except this computer's own address.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGES, SEED_PRESSES, startWalkthrough } from "./server.js";

let walk;
before(async () => {
  walk = await startWalkthrough({ sweepEveryMs: 20 });
});
after(async () => {
  await walk.close();
});

const OWNER = { uid: "uid-owner", email: "owner@example.com", email_verified: true, name: "Ada Owner" };
const NEWCOMER = { uid: "uid-newcomer", email: "newcomer@example.com", email_verified: true, name: "Nell Newcomer" };
const get = (path) => fetch(`${walk.url}${path}`, { redirect: "manual" });
const call = (claims, method, path, body) => fetch(`${walk.url}${path}`, {
  method, headers: { "Content-Type": "application/json", ...(claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
}).then(async (response) => ({ status: response.status, body: await response.json() }));

test("each page answers 200 on a random port, and Plan & billing for each made-up press", async () => {
  assert.ok(walk.port > 0);
  const addresses = [...PAGES.map((page) => page.path), ...SEED_PRESSES.map((press) => `/account/billing?shop=${press.address}`)];
  assert.ok(addresses.length >= 6);
  for (const address of addresses) {
    const response = await get(address);
    assert.equal(response.status, 200, address);
    assert.match(response.headers.get("content-type"), /^text\/html/, address);
  }
  for (const address of ["/waitlist", "/signup", "/account", "/accounts"]) assert.equal((await get(address)).status, 301, `${address} goes to its folder`);
  assert.equal((await get("/accounts/")).status, 200, "the sign-in links' address for the account page");
});

test("the path / holds only the one-line placeholder, and /start is left free", async () => {
  const page = await (await get("/")).text();
  assert.match(page, /<p>Start page coming<\/p>/);
  assert.equal(page.replace(/<head>[\s\S]*<\/head>/, "").replace(/<[^>]+>/g, "").trim(), "Start page coming");
  assert.equal((await get("/start")).status, 404);
  assert.equal((await get("/start/")).status, 404);
  assert.deepEqual(PAGES.filter((page) => page.path === "/").map((page) => page.name), ["Start page"]);
});

test("the pages load their own files, with the sign-in and the pricing pointed at the walkthrough", async () => {
  for (const path of ["/signup/app.js", "/signup/form.js", "/signup/device.js", "/account/app.js", "/account/roles.js", "/accounts/billing.js", "/accounts/billingWords.js", "/waitlist/signup.js", "/waitlist/pricing.js", "/walkthrough/firebase/firebase-app.js", "/walkthrough/firebase/firebase-auth.js"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /javascript/, path);
  }
  const signupConfig = await (await get("/signup/config.js")).text();
  assert.match(signupConfig, /FIREBASE_SDK = "\/walkthrough\/firebase"/);
  const waitlistConfig = await (await get("/waitlist/config.js")).text();
  assert.match(waitlistConfig, /PLANS_URL = "\/api\/plans"/);
  assert.match(waitlistConfig, /SIGNUP_URL = "\/signup\/"/);
  // Not one address of Google's or of a real project goes out to the browser.
  for (const text of [signupConfig, waitlistConfig, await (await get("/waitlist/firestoreStore.js")).text()]) {
    assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, ""), /gstatic|googleapis|lmb-platform-prod|AIza/);
  }
  // The files on disk are untouched.
  assert.match(readFileSync("signup/config.js", "utf8"), /gstatic/);
});

test("only the pages' files are served: no tests, notes or files outside their folders", async () => {
  for (const path of ["/signup/signup.test.js", "/signup/README.md", "/signup/..%2f..%2fpackage.json", "/signup/%2e%2e/package.json", "/account/../package.json", "/waitlist/firebase.json", "/nothing/"]) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test("the web door answers: plans open, the owner's two presses, and the newcomer has none", async () => {
  const plans = await call(null, "GET", "/api/plans");
  assert.equal(plans.body.signupOpen, true);
  assert.equal(plans.body.plans.length, 3);

  const shops = (await call(OWNER, "GET", "/api/accounts/shops")).body.shops;
  assert.deepEqual(shops.map((shop) => [shop.pressName, shop.status, shop.role]), [["Moth Press", "live", "owner"], ["Paper Wasp Press", "live", "owner"]]);
  assert.deepEqual(shops.map((shop) => shop.access), ["open", "paused"], "one on its trial, one paused until a card is added");
  assert.deepEqual((await call(NEWCOMER, "GET", "/api/signup")).body.shops, []);
  assert.equal((await call(null, "GET", "/api/signup")).status, 401);

  const billing = await call(OWNER, "POST", "/api/billing/status", { shopId: "moth-press" });
  assert.equal(billing.status, 200);
  assert.equal(billing.body.billing.status, "trialing");
  assert.equal((await call(NEWCOMER, "POST", "/api/billing/status", { shopId: "moth-press" })).status, 403);
});

test("a card is added through the stand-in card page, and the paused press opens", async () => {
  const asked = await call(OWNER, "POST", "/api/billing/card", { shopId: "paper-wasp" });
  assert.equal(asked.status, 200);
  assert.match(asked.body.url, /^\/walkthrough\/card\?session=cs_test_\d+&shop=paper-wasp$/);
  const page = await get(asked.body.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Add the test card/);
  const session = new URL(asked.body.url, walk.url).searchParams.get("session");
  const done = await call(null, "POST", "/walkthrough/card", { session });
  assert.equal(done.status, 200);
  const after = (await call(OWNER, "POST", "/api/billing/status", { shopId: "paper-wasp" })).body.billing;
  assert.equal(after.hasCard, true);
  assert.equal((await call(OWNER, "GET", "/api/accounts/shops")).body.shops.find((shop) => shop.shopId === "paper-wasp").access, "open");
  assert.equal((await call(null, "POST", "/walkthrough/card", { session: "cs_test_nothing" })).status, 404);
});

test("a press signed up on the page is made by the shop maker and shows on the account page; a waitlist sign-up is kept", async () => {
  const signed = await call(NEWCOMER, "POST", "/api/signup", { pressName: "Lantern Zines", plan: "shop", country: "CA", publishes: "zines", termsAccepted: true, termsVersion: (await call(null, "GET", "/api/plans")).body.termsVersion });
  assert.equal(signed.status, 200);
  let status = "queued";
  for (let tries = 0; tries < 100 && status !== "ready"; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    status = (await call(NEWCOMER, "GET", "/api/signup")).body.shops[0].status;
  }
  assert.equal(status, "ready");
  assert.deepEqual((await call(NEWCOMER, "GET", "/api/accounts/shops")).body.shops.map((shop) => shop.pressName), ["Lantern Zines"]);

  const joined = await call(null, "POST", "/walkthrough/waitlist", { id: "abc", record: { email: "reader@example.com" } });
  assert.equal(joined.status, 200);
  assert.equal(walk.waitlist.get("abc").email, "reader@example.com");
});
