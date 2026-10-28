// The sample press (plan 7.7, docs/demo-shop.md): read-only for visitors, fresh every night, and no way to send an
// email or take a payment. Proven without starting the emulators: the reset runs against a pretend emulator suite, the
// gate's checks and the rules are read as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PORTS, shopProfile } from "./config.js";
import {
  GATE_PORTS, gateRefusal, INTERNAL_PORTS, internalFetch, msUntilReset, readOnlyDatabaseRules, readOnlyRules,
  SAMPLE_NOTICE, sampleEmulatorConfig, sampleProfileScript, sampleRules, sampleViteEnv,
} from "./hosted.js";
import { fileFor } from "./gate.js";
import { resetSamplePress } from "./reset.js";
import { demoShopDocs } from "./seed.js";
import { fakeEmulators } from "./fakeEmulators.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SETTINGS = "(default)/documents/settings/website";

test("a change disappears after the nightly reset", async () => {
  const emulators = fakeEmulators(INTERNAL_PORTS);
  await resetSamplePress({ fetch: emulators.fetch });
  const seeded = new Map(emulators.docs);
  assert.ok(seeded.has(SETTINGS));

  // What a visitor's change would leave behind (were the rules ever to let one through): a renamed shop, a new
  // document, a stockroom change, live data and a new sign-in account.
  emulators.docs.set(SETTINGS, { info: { mapValue: { fields: { name: { stringValue: "Changed by a visitor" } } } } });
  emulators.docs.set("(default)/documents/books/visitor-book", { title: { stringValue: "Not ours" } });
  emulators.docs.set("stockroom/documents/settings/catalog", { data: { stringValue: "{}" } });
  emulators.accounts.add("visitor");
  await internalFetch(emulators.fetch)(`http://127.0.0.1:${PORTS.database}/.json`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify({ sales: 1 }) });

  await resetSamplePress({ fetch: emulators.fetch });
  assert.deepEqual([...emulators.docs.keys()].sort(), [...seeded.keys()].sort());
  for (const [key, value] of seeded) {
    if (key.endsWith("settings/website") || key.startsWith("(default)/documents/books/")) assert.deepEqual(emulators.docs.get(key).info ?? emulators.docs.get(key).title, value.info ?? value.title, key);
  }
  assert.equal(emulators.live(), null);
  assert.deepEqual([...emulators.accounts], ["uid-1"]);
  // The reset only ever talks to the emulators on this computer, on their internal ports.
  const internal = new Set(Object.values(INTERNAL_PORTS).map(String));
  for (const { url } of emulators.requests) {
    const address = new URL(url);
    assert.equal(address.hostname, "127.0.0.1");
    assert.ok(internal.has(address.port), url);
  }
});

test("no email or payment path is reachable: the shop's server code never runs or opens", () => {
  const config = sampleEmulatorConfig();
  assert.equal(config.functions, undefined);
  assert.equal(config.emulators.functions, undefined);
  assert.equal(config.emulators.ui.enabled, false);
  for (const [name, settings] of Object.entries(config.emulators)) {
    if (settings && typeof settings === "object" && "host" in settings) assert.equal(settings.host, "127.0.0.1", name);
  }
  assert.ok(!(PORTS.functions in GATE_PORTS), "the gate opens the server code's port");
  assert.equal(gateRefusal(PORTS.functions, { method: "POST", url: "/demo-colophon-test/us-central1/createCheckoutSession" }), "closed");
  assert.equal(gateRefusal(PORTS.ui, { url: "/" }), "closed");
  // The seed holds no payment or email keys, and the shop's settings say it is a test.
  const seeded = JSON.stringify(demoShopDocs(() => "photo"));
  assert.doesNotMatch(seeded, /sk_(live|test)_|re_[A-Za-z0-9]{8}|secretKey|apiKey|appPassword|scriptUrl/i);
  assert.equal(demoShopDocs(() => "").find(({ path }) => path === "settings/website").data.payments.testMode, true);
});

test("visitors can't write: every rules file keeps its reads and loses its writes", () => {
  const rules = Object.fromEntries(sampleRules(read).map(({ file, text }) => [file, text]));
  assert.deepEqual(Object.keys(rules).sort(), ["database.rules.json", "firestore.rules", "shop.storage.rules", "stockroom.storage.rules"]);
  const code = (text) => text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const file of ["firestore.rules", "shop.storage.rules", "stockroom.storage.rules"]) {
    const text = code(rules[file]);
    assert.doesNotMatch(text, /allow\s+[a-z,\s]*\b(write|create|update|delete)\b/, file);
    assert.match(text, /allow\s+(read|get|list)/, file);
    assert.equal(text.split("{").length, text.split("}").length, `${file} braces`);
  }
  const writes = [...rules["database.rules.json"].matchAll(/"\.write"\s*:\s*([^\s,}]+)/g)].map((m) => m[1]);
  assert.ok(writes.length > 0);
  assert.deepEqual(new Set(writes), new Set(["false"]));
});

test("making rules read-only keeps reads, drops writes and copes with semicolons and apostrophes", () => {
  const { text, changed } = readOnlyRules([
    "match /a/{id} {",
    "  allow read, write: if isAdmin();",
    "  allow create: if request.resource.data.email.matches(\"[^;]+\") // can't be blank",
    "    && isSignedIn();",
    "  allow list, delete: if true;",
    "  allow get: if true;",
    "}",
  ].join("\n"));
  assert.equal(changed, 3);
  assert.equal(text, [
    "match /a/{id} {",
    "  allow read: if isAdmin();",
    "  /* sample press: read-only */",
    "  allow list: if true;",
    "  allow get: if true;",
    "}",
  ].join("\n"));
  assert.equal(readOnlyDatabaseRules('{ ".read": true, ".write": "auth != null && \\"x\\"", "a": { ".write": true } }'), '{ ".read": true, ".write": false, "a": { ".write": false } }');
});

test("the gate turns away the emulators' back doors and passes ordinary visitor requests", () => {
  const owner = { authorization: "Bearer owner" };
  assert.equal(gateRefusal(PORTS.firestore, { method: "POST", url: "/v1/projects/demo-colophon-test/databases/(default)/documents:commit", headers: owner }), "owner pass");
  assert.equal(gateRefusal(PORTS.database, { method: "PUT", url: "/.json?ns=x&auth=owner" }), "owner pass");
  assert.equal(gateRefusal(PORTS.firestore, { method: "DELETE", url: "/emulator/v1/projects/demo-colophon-test/databases/(default)/documents" }), "admin");
  assert.equal(gateRefusal(PORTS.auth, { method: "DELETE", url: "/emulator/v1/projects/demo-colophon-test/accounts" }), "admin");
  assert.equal(gateRefusal(PORTS.auth, { method: "POST", url: "/identitytoolkit.googleapis.com/v1/projects/demo-colophon-test/accounts:update" }), "admin");
  assert.equal(gateRefusal(PORTS.database, { method: "PUT", url: "/.settings/rules.json" }), "admin");
  assert.equal(gateRefusal(PORTS.storage, { method: "POST", url: "/internal/reset" }), "admin");
  assert.equal(gateRefusal(PORTS.shop, { method: "POST", url: "/" }), "read-only");
  // Ordinary use: pages, the practice Google window, sign-in, reading the database.
  assert.equal(gateRefusal(PORTS.shop, { url: "/books/test-book-one" }), null);
  assert.equal(gateRefusal(PORTS.auth, { url: "/emulator/auth/handler?providerId=google.com" }), null);
  assert.equal(gateRefusal(PORTS.auth, { url: "/emulator/v1/projects/demo-colophon-test/config" }), null);
  assert.equal(gateRefusal(PORTS.auth, { method: "POST", url: "/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key" }), null);
  assert.equal(gateRefusal(PORTS.firestore, { method: "POST", url: "/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fdemo-colophon-test" }), null);
});

test("every page says nothing is saved", () => {
  assert.match(SAMPLE_NOTICE, /Nothing you do here is saved/);
  const script = sampleProfileScript(shopProfile());
  assert.match(script, /^\/\/.*\nwindow\.__SHOP_PROFILE__ = \{/);
  assert.ok(script.includes(JSON.stringify(SAMPLE_NOTICE)));
  assert.doesNotMatch(script, /#[0-9a-f]{3,8}\b|rgb\(/i, "the notice uses the system colours, none of its own");
  // The script runs in a page: it adds the notice once.
  const added = [];
  const body = { style: {}, appendChild: (el) => added.push(el) };
  const document = { body, getElementById: () => (added.length ? added[0] : null), createElement: () => ({ style: {}, setAttribute() {} }), addEventListener() {} };
  const window = {};
  new Function("window", "document", script)(window, document);
  new Function("window", "document", script)(window, document);
  assert.equal(added.length, 1);
  assert.equal(added[0].textContent, SAMPLE_NOTICE);
  assert.equal(window.__SHOP_PROFILE__.firebase.projectId, "demo-colophon-test");
});

test("the apps are built for the public host, and only a host name is accepted", () => {
  assert.equal(sampleViteEnv("sample.yourpress.example").VITE_FIREBASE_EMULATOR_HOST, "sample.yourpress.example");
  assert.equal(sampleViteEnv("sample.yourpress.example").VITE_FIREBASE_EMULATORS, "true");
  assert.throws(() => sampleViteEnv(undefined), /public host name/);
  assert.throws(() => sampleViteEnv("http://x/"), /public host name/);
});

test("the gate serves files inside the app's folder only, and the page for any other address", () => {
  const root = mkdtempSync(join(tmpdir(), "sample-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "page");
  writeFileSync(join(root, "assets", "app.js"), "code");
  assert.equal(fileFor(root, "/assets/app.js"), join(root, "assets", "app.js"));
  assert.equal(fileFor(root, "/books/test-book-one"), join(root, "index.html"));
  assert.equal(fileFor(root, "/../../etc/passwd"), join(root, "index.html"));
  assert.equal(fileFor(root, "/%2e%2e/%2e%2e/etc/passwd"), join(root, "index.html"));
});

test("the reset runs at the next 3 a.m.", () => {
  assert.equal(msUntilReset(new Date(2026, 9, 28, 1, 0, 0)), 2 * 3600_000);
  assert.equal(msUntilReset(new Date(2026, 9, 28, 3, 0, 0)), 24 * 3600_000);
  assert.equal(msUntilReset(new Date(2026, 9, 28, 22, 30, 0)), 4.5 * 3600_000);
});

test("the waitlist and sign-up pages link to the sample press once it has an address, and not before", async () => {
  const waitlist = await import("../waitlist/config.js");
  const signup = await import("../signup/config.js");
  assert.equal(waitlist.SAMPLE_PRESS_URL, signup.SAMPLE_PRESS_URL);
  for (const page of ["waitlist/index.html", "signup/index.html"]) {
    assert.match(read(page), /<p id="sample-press" hidden>[^<]*<a href="">Try a sample press<\/a>\. Nothing you do there is saved\.<\/p>/, page);
  }
  for (const script of [read("waitlist/index.html"), read("signup/app.js")]) assert.match(script, /if \(SAMPLE_PRESS_URL\) \{[\s\S]{0,200}hidden = false/);
});
