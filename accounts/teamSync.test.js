// People added in the shop's own Settings › Team show up in the account switcher, and a removal in either place ends
// in both (code plan 5.11). Fake stores only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createAccounts, ROLES } from "./accounts.js";
import { createTeamSync, handleTeamChanged } from "./teamSync.js";
import { fakeAccountStores, fakeShopData } from "./fakes.js";
import { fakeSignupStores } from "../signup/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { hashServiceKey } from "../services/email/http.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";

const OWNER = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const BEA = { uid: "uid-bea", email: "bea@example.com", email_verified: true };
const CAL = { uid: "uid-cal", email: "cal@example.com", email_verified: true };
const SHOP = "moth-press";
const OTHER = "press-two";
const KEY = "k".repeat(40);
const OTHER_KEY = "o".repeat(40);

function world() {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const now = () => new Date(clock);
  const registry = fakeRegistry();
  for (const [shopId, pressName, owner, key] of [[SHOP, "Moth Press", OWNER.email, KEY], [OTHER, "Another Press", "dee@example.com", OTHER_KEY]]) {
    registry.shops.set(shopId, { shopId, pressName, plan: "both", status: "live", ownerEmail: owner, serviceKeyHash: hashServiceKey(key) });
    registry.profiles.set(shopId, { shopId, siteUrl: `https://${shopId}.example`, firebase: { projectId: shopId }, apps: { shop: true, stockroom: true } });
  }
  const signupStores = fakeSignupStores();
  signupStores.accounts.rows.set(OWNER.uid, { accountId: OWNER.uid, email: OWNER.email, shops: { [SHOP]: "owner" } });
  const stores = fakeAccountStores();
  const shopData = fakeShopData();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  let n = 0;
  const accounts = createAccounts({
    accounts: signupStores.accounts, ...stores, registry, shopData, auditLog, email, settings: platformSettings({}),
    now, token: () => `secret-${(n += 1)}`,
  });
  const sync = createTeamSync({ memberships: stores.memberships, registry, shopData, auditLog, now });
  // What the shop's own admin writes in Settings › Team (apps/shop src/app/admin/teamApi.ts).
  const shopTeam = {
    save: (shopId, address, role) => shopData.set(shopId, `members/${address}`, { role, addedAt: now().toISOString(), addedBy: OWNER.email }),
    remove: (shopId, address) => shopData.remove(shopId, `members/${address}`),
  };
  const shopsOf = async (claims) => (await accounts.myShops(claims)).shops.map(({ shopId, role }) => ({ shopId, role }));
  const logged = (shopId) => [...(auditLog.entries.get(shopId)?.values() ?? [])].filter((e) => e.from === "shop-team").map((e) => e.what);
  const secretOf = (to) => new URL(email.list().filter((m) => m.to === to).at(-1).data.link).searchParams.get("invite");
  return { accounts, sync, stores, shopData, registry, auditLog, shopTeam, shopsOf, logged, secretOf, tick: () => { clock += 60_000; } };
}

test("the roles are the shop's own list", () => {
  const require = createRequire(import.meta.url);
  assert.deepEqual([...ROLES], [...require("../apps/shop/functions/roles.js").ROLES]);
});

test("someone added in the shop's Settings › Team shows up in the switcher; a second run changes nothing", async () => {
  const w = world();
  await w.shopTeam.save(SHOP, BEA.email, "staff");
  assert.deepEqual(await w.shopsOf(BEA), [], "not before the sync");

  const first = await w.sync.syncShop(SHOP);
  assert.deepEqual(first.added, [{ email: BEA.email, role: "staff" }]);
  assert.deepEqual(await w.shopsOf(BEA), [{ shopId: SHOP, role: "staff" }]);
  assert.deepEqual(w.logged(SHOP), ["member-added-in-shop"]);
  assert.ok([...w.registry.events.get(SHOP).values()].some((e) => e.what === "member-added-in-shop"), "also in the registry");

  w.tick();
  const again = await w.sync.syncShop(SHOP);
  assert.deepEqual([again.added, again.changed, again.removed], [[], [], []]);
  assert.deepEqual(w.logged(SHOP), ["member-added-in-shop"], "nothing logged twice");
});

test("a role changed in the shop is copied, keeping the account the invite recorded", async () => {
  const w = world();
  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "author" });
  await w.accounts.accept(CAL, w.secretOf(CAL.email));
  await w.shopTeam.save(SHOP, CAL.email, "bookkeeper");

  const result = await w.sync.syncShop(SHOP);
  assert.deepEqual(result.changed, [{ email: CAL.email, from: "author", to: "bookkeeper" }]);
  const row = await w.stores.memberships.get(SHOP, CAL.email);
  assert.equal(row.role, "bookkeeper");
  assert.equal(row.accountId, CAL.uid);
  assert.deepEqual(await w.shopsOf(CAL), [{ shopId: SHOP, role: "bookkeeper" }]);
});

test("removed in the shop: gone from the switcher at the next sync", async () => {
  const w = world();
  await w.shopTeam.save(SHOP, BEA.email, "staff");
  await w.sync.syncShop(SHOP);
  await w.shopTeam.remove(SHOP, BEA.email);

  const result = await w.sync.syncShop(SHOP);
  assert.deepEqual(result.removed, [{ email: BEA.email, role: "staff" }]);
  assert.deepEqual(await w.shopsOf(BEA), []);
  assert.deepEqual(w.logged(SHOP), ["member-added-in-shop", "member-removed-in-shop"]);
});

test("removed or changed on the account page: gone from the shop's own list too, and a sync agrees", async () => {
  const w = world();
  await w.shopTeam.save(SHOP, BEA.email, "staff");
  await w.shopTeam.save(SHOP, CAL.email, "staff");
  await w.sync.syncShop(SHOP);

  await w.accounts.remove(OWNER, { shopId: SHOP, email: BEA.email });
  await w.accounts.setRole(OWNER, { shopId: SHOP, email: CAL.email, role: "author" });
  assert.equal(await w.shopData.get(SHOP, `members/${BEA.email}`), null, "the shop's document is deleted");
  assert.equal((await w.shopData.get(SHOP, `members/${CAL.email}`)).role, "author");

  const after = await w.sync.syncShop(SHOP);
  assert.deepEqual([after.added, after.changed, after.removed], [[], [], []]);
  assert.deepEqual(await w.shopsOf(BEA), []);
  assert.deepEqual(await w.shopsOf(CAL), [{ shopId: SHOP, role: "author" }]);
});

test("the owner address, a role the shop doesn't know and a bad address are never copied", async () => {
  const w = world();
  await w.shopTeam.save(SHOP, OWNER.email, "staff");
  await w.shopTeam.save(SHOP, BEA.email, "manager");
  await w.shopTeam.save(SHOP, "not-an-address", "staff");
  const result = await w.sync.syncShop(SHOP);
  assert.deepEqual(result.added, []);
  assert.deepEqual(await w.shopsOf(OWNER), [{ shopId: SHOP, role: "owner" }], "still the owner");
  assert.deepEqual(await w.shopsOf(BEA), []);
});

test("one shop's list never adds, changes or removes anyone on another shop", async () => {
  const w = world();
  await w.shopTeam.save(OTHER, CAL.email, "staff");
  await w.sync.syncShop(OTHER);
  await w.shopTeam.save(SHOP, BEA.email, "owner");

  await w.sync.syncShop(SHOP);
  assert.deepEqual(await w.shopsOf(CAL), [{ shopId: OTHER, role: "staff" }], "the other shop's person is untouched");
  assert.deepEqual(await w.shopsOf(BEA), [{ shopId: SHOP, role: "owner" }]);
  assert.deepEqual(w.logged(OTHER), ["member-added-in-shop"]);
});

test("the shop's door: its own key re-reads its own list; a wrong key or another shop's id does nothing", async () => {
  const w = world();
  await w.shopTeam.save(SHOP, BEA.email, "staff");
  await w.shopTeam.save(OTHER, CAL.email, "staff");
  const call = (shopId, key, body) => handleTeamChanged({ method: "POST", headers: { "X-Shop-Id": shopId, Authorization: `Bearer ${key}` }, body }, { registry: w.registry, teamSync: w.sync });

  assert.equal((await call(OTHER, KEY)).status, 401, "this shop's key can't act for another shop");
  assert.equal((await call("no-such-shop", KEY)).status, 401);
  assert.equal((await handleTeamChanged({ method: "GET", headers: {} }, { registry: w.registry, teamSync: w.sync })).status, 405);
  assert.deepEqual(await w.shopsOf(CAL), []);

  // The body is never read: naming another shop or a person in it changes nothing there.
  const answer = await call(SHOP, KEY, { shopId: OTHER, email: CAL.email, role: "owner" });
  assert.deepEqual(answer, { status: 200, body: { ok: true, added: 1, changed: 0, removed: 0 } });
  assert.deepEqual(await w.shopsOf(BEA), [{ shopId: SHOP, role: "staff" }]);
  assert.deepEqual(await w.shopsOf(CAL), []);
});

test("syncing every live shop: one shop that can't be read doesn't stop the others", async () => {
  const w = world();
  await w.shopTeam.save(OTHER, CAL.email, "staff");
  const list = w.shopData.list;
  w.shopData.list = async (projectId, collection) => {
    if (projectId === SHOP) throw new Error("unreachable");
    return list(projectId, collection);
  };
  const results = await w.sync.syncAll();
  assert.deepEqual(results.map((r) => [r.shopId, r.error ?? r.added.length]), [[SHOP, "unreachable"], [OTHER, 1]]);
});
