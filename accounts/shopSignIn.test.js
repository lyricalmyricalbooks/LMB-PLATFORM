import { test } from "node:test";
import assert from "node:assert/strict";
import { shopSignIn } from "./shopSignIn.js";

const registry = {
  getShop: async (id) => (id === "moth-press" ? { shopId: id, shared: true, tenant: "moth-t1" } : null),
  getProfile: async (id) => (id === "moth-press" ? { firebase: { projectId: "lmb-test-shop" } } : null),
};
function identity({ steps = 0, refuse = false } = {}) {
  const calls = [];
  return {
    calls,
    secondStepsOf: async (projectId, emails, list) => { calls.push(["steps", projectId, emails, list]); return emails.map((email) => ({ email, steps })); },
    ensureUser: async (projectId, email, list) => { calls.push(["user", projectId, email, list]); return { uid: "uid-1", email }; },
    customToken: async (signer, uid, claims, list) => { calls.push(["token", signer, uid, claims, list]); if (refuse) throw Object.assign(new Error("Permission denied"), { status: 403 }); return "tok.en-1"; },
  };
}

test("a person on the team goes into the admin already signed in, as themselves, on the shop's own sign-in list", async () => {
  const id = identity();
  const url = await shopSignIn({ identity: id, registry, log: () => {} })("moth-press", "owner@example.com", "https://moth.shops.example/admin/");
  assert.equal(url, "https://moth.shops.example/admin/#support=tok.en-1");
  const token = id.calls.find((c) => c[0] === "token");
  // No support visit in the token: an ordinary sign-in as that person.
  assert.deepEqual(token, ["token", "firebase-adminsdk-fbsvc@lmb-test-shop.iam.gserviceaccount.com", "uid-1", undefined, { tenantId: "moth-t1" }]);
});

test("two-step sign-in is never skipped: that person gets the plain admin address", async () => {
  const id = identity({ steps: 1 });
  assert.equal(await shopSignIn({ identity: id, registry, log: () => {} })("moth-press", "owner@example.com", "https://moth.shops.example/admin/"), null);
  assert.ok(!id.calls.some((c) => c[0] === "token" || c[0] === "user"));
});

test("when the platform can't sign for the shop yet, the plain address is used and nothing is shown", async () => {
  const logged = [];
  assert.equal(await shopSignIn({ identity: identity({ refuse: true }), registry, log: (l) => logged.push(l) })("moth-press", "owner@example.com", "https://moth.shops.example/admin/"), null);
  assert.equal(logged.length, 1);
  assert.equal(await shopSignIn({ identity: identity(), registry, log: () => {} })("nowhere", "owner@example.com", "https://x.example/admin/"), null);
});
