import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureShopTenant, tenantIdOf, tenantName } from "./shopTenant.js";

const PROJECT = "lmb-test-shop";
const GOOGLE = { enabled: true, clientId: "client.example", clientSecret: "made-up-secret" };

/** A stand-in for google.authConfig and google.tenants that keeps the lists in memory and records each change. */
function fakeGoogle({ project = GOOGLE, lists = [] } = {}) {
  const calls = [];
  const signIns = new Map();
  let made = 0;
  return {
    calls,
    lists,
    signIns,
    authConfig: { googleSignIn: async () => project },
    tenants: {
      list: async () => lists.map((t) => ({ ...t })),
      async create(projectId, fields) {
        calls.push(["create", fields]);
        const list = { name: `projects/${projectId}/tenants/${fields.displayName}-${++made}`, ...fields };
        lists.push(list);
        return list;
      },
      async patch(_p, id, fields) {
        calls.push(["patch", id, Object.keys(fields)]);
        Object.assign(lists.find((t) => tenantIdOf(t) === id), fields);
      },
      googleSignIn: async (_p, id) => signIns.get(id) ?? null,
      async addGoogleSignIn(_p, id, config) { calls.push(["google", id]); signIns.set(id, config); },
      async patchGoogleSignIn(_p, id, config) { calls.push(["google-patch", id]); signIns.set(id, config); },
    },
  };
}

test("a list's name: the start of the shop id and a code from all of it, always within Google's limits", () => {
  assert.match(tenantName("moth-press"), /^moth-press-[a-z0-9]{6}$/);
  assert.equal(tenantName("moth-press"), tenantName("moth-press"));
  // Two shops whose ids start the same get different names.
  assert.notEqual(tenantName("small-press-of-toronto"), tenantName("small-press-of-ottawa"));
  for (const id of ["abc", "a".repeat(63), "press-----------x", "lmb-test-shop"]) {
    assert.match(tenantName(id), /^[a-zA-Z][a-zA-Z0-9-]{3,19}$/, id);
  }
  for (const bad of ["", "Press", "7press", "a/b", null]) assert.throws(() => tenantName(bad), /shop id/);
});

test("makes the shop's list once, with email links, Google and authenticator codes on", async () => {
  const google = fakeGoogle();
  const first = await ensureShopTenant({ google, projectId: PROJECT, shopId: "moth-press" });
  assert.equal(first.created, true);
  assert.equal(google.calls[0][0], "create");
  assert.deepEqual(google.calls[0][1], { displayName: tenantName("moth-press"), allowPasswordSignup: true, enableEmailLinkSignin: true });
  assert.deepEqual(first.changed, ["mfaConfig", "google"]);
  assert.deepEqual(google.signIns.get(first.tenant), GOOGLE);
  const list = google.lists[0];
  assert.equal(list.mfaConfig.state, "ENABLED");

  // Run again: the record names the list, nothing changes.
  const again = await ensureShopTenant({ google, projectId: PROJECT, shopId: "moth-press", record: { tenant: first.tenant } });
  assert.deepEqual(again, { tenant: first.tenant, created: false, changed: [] });
  assert.equal(google.calls.length, 3);
});

test("a run that stopped before the record was written finds its list again by name", async () => {
  const google = fakeGoogle();
  const { tenant } = await ensureShopTenant({ google, projectId: PROJECT, shopId: "moth-press" });
  const again = await ensureShopTenant({ google, projectId: PROJECT, shopId: "moth-press", record: null });
  assert.equal(again.tenant, tenant);
  assert.equal(again.created, false);
  assert.equal(google.lists.length, 1);
});

test("never takes another shop's list, and puts back settings that drifted", async () => {
  const google = fakeGoogle();
  const a = await ensureShopTenant({ google, projectId: PROJECT, shopId: "press-a" });
  const b = await ensureShopTenant({ google, projectId: PROJECT, shopId: "press-b" });
  assert.notEqual(a.tenant, b.tenant);
  google.lists[0].enableEmailLinkSignin = false;
  google.signIns.set(a.tenant, { ...GOOGLE, enabled: false });
  const fixed = await ensureShopTenant({ google, projectId: PROJECT, shopId: "press-a", record: { tenant: a.tenant } });
  assert.deepEqual(fixed.changed, ["enableEmailLinkSignin", "google"]);
  assert.equal(google.signIns.get(a.tenant).enabled, true);
});

test("refuses to make a list while Google sign-in is off in the shared project", async () => {
  for (const project of [null, { enabled: false, clientId: "c", clientSecret: "s" }, { enabled: true, clientId: "c" }]) {
    const google = fakeGoogle({ project });
    await assert.rejects(ensureShopTenant({ google, projectId: PROJECT, shopId: "moth-press" }), /Google sign-in isn't on/);
    assert.equal(google.calls.length, 0);
  }
});
