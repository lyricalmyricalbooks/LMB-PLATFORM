// The front door's server side (code plan 18.4): code in, sign-in link out, one setup record per press, and answers
// saved only by the press's owner while it is in setup. Through the real web door (api.js), with pretend stores.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrontDoor, frontDoorPublicRoutes, frontDoorRoutes } from "./frontDoor.js";
import { createApi } from "./api.js";
import { fakeAuth, fakeFrontDoorStores, fakeSignupStores, fakeStagedFiles, fakeVerifyIdToken } from "./fakes.js";
import { createSignup } from "./signup.js";
import { fakeRegistry } from "../setup/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { TERMS_VERSION } from "../terms/terms.js";
import { TEMPLATES } from "../services/email/templates.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true };
const BEN = { uid: "uid-ben", email: "ben@example.com", email_verified: true };
const SETTINGS = { platformUrl: "https://platform.example", platformName: "Colophon", trialDays: 14, currency: "CAD" };

function world({ billing = null, readOldShop, domainLookup } = {}) {
  const stores = fakeFrontDoorStores();
  // Open my shop (18.8) goes through sign-up's own start, with a pretend plan maker.
  const trials = [];
  const signupStores = fakeSignupStores();
  const signup = createSignup({
    ...signupStores, registry: fakeRegistry(), email: fakePlatformEmail(), auth: fakeAuth(), settings: platformSettings({}),
    billing: billing ?? { startTrial: async (args) => { trials.push(args); return { status: "trialing", trialEnd: "2026-11-17T09:00:00.000Z" }; } },
    live: async () => ({ signupOpen: true, signupDailyCap: 10 }), suffix: ((k = 0) => () => (k++ ? `abcd${k}` : "abcde"))(),
  });
  const sent = [];
  let clock = new Date("2026-11-03T09:00:00Z").getTime();
  let n = 0;
  const files = fakeStagedFiles({ now: () => new Date(clock) });
  const door = createFrontDoor({
    ...stores,
    stagedFiles: files,
    signup,
    email: { sendPlatform: async (message) => { sent.push(message); } },
    auth: fakeAuth(),
    settings: SETTINGS,
    now: () => new Date(clock),
    suffix: () => `s${(n += 1)}xyz`,
    random: () => 0.123456,
    ...(readOldShop ? { readOldShop } : {}),
    ...(domainLookup ? { domainLookup } : {}),
  });
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings: SETTINGS,
    routes: frontDoorRoutes(door), publicRoutes: frontDoorPublicRoutes(door), live: () => ({}), log: () => {},
  });
  const ask = (method, path, body, claims) => api({ method, path, body, headers: claims ? { authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { stores, sent, door, ask, files, trials, signupStores, tick: (ms) => { clock += ms; } };
}

test("a code is emailed, and the right code answers with a sign-in link for that address, once", async () => {
  const w = world();
  const sent = await w.ask("POST", "/api/code/send", { email: " Owner@Example.com " });
  assert.equal(sent.status, 200);
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].kind, "sign-in-code");
  assert.equal(w.sent[0].to, "owner@example.com");
  assert.equal(w.sent[0].data.code, "123456");
  const checked = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "123 456" });
  assert.equal(checked.status, 200);
  assert.match(checked.body.link, /^https:\/\/platform\.example\/join\/\?finish=1&oobCode=fake-owner%40example\.com$/);
  const again = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "123456" });
  assert.equal(again.status, 400, "a code works once");
  assert.equal(again.body.link, undefined);
});

test("a wrong or badly typed code gets plain words and no link", async () => {
  const w = world();
  await w.ask("POST", "/api/code/send", { email: "owner@example.com" });
  const wrong = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "654321" });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /didn't match/);
  assert.equal(wrong.body.problems.code, wrong.body.message);
  const short = await w.ask("POST", "/api/code/check", { email: "owner@example.com", code: "12" });
  assert.equal(short.status, 400);
  assert.match(short.body.message, /six numbers/);
  const otherAddress = await w.ask("POST", "/api/code/check", { email: "ben@example.com", code: "123456" });
  assert.equal(otherAddress.status, 400, "a code is only good for the address it was sent to");
});

test("not an email address: nothing is sent", async () => {
  const w = world();
  const answer = await w.ask("POST", "/api/code/send", { email: "not an address" });
  assert.equal(answer.status, 400);
  assert.equal(w.sent.length, 0);
});

test("too many codes in an hour answers 429 in plain words", async () => {
  const w = world();
  for (let i = 0; i < 5; i += 1) assert.equal((await w.ask("POST", "/api/code/send", { email: "owner@example.com" })).status, 200);
  const sixth = await w.ask("POST", "/api/code/send", { email: "owner@example.com" });
  assert.equal(sixth.status, 429);
  assert.match(sixth.body.message, /try again in an hour/);
});

test("the press routes need a sign-in; the code routes don't", async () => {
  const w = world();
  assert.equal((await w.ask("POST", "/api/press", {})).status, 401);
  assert.equal((await w.ask("GET", "/api/press")).status, 401);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId: "x" })).status, 401);
  assert.equal((await w.ask("POST", "/api/code/send", { email: "owner@example.com" })).status, 200);
});

test("signing in makes one setup record, and signing in again gives the same one back", async () => {
  const w = world();
  const first = await w.ask("POST", "/api/press", {}, ADA);
  assert.equal(first.status, 200);
  assert.equal(first.body.press.status, "setup");
  assert.equal(first.body.press.ownerUid, undefined, "the owner's uid is never sent back");
  const second = await w.ask("POST", "/api/press", {}, ADA);
  assert.equal(second.body.press.pressId, first.body.press.pressId);
  assert.equal(w.stores.presses.rows.size, 1);
  const unconfirmed = await w.ask("POST", "/api/press", {}, { ...BEN, email_verified: false });
  assert.equal(unconfirmed.status, 403);
});

test("the three answers are saved, each may be skipped, and only the choices on the page are taken", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  const named = await w.ask("POST", "/api/press/setup", { pressId, pressName: "  Moth Press " }, ADA);
  assert.equal(named.body.press.pressName, "Moth Press");
  const skipped = await w.ask("POST", "/api/press/setup", { pressId, sells: "" }, ADA);
  assert.equal(skipped.status, 200);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, sells: "books", country: "CA" }, ADA)).body.press.country, "CA");
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, sells: "spaceships" }, ADA)).status, 400);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, country: "XX" }, ADA)).status, 400);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, pressName: "x".repeat(121) }, ADA)).status, 409);
  const row = w.stores.presses.rows.get(pressId);
  assert.deepEqual([row.pressName, row.sells, row.country], ["Moth Press", "books", "CA"]);
});

test("another person's press can't be read or changed, and reads the same as no press", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  const theirs = await w.ask("POST", "/api/press/setup", { pressId, pressName: "Taken" }, BEN);
  const none = await w.ask("POST", "/api/press/setup", { pressId: "press-nothing", pressName: "Taken" }, BEN);
  assert.equal(theirs.status, 404);
  assert.deepEqual(theirs.body.message, none.body.message);
  assert.equal(w.stores.presses.rows.get(pressId).pressName, "");
  assert.deepEqual((await w.ask("GET", "/api/press", undefined, BEN)).body.presses, []);
  assert.equal((await w.ask("GET", "/api/press", undefined, ADA)).body.presses.length, 1);
});

test("once a press is opening, its setup answers are locked", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  w.stores.presses.rows.get(pressId).status = "opening";
  const locked = await w.ask("POST", "/api/press/setup", { pressId, pressName: "Late" }, ADA);
  assert.equal(locked.status, 409);
  assert.match(locked.body.message, /locked/);
});

test("only the setup fields can be written: the owner, status and import file can't be set from the page", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  await w.ask("POST", "/api/press/setup", { pressId, status: "open", ownerUid: "uid-ben", stagedImportPath: "x", pendingImportPath: "y", pressName: "Moth" }, ADA);
  const row = w.stores.presses.rows.get(pressId);
  assert.deepEqual([row.status, row.ownerUid, row.stagedImportPath, row.pendingImportPath, row.pressName], ["setup", "uid-ada", "", "", "Moth"]);
});

test("the code email shows the code, says how long it works, and refuses anything but six numbers", () => {
  const parts = TEMPLATES["sign-in-code"]({ code: "042917" }, { settings: SETTINGS });
  assert.match(parts.subject, /^042917 is your Colophon code$/);
  assert.match(parts.text, /042917/);
  assert.match(parts.text, /10 minutes/);
  assert.throws(() => TEMPLATES["sign-in-code"]({ code: "<b>1</b>" }, { settings: SETTINGS }), /six numbers/);
});

test("two tabs signing in at once share one press, and a save never puts back an older status", async () => {
  const w = world();
  const [a, b] = await Promise.all([w.ask("POST", "/api/press", {}, ADA), w.ask("POST", "/api/press", {}, ADA)]);
  assert.equal(a.body.press.pressId, b.body.press.pressId);
  assert.equal(w.stores.presses.rows.size, 1);
  const { pressId } = a.body.press;
  // The platform moves the press on while a save is on its way: the save is refused, the status stays.
  w.stores.presses.rows.get(pressId).status = "opening";
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, pressName: "Late" }, ADA)).status, 409);
  assert.equal(w.stores.presses.rows.get(pressId).status, "opening");
});

test("the return trip lists the person's own presses oldest first, with each one's status", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  const rows = w.stores.presses.rows;
  rows.get(pressId).status = "open";
  rows.set("press-later-one", { ...rows.get(pressId), pressId: "press-later-one", status: "setup", createdAt: "2099-01-01T00:00:00.000Z" });
  rows.set("press-bens-own", { ...rows.get(pressId), pressId: "press-bens-own", ownerUid: "uid-ben" });
  const listed = (await w.ask("GET", "/api/press", undefined, ADA)).body.presses;
  assert.deepEqual(listed.map((p) => [p.pressId, p.status]), [[pressId, "open"], ["press-later-one", "setup"]]);
});

test("the welcome's two looks are saved and shown back; a badly formed look is refused and changes nothing", async () => {
  const w = world();
  const { pressId } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  // Ids the shop and the stockroom add later (such as "press-market" or "bento") are taken without a platform change.
  const saved = await w.ask("POST", "/api/press/setup", { pressId, look: "press-market", adminLook: "bento" }, ADA);
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.press.look, saved.body.press.adminLook], ["press-market", "bento"]);
  assert.deepEqual((await w.ask("GET", "/api/press", undefined, ADA)).body.presses.map((p) => [p.look, p.adminLook]), [["press-market", "bento"]]);
  for (const bad of ["Press Market", "<b>", "-riso", "riso-", "x".repeat(41), 7]) {
    assert.equal((await w.ask("POST", "/api/press/setup", { pressId, adminLook: bad }, ADA)).status, 409, String(bad));
  }
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, look: "" }, ADA)).status, 200, "a skipped look is allowed");
  const row = w.stores.presses.rows.get(pressId);
  assert.deepEqual([row.look, row.adminLook], ["", "bento"]);
});

test("what the press wants to set up is saved as billing's plan id, and nothing else is taken", async () => {
  const w = world();
  const { pressId, plan } = (await w.ask("POST", "/api/press", {}, ADA)).body.press;
  assert.equal(plan, "", "nothing is picked for the press");
  for (const choice of ["shop", "stockroom", "both"]) {
    assert.equal((await w.ask("POST", "/api/press/setup", { pressId, plan: choice }, ADA)).body.press.plan, choice);
  }
  for (const bad of ["gold", "Both", "apps", 3]) {
    assert.equal((await w.ask("POST", "/api/press/setup", { pressId, plan: bad }, ADA)).status, 409, String(bad));
  }
  assert.equal(w.stores.presses.rows.get(pressId).plan, "both");
});

test("the plan list says whether prices are plus tax, so the front door only says so when they are", async () => {
  const plans = (plusTax) => createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: { ...SETTINGS, prices: { shop: 2900, stockroom: 1900, both: 3900 } }, live: () => ({}), plusTax, log: () => {} })({ method: "GET", path: "/api/plans", headers: {} });
  assert.equal((await plans(undefined)).body.plusTax, false);
  assert.equal((await plans(true)).body.plusTax, true);
});

// ── The kept product file (code plan 18.7) ──

async function pressFor(w, who = ADA) {
  const made = await w.ask("POST", "/api/press", {}, who);
  return made.body.press.pressId;
}
const tokenOf = (upload) => upload.url.split("/").pop();

test("a product file is kept through a one-time upload link, and the press sees its name and count, never its path", async () => {
  const w = world();
  const pressId = await pressFor(w);
  const csv = Buffer.from("Title,Price\nMoths,12\n");
  const started = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  assert.equal(started.status, 200);
  assert.equal(started.body.upload.method, "PUT");
  // Not kept until the file has arrived.
  const early = await w.ask("POST", "/api/press/import/kept", { pressId, name: "products.csv", rows: 1 }, ADA);
  assert.equal(early.status, 409);
  assert.equal((await w.files.put(tokenOf(started.body.upload), csv)).ok, true);
  // The link works once.
  assert.equal((await w.files.put(tokenOf(started.body.upload), csv)).ok, false);
  const kept = await w.ask("POST", "/api/press/import/kept", { pressId, name: " my\u0007 products.csv ", rows: 1 }, ADA);
  assert.equal(kept.status, 200);
  assert.deepEqual(kept.body.press.stagedImport, { name: "my products.csv", size: csv.length, rows: 1, at: "2026-11-03T09:00:00.000Z" });
  assert.equal(JSON.stringify(kept.body).includes("press-imports/"), false);
  const row = await w.stores.presses.get(pressId);
  assert.match(row.stagedImportPath, new RegExp(`^press-imports/${pressId}/[0-9a-f]{16}\\.csv$`));
  assert.equal(row.pendingImportPath, "");
  assert.deepEqual([...w.files.files.keys()], [row.stagedImportPath]);
  const listed = await w.ask("GET", "/api/press", undefined, ADA);
  assert.equal(listed.body.presses[0].stagedImport.rows, 1);
});

test("a file over 5 MB is refused in plain words before any upload, and a big upload is thrown away", async () => {
  const w = world();
  const pressId = await pressFor(w);
  const big = await w.ask("POST", "/api/press/import", { pressId, size: 26 * 1024 * 1024 }, ADA);
  assert.equal(big.status, 400);
  assert.match(big.body.message, /larger than 5 MB/);
  assert.equal(w.files.links.size, 0);
  // A file that somehow arrives bigger than the limit is removed, not kept.
  await w.ask("POST", "/api/press/import", { pressId, size: 9 }, ADA);
  w.files.files.set((await w.stores.presses.get(pressId)).pendingImportPath, Buffer.alloc(5 * 1024 * 1024 + 1));
  const kept = await w.ask("POST", "/api/press/import/kept", { pressId, name: "big.csv", rows: 3 }, ADA);
  assert.equal(kept.status, 400);
  assert.equal(w.files.files.size, 0);
  for (const rows of [0, 2001, 1.5, "x"]) {
    assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows }, ADA)).status, 400);
  }
});

test("a stranger can't start, keep or remove another press's file, and the reply doesn't say the press exists", async () => {
  const w = world();
  const pressId = await pressFor(w);
  w.files.files.set(`press-imports/${pressId}/kept.csv`, Buffer.from("Title\nA\n"));
  for (const path of ["/api/press/import", "/api/press/import/kept", "/api/press/import/remove"]) {
    const answer = await w.ask("POST", path, { pressId, size: 9, name: "a.csv", rows: 1 }, BEN);
    assert.equal(answer.status, 404, path);
  }
  assert.equal(w.files.links.size, 0);
  assert.equal(w.files.files.size, 1);
  assert.equal((await w.ask("POST", "/api/press/import", { pressId, size: 9 })).status, 401);
});

test("an upload link expires, the file can be removed, and nothing changes once the shop is opening", async () => {
  const w = world();
  const pressId = await pressFor(w);
  const csv = Buffer.from("Title\nA\n");
  const late = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  w.tick(16 * 60_000);
  assert.equal((await w.files.put(tokenOf(late.body.upload), csv)).ok, false);
  const fresh = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  await w.files.put(tokenOf(fresh.body.upload), csv);
  await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA);
  const removed = await w.ask("POST", "/api/press/import/remove", { pressId }, ADA);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.press.stagedImport, null);
  assert.equal(w.files.files.size, 0);
  await w.stores.presses.set(pressId, { ...(await w.stores.presses.get(pressId)), status: "opening" });
  for (const path of ["/api/press/import", "/api/press/import/remove"]) {
    assert.equal((await w.ask("POST", path, { pressId, size: 9 }, ADA)).status, 409, path);
  }
  assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA)).status, 409);
});

/** Starts an upload, sends the bytes and (unless told not to) keeps it. */
async function bring(w, pressId, text, { keep = true } = {}) {
  const csv = Buffer.from(text);
  const started = await w.ask("POST", "/api/press/import", { pressId, size: csv.length }, ADA);
  assert.equal((await w.files.put(tokenOf(started.body.upload), csv)).ok, true);
  if (keep) assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA)).status, 200);
  return started.body.upload;
}
const keptBytes = async (w, pressId) => {
  const row = await w.stores.presses.get(pressId);
  return w.files.files.get(row.stagedImportPath)?.toString();
};

test("choosing another file and not keeping it leaves the kept file exactly as it was", async () => {
  const w = world();
  const pressId = await pressFor(w);
  await bring(w, pressId, "Title\nFirst\n");
  await bring(w, pressId, "Title\nSecond\n", { keep: false });
  assert.equal(await keptBytes(w, pressId), "Title\nFirst\n");
  assert.equal((await w.stores.presses.get(pressId)).stagedImport.rows, 1);
  // Keeping the new one replaces the old file, and the old one is thrown away.
  assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "b.csv", rows: 1 }, ADA)).status, 200);
  assert.equal(await keptBytes(w, pressId), "Title\nSecond\n");
  assert.equal(w.files.files.size, 1);
});

test("an older upload can't be kept once a newer one has started, and an unkept upload is thrown away", async () => {
  const w = world();
  const pressId = await pressFor(w);
  await bring(w, pressId, "Title\nOld\n", { keep: false });
  const olderPath = (await w.stores.presses.get(pressId)).pendingImportPath;
  const second = await w.ask("POST", "/api/press/import", { pressId, size: 9 }, ADA);
  assert.equal(second.status, 200);
  assert.equal(w.files.files.has(olderPath), false);
  // The newer upload hasn't arrived, so nothing is kept.
  assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA)).status, 409);
  assert.equal((await w.stores.presses.get(pressId)).stagedImport, null);
});

test("a late upload after the shop starts opening never changes the kept file, and remove is refused", async () => {
  const w = world();
  const pressId = await pressFor(w);
  await bring(w, pressId, "Title\nKept\n");
  const late = await w.ask("POST", "/api/press/import", { pressId, size: 12 }, ADA);
  await w.stores.presses.set(pressId, { ...(await w.stores.presses.get(pressId)), status: "opening" });
  await w.files.put(tokenOf(late.body.upload), Buffer.from("Title\nLate\n"));
  assert.equal((await w.ask("POST", "/api/press/import/kept", { pressId, name: "a.csv", rows: 1 }, ADA)).status, 409);
  assert.equal((await w.ask("POST", "/api/press/import/remove", { pressId }, ADA)).status, 409);
  assert.equal(await keptBytes(w, pressId), "Title\nKept\n");
});

test("an old shop read from its address (23.2): the owner gets a file to preview, nothing is kept, strangers get nothing", async () => {
  const asked = [];
  const w = world({ readOldShop: async (address) => {
    asked.push(address);
    return address === "nowhere.example" ? { ok: false, message: "We couldn't read the products at that address." } : { ok: true, host: "moth.example", csv: "Handle,Title\nm,Moth\n", products: 1, notes: ["Check stock."] };
  } });
  const pressId = await pressFor(w);
  const read = await w.ask("POST", "/api/press/old-shop", { pressId, address: "moth.example" }, ADA);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, { ok: true, host: "moth.example", csv: "Handle,Title\nm,Moth\n", products: 1, notes: ["Check stock."] });
  assert.equal((await w.stores.presses.get(pressId)).stagedImport, null, "nothing kept");
  const none = await w.ask("POST", "/api/press/old-shop", { pressId, address: "nowhere.example" }, ADA);
  assert.equal(none.status, 400);
  assert.equal(none.body.problems.address, "We couldn't read the products at that address.");
  assert.equal((await w.ask("POST", "/api/press/old-shop", { pressId, address: "moth.example" }, BEN)).status, 404);
  assert.equal((await w.ask("POST", "/api/press/old-shop", { pressId, address: "moth.example" })).status, 401);
  await w.stores.presses.set(pressId, { ...(await w.stores.presses.get(pressId)), status: "opening" });
  assert.equal((await w.ask("POST", "/api/press/old-shop", { pressId, address: "moth.example" }, ADA)).status, 409);
  assert.deepEqual(asked, ["moth.example", "nowhere.example"], "strangers and opening shops never reach the old shop");
});

// ── Your web address (setup guide) ──

test("a press's own domain is kept with where it was bought, only by its owner and only in setup", async () => {
  const asked = [];
  const w = world({ domainLookup: { lookup: async (name) => {
    asked.push(name);
    if (name === "broken.example") throw new Error("lookup down");
    return name === "mothpress.example"
      ? { zone: name, registrar: { name: "GoDaddy.com, LLC" }, domainConnect: { providerName: "GoDaddy", hasTemplate: true } }
      : { zone: name, registrar: { name: "Shopify Inc." }, domainConnect: null };
  } } });
  const pressId = await pressFor(w);
  const saved = await w.ask("POST", "/api/press/domain", { pressId, domain: " https://WWW.MothPress.example/ " }, ADA);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const { domain, domainSeller, domainEasy, domainChoice } = saved.body.press;
  assert.deepEqual({ domain, domainSeller, domainEasy, domainChoice }, { domain: "mothpress.example", domainSeller: "GoDaddy", domainEasy: true, domainChoice: "own" },
    "www is taken off: the bare domain is the main one and www goes to it");
  // A rival platform's name never reaches the press, and a seller with no Allow window is not "easy".
  const rival = (await w.ask("POST", "/api/press/domain", { pressId, domain: "ink.example" }, ADA)).body.press;
  assert.deepEqual([rival.domain, rival.domainSeller, rival.domainEasy], ["ink.example", "", false]);
  // A lookup that fails still keeps the domain.
  assert.equal((await w.ask("POST", "/api/press/domain", { pressId, domain: "broken.example" }, ADA)).body.press.domain, "broken.example");
  const bad = await w.ask("POST", "/api/press/domain", { pressId, domain: "not a domain" }, ADA);
  assert.equal(bad.status, 400);
  assert.match(bad.body.problems.domain, /doesn't look like a web address/);
  assert.equal((await w.ask("POST", "/api/press/domain", { pressId, domain: "moth-press.web.app" }, ADA)).status, 400);
  assert.equal((await w.ask("POST", "/api/press/domain", { pressId, domain: "ink.example" }, BEN)).status, 404);
  // Empty takes it off and clears the answer, so the guide asks again.
  const cleared = (await w.ask("POST", "/api/press/domain", { pressId, domain: "" }, ADA)).body.press;
  assert.deepEqual([cleared.domain, cleared.domainChoice], ["", ""]);
  // The other answers go through setup like any other.
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, domainChoice: "buy" }, ADA)).body.press.domainChoice, "buy");
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, domainChoice: "sometime" }, ADA)).status, 409);
  await w.stores.presses.set(pressId, { ...(await w.stores.presses.get(pressId)), status: "opening" });
  assert.equal((await w.ask("POST", "/api/press/domain", { pressId, domain: "late.example" }, ADA)).status, 409);
  assert.deepEqual(asked, ["mothpress.example", "ink.example", "broken.example"]);
});

// ── Open my shop (code plan 18.8) ──

async function readyPress(w, fields = { pressName: "Moth Press", country: "CA", plan: "both", sells: "zines", look: "riso" }) {
  const pressId = await pressFor(w);
  await w.ask("POST", "/api/press/setup", { pressId, ...fields }, ADA);
  return pressId;
}
const OPEN = { termsAccepted: true, termsVersion: TERMS_VERSION };

test("Open my shop starts the plan once, queues the shop and locks setup", async () => {
  const w = world();
  const pressId = await readyPress(w);
  const opened = await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.press.status, "opening");
  assert.equal(opened.body.press.shopId, "moth-press-abcde");
  assert.equal(opened.body.shop.trialEnd, "2026-11-17T09:00:00.000Z");
  assert.deepEqual(w.trials.map((t) => [t.shopId, t.plan]), [["moth-press-abcde", "both"]]);
  const row = w.signupStores.signups.rows.get("moth-press-abcde");
  assert.deepEqual([row.pressId, row.status, row.publishes, row.termsVersion], [pressId, "queued", "zines", TERMS_VERSION]);
  // Pressing again (a double click, a second tab) gives the same shop and starts nothing.
  const again = await w.ask("POST", "/api/press/open", { pressId, ...OPEN, plan: "shop" }, ADA);
  assert.equal(again.body.press.shopId, "moth-press-abcde");
  assert.equal(w.trials.length, 1);
  assert.equal((await w.ask("POST", "/api/press/setup", { pressId, pressName: "Other" }, ADA)).status, 409);
});

test("a plan chosen on the Open my shop page is the one started", async () => {
  const w = world();
  const pressId = await readyPress(w);
  const opened = await w.ask("POST", "/api/press/open", { pressId, ...OPEN, plan: "shop" }, ADA);
  assert.equal(opened.body.press.plan, "shop");
  assert.equal(w.trials[0].plan, "shop");
});

test("the email language chosen in setup is the one the plan starts with; none chosen means automatic", async () => {
  const w = world();
  const pressId = await readyPress(w);
  const saved = await w.ask("POST", "/api/press/setup", { pressId, language: "fr" }, ADA);
  assert.equal(saved.body.press.language, "fr");
  const bad = await w.ask("POST", "/api/press/setup", { pressId, language: "de" }, ADA);
  assert.match(bad.body.message, /automatic, French or English/);
  await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  assert.equal(w.trials[0].language, "fr");
  const other = world();
  await other.ask("POST", "/api/press/open", { pressId: await readyPress(other), ...OPEN }, ADA);
  assert.equal(other.trials[0].language, undefined);
});

test("a language changed after Open my shop was refused is the one the plan starts with; automatic clears it", async () => {
  let fail = true;
  const trials = [];
  const w = world({ billing: { startTrial: async (args) => { if (fail) throw new Error("The payment service is busy."); trials.push(args); return { status: "trialing" }; } } });
  const pressId = await readyPress(w);
  await w.ask("POST", "/api/press/setup", { pressId, language: "fr" }, ADA);
  assert.equal((await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA)).status, 500);
  await w.ask("POST", "/api/press/setup", { pressId, language: "" }, ADA);
  fail = false;
  assert.equal((await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA)).status, 200);
  assert.equal(trials.at(-1).language, undefined, "automatic, not the French chosen before the refusal");
});

test("missing details, unticked terms or a plan that won't start leave the press in setup with everything kept", async () => {
  let fail = true;
  const w = world({ billing: { startTrial: async () => { if (fail) throw new Error("The payment service is busy."); return { status: "trialing" }; } } });
  const empty = await pressFor(w);
  const missing = await w.ask("POST", "/api/press/open", { pressId: empty, ...OPEN }, ADA);
  assert.equal(missing.status, 400);
  assert.match(missing.body.message, /press's name/);
  const pressId = await readyPress(w);
  const unticked = await w.ask("POST", "/api/press/open", { pressId, termsVersion: TERMS_VERSION }, ADA);
  assert.equal(unticked.status, 400);
  assert.ok(unticked.body.problems.terms);
  assert.equal((await w.stores.presses.get(pressId)).status, "setup");
  // The plan didn't start: still in setup, and pressing again right away works.
  const failed = await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  assert.equal(failed.status, 500);
  const row = await w.stores.presses.get(pressId);
  assert.deepEqual([row.status, row.pressName, row.look, row.openingSince], ["setup", "Moth Press", "riso", ""]);
  fail = false;
  assert.equal((await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA)).body.press.status, "opening");
});

test("two presses of Open my shop at the same moment open one shop", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const trials = [];
  const w = world({ billing: { startTrial: async (args) => { trials.push(args); await gate; return { status: "trialing" }; } } });
  const pressId = await readyPress(w);
  const first = w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  await new Promise((resolve) => setImmediate(resolve));
  const second = await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  assert.equal(second.status, 409);
  assert.match(second.body.message, /already being opened/);
  release();
  assert.equal((await first).body.press.status, "opening");
  assert.equal(trials.length, 1);
});

test("a stranger can't open another press's shop", async () => {
  const w = world();
  const pressId = await readyPress(w);
  assert.equal((await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, BEN)).status, 404);
  assert.equal((await w.stores.presses.get(pressId)).status, "setup");
  assert.equal(w.trials.length, 0);
});

test("after the plan fails to start, the retry opens with the answers the press gives now, as one shop", async () => {
  let fail = true;
  const trials = [];
  const w = world({ billing: { startTrial: async (args) => { if (fail) throw new Error("The payment service is busy."); trials.push(args); return { status: "trialing" }; } } });
  const pressId = await readyPress(w);
  assert.equal((await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA)).status, 500);
  // The press changes its mind while back in setup: a new plan and a new name.
  await w.ask("POST", "/api/press/setup", { pressId, pressName: "Leaf Books" }, ADA);
  fail = false;
  const opened = await w.ask("POST", "/api/press/open", { pressId, ...OPEN, plan: "shop" }, ADA);
  assert.equal(opened.body.press.status, "opening");
  assert.deepEqual(trials.map((t) => [t.plan, t.pressName]), [["shop", "Leaf Books"]]);
  const rows = [...w.signupStores.signups.rows.values()].filter((row) => row.pressId === pressId);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].shopId, rows[0].plan, rows[0].pressName], [opened.body.press.shopId, "shop", "Leaf Books"]);
});

test("two presses with the same name on one account open two shops", async () => {
  const w = world();
  const first = await readyPress(w);
  // A second press on the same account (made from the picker), with the same name in other letters.
  const second = "press-second";
  await w.stores.presses.create(second, { ...(await w.stores.presses.get(first)), pressId: second, pressName: "moth press", plan: "stockroom" });
  const a = await w.ask("POST", "/api/press/open", { pressId: first, ...OPEN }, ADA);
  const b = await w.ask("POST", "/api/press/open", { pressId: second, ...OPEN }, ADA);
  assert.notEqual(a.body.press.shopId, b.body.press.shopId);
  assert.deepEqual(w.trials.map((t) => t.plan), ["both", "stockroom"]);
});

test("a press whose country hasn't opened yet is told so and stays in setup, and can open once it has", async () => {
  const w = world();
  const pressId = await readyPress(w, { pressName: "Moth Press", country: "US", plan: "shop" });
  const waits = await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  assert.equal(waits.status, 200);
  assert.equal(waits.body.press.status, "setup");
  assert.equal(waits.body.shop.status, "later");
  assert.match(waits.body.shop.message, /Canada/);
  assert.equal(w.trials.length, 0);
  // Still in setup: it can change its answers, and pressing again re-checks.
  await w.ask("POST", "/api/press/setup", { pressId, country: "CA" }, ADA);
  const opened = await w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  assert.equal(opened.body.press.status, "opening");
  assert.equal([...w.signupStores.signups.rows.values()].filter((row) => row.pressId === pressId).length, 1);
});

test("while Open my shop is running, the press's answers can't change under it", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const w = world({ billing: { startTrial: async () => { await gate; return { status: "trialing" }; } } });
  const pressId = await readyPress(w);
  const opening = w.ask("POST", "/api/press/open", { pressId, ...OPEN }, ADA);
  await new Promise((resolve) => setImmediate(resolve));
  const renamed = await w.ask("POST", "/api/press/setup", { pressId, pressName: "Other" }, ADA);
  assert.equal(renamed.status, 409);
  release();
  assert.equal((await opening).body.press.pressName, "Moth Press");
});
