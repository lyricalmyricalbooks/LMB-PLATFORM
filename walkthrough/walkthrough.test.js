// The walkthrough server (`npm run walkthrough`) starts on a free port and every page answers: the waitlist, sign-up and
// account pages, Plan & billing and the control room, with their own files, on pretend data, and the start page links
// them all. Nothing here uses the network except this computer's own address.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGES, SEED_PRESSES, WALKTHROUGH_TEST_SHOP, startWalkthrough } from "./server.js";
import { START_SECTIONS } from "./startPage.js";
import { ADMIN_EMAIL, adminClaims } from "./world.js";
import { twoStepProblem } from "../control-room/controlRoom.js";

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

test("the start page links every page as the owner and as a press, and every walkthrough link answers 200", async () => {
  const page = await (await get("/")).text();
  assert.equal(await (await get("/start")).text(), page, "/start is the same page");
  for (const section of START_SECTIONS) assert.match(page, new RegExp(`<section id="${section.id}">`));
  const hrefs = [...page.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.deepEqual(hrefs, START_SECTIONS.flatMap((section) => section.links.map((l) => l.href)));
  for (const path of ["/control/", "/waitlist/", "/signup/?as=newcomer@example.com", "/account/?as=owner@example.com", "/account/billing?shop=moth-press&as=owner@example.com", "/account/billing?shop=paper-wasp&as=owner@example.com", "/help/", "/terms/"]) assert.ok(hrefs.includes(path), path);
  // A link with a person opens as that person.
  for (const item of START_SECTIONS.flatMap((section) => section.links).filter((l) => !l.demo && l.who && !l.href.startsWith("/control/"))) assert.equal(new URL(item.href, walk.url).searchParams.get("as"), item.who, item.name);
  const local = hrefs.filter((href) => href.startsWith("/"));
  for (const href of local) assert.equal((await get(href.replace(/#.*/, ""))).status, 200, href);
  const demo = START_SECTIONS.flatMap((section) => section.links).filter((l) => l.demo);
  assert.ok(demo.length >= 5);
  for (const item of demo) assert.match(item.href, /^http:\/\/127\.0\.0\.1:517[34]\//, `${item.name} goes to npm run demo`);
  assert.equal(local.length + demo.length, hrefs.length);
  for (const word of ["admin@example.com", "owner@example.com", "newcomer@example.com", "npm run demo"]) assert.match(page, new RegExp(word));
});

test("the control room opens for the platform owner with two-step sign-in, on the walkthrough's shops and test shop", async () => {
  for (const path of ["/control/", "/control/app.js"]) assert.equal((await get(path)).status, 200, path);
  assert.equal((await get("/control")).status, 301);
  const ADMIN = { ...adminClaims({ ms: () => Date.now() }), email: ADMIN_EMAIL };
  const shops = await call(ADMIN, "GET", "/api/control/shops");
  assert.equal(shops.status, 200);
  assert.ok(["moth-press", "paper-wasp", WALKTHROUGH_TEST_SHOP.shopId].every((id) => shops.body.shops.some((shop) => shop.shopId === id)));
  const { testShop } = (await call(ADMIN, "GET", "/api/control/test-shop")).body;
  assert.equal(testShop.shopId, WALKTHROUGH_TEST_SHOP.shopId);
  assert.equal(testShop.storefrontUrl, "http://127.0.0.1:5173");
  assert.equal(testShop.lastCheck.ok, true);
  assert.equal((await call(ADMIN, "GET", "/api/control/today")).status, 200);
  // Without the second step, or as a press, the control room stays shut.
  const { firebase: _, ...oneStep } = ADMIN;
  assert.equal((await call(oneStep, "GET", "/api/control/shops")).status, 403);
  assert.equal((await call(OWNER, "GET", "/api/control/shops")).status, 403);
  // The test shop is the platform's, not on the press's account page.
  assert.ok(!(await call(OWNER, "GET", "/api/accounts/shops")).body.shops.some((shop) => shop.shopId === WALKTHROUGH_TEST_SHOP.shopId));
});

test("the stand-in sign-in gives the platform owner the two-step claims the control room checks, and no one else", async () => {
  const stub = readFileSync("walkthrough/stub/firebase-auth.js", "utf8");
  assert.match(stub, /"admin@example\.com": \{[^}]*twoStep: true/);
  assert.match(stub, /sign_in_second_factor: "totp"/);
  assert.match(stub, /startsWith\("\/control"\) \? "admin@example\.com"/);
  assert.doesNotMatch(stub.match(/"owner@example\.com": \{[^}]*\}/)[0], /twoStep/);
  assert.equal(twoStepProblem({ firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) }), null);
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
