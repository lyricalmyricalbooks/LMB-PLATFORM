// Fair-use limits on the whole web door (code plan 19.5): per signed-in person a minute, tighter for costly calls, per
// network for the public ones; 429 with plain words and retryAfter; admins skip the per-person limit only; a broken
// counter lets calls through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COSTLY_ROUTES, DEFAULT_LIMITS, TOO_FAST, createLimits, networkOf } from "./limits.js";
import { createApi } from "./api.js";
import { fakeThrottle, fakeVerifyIdToken } from "./fakes.js";
import { platformSettings } from "../services/settings.js";

const START = Date.parse("2026-11-02T12:00:00Z");
const PRESS = { uid: "uid-press", email: "owner@example.com", email_verified: true };
const OTHER = { uid: "uid-other", email: "other@example.com", email_verified: true };
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(START / 1000) };

function make({ limits } = {}) {
  let clock = START;
  const throttle = fakeThrottle();
  const logged = [];
  const ran = [];
  const limiter = createLimits({ throttle, admins: ["admin@example.com"], ...(limits ? { limits } : {}), now: () => new Date(clock), log: (line) => logged.push(line) });
  const signup = { sendSignInLink: async () => ({ ok: true }) };
  const routes = Object.fromEntries(["GET /api/signup/ping", ...COSTLY_ROUTES].map((route) => [route, async (claims, request) => { ran.push(route); return { query: request.query ?? null }; }]));
  const door = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes, limits: limiter, live: () => ({}), log: () => {} });
  const ask = (claims, method, path, { body, headers = {} } = {}) => door({ method, path, body, headers: { ...headers, ...(claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {}) } });
  return { throttle, logged, ran, ask, tick: (ms) => void (clock += ms) };
}

const times = async (n, call) => {
  const answers = [];
  for (let i = 0; i < n; i += 1) answers.push(await call());
  return answers;
};

test("a signed-in person gets 120 calls a minute; the next is 429 with plain words and retryAfter; a minute later it opens", async () => {
  const w = make();
  const answers = await times(DEFAULT_LIMITS.person.max, () => w.ask(PRESS, "GET", "/api/signup/ping"));
  assert.ok(answers.every((a) => a.status === 200));
  const over = await w.ask(PRESS, "GET", "/api/signup/ping");
  assert.equal(over.status, 429);
  assert.equal(over.body.message, TOO_FAST);
  assert.equal(over.body.retryAfter, 60);
  assert.ok(over.body.fix);
  assert.equal(over.body.message, "You're going a bit fast. Wait a minute and try again.");
  // Someone else isn't held up by it.
  assert.equal((await w.ask(OTHER, "GET", "/api/signup/ping")).status, 200);
  // Refused calls aren't counted: after the minute it opens again.
  w.tick(61_000);
  assert.equal((await w.ask(PRESS, "GET", "/api/signup/ping")).status, 200);
});

test("costly calls: 10 per 10 minutes per person, each call on its own; admins are held to it too", async () => {
  const w = make();
  for (const route of COSTLY_ROUTES) {
    const [method, path] = route.split(" ");
    const answers = await times(10, () => w.ask(PRESS, method, path, { body: {} }));
    assert.ok(answers.every((a) => a.status === 200), route);
    const over = await w.ask(PRESS, method, path, { body: {} });
    assert.deepEqual([over.status, over.body.retryAfter], [429, 600], route);
  }
  const admin = await times(10, () => w.ask(ADMIN, "POST", "/api/control/check", { body: {} }));
  assert.ok(admin.every((a) => a.status === 200));
  assert.equal((await w.ask(ADMIN, "POST", "/api/control/check", { body: {} })).status, 429);
  w.tick(10 * 60_000 + 1000);
  assert.equal((await w.ask(PRESS, "POST", "/api/signup/retry", { body: {} })).status, 200);
});

test("control-room admins (two-step, on the list) skip the per-person limit; without two steps they don't", async () => {
  const w = make();
  const answers = await times(DEFAULT_LIMITS.person.max + 20, () => w.ask(ADMIN, "GET", "/api/signup/ping"));
  assert.ok(answers.every((a) => a.status === 200));
  const noTwoStep = { ...ADMIN, uid: "uid-admin-2", firebase: {} };
  await times(DEFAULT_LIMITS.person.max, () => w.ask(noTwoStep, "GET", "/api/signup/ping"));
  assert.equal((await w.ask(noTwoStep, "GET", "/api/signup/ping")).status, 429);
});

test("public calls: the plans 300 a minute and sign-in links 20 an hour per network, from x-forwarded-for or the ip", async () => {
  const w = make();
  const from = (address) => ({ headers: { "X-Forwarded-For": `${address}, 10.0.0.1` } });
  const plans = await times(300, () => w.ask(null, "GET", "/api/plans", from("203.0.113.5")));
  assert.ok(plans.every((a) => a.status === 200));
  assert.equal((await w.ask(null, "GET", "/api/plans", from("203.0.113.5"))).status, 429);
  assert.equal((await w.ask(null, "GET", "/api/plans", from("203.0.113.6"))).status, 200, "another network");

  const links = await times(20, () => w.ask(null, "POST", "/api/signin-link", { ...from("203.0.113.5"), body: { email: "a@example.com" } }));
  assert.ok(links.every((a) => a.status === 200));
  const over = await w.ask(null, "POST", "/api/signin-link", { ...from("203.0.113.5"), body: { email: "a@example.com" } });
  assert.deepEqual([over.status, over.body.retryAfter], [429, 3600]);

  assert.equal(networkOf({ headers: { "x-forwarded-for": " 198.51.100.7 , 10.0.0.1" }, ip: "10.9.9.9" }), "198.51.100.7");
  assert.equal(networkOf({ headers: {}, ip: "10.9.9.9" }), "10.9.9.9");
  assert.equal(networkOf({}), "unknown");
  // The store never holds an address in the clear.
  assert.ok([...w.throttle.hits.keys()].every((key) => !key.includes("203.0.113") && !key.includes("uid-")));
});

test("a broken counter never locks anyone out: the call goes through and it is logged", async () => {
  const w = make({ limits: { ...DEFAULT_LIMITS, person: { max: 1, windowMs: 60_000 } } });
  w.throttle.fail = true;
  const answers = await times(5, () => w.ask(PRESS, "GET", "/api/signup/ping"));
  assert.ok(answers.every((a) => a.status === 200));
  assert.equal((await w.ask(null, "GET", "/api/plans")).status, 200);
  assert.match(w.logged[0], /couldn't be read or written/);
});

test("a door without limits works as before, and a query on the path reaches the route", async () => {
  const w = make();
  const answer = await w.ask(PRESS, "GET", "/api/signup/ping?shopId=moth-press");
  assert.deepEqual(answer.body.query, { shopId: "moth-press" });
  const plain = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: { "GET /api/x": async () => ({ x: 1 }) }, log: () => {} });
  assert.equal((await plain({ method: "GET", path: "/api/x", headers: { Authorization: `Bearer ${JSON.stringify(PRESS)}` } })).body.x, 1);
});
