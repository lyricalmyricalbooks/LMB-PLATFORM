// Delete my account (plan 24.2): a person removes their own sign-in and what the platform keeps about them; a shop is
// never left without an owner; a stale session or a slip of the mouse can't do it; every step is safe to repeat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountDeletion, RECENT_SIGN_IN_MINUTES } from "./deleteAccount.js";
import { deletionRoutes } from "./routes.js";
import { fakeAccountStores, fakeAuthUsers, fakeDeviceStore, fakeShopData } from "./fakes.js";
import { createApi } from "../signup/api.js";
import { fakeSignupStores, fakeVerifyIdToken } from "../signup/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { TEMPLATES } from "../services/email/templates.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const signedIn = (who, minutesAgo = 1) => ({ ...who, email_verified: true, auth_time: Math.floor((NOW - minutesAgo * 60_000) / 1000) });
const ADA = { uid: "uid-ada", email: "ada@moth.example" };
const BEA = { uid: "uid-bea", email: "bea@moth.example" };

function world() {
  const registry = fakeRegistry();
  registry.shops.set("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live", ownerEmail: BEA.email });
  registry.shops.set("ada-books", { shopId: "ada-books", pressName: "Ada Books", status: "live", ownerEmail: ADA.email });
  registry.shops.set("old-press", { shopId: "old-press", pressName: "Old Press", status: "closed", ownerEmail: ADA.email });
  const signup = fakeSignupStores();
  signup.accounts.rows.set(ADA.uid, { accountId: ADA.uid, email: ADA.email, shops: { "ada-books": "owner", "old-press": "owner" } });
  signup.signups.rows.set("ada-books", { shopId: "ada-books", accountId: ADA.uid, ownerEmail: ADA.email, ownerName: "Ada", pressName: "Ada Books" });
  signup.signups.rows.set("never-made", { shopId: "never-made", accountId: ADA.uid, ownerEmail: ADA.email, ownerName: "Ada", pressName: "Never Made" });
  const stores = fakeAccountStores();
  stores.memberships.rows.set(`moth-press ${ADA.email}`, { shopId: "moth-press", email: ADA.email, role: "staff" });
  const shopData = fakeShopData();
  shopData.docs.set(`moth-press members/${ADA.email}`, { role: "staff" });
  const devices = fakeDeviceStore();
  devices.rows.set(ADA.uid, { known: ["d1"] });
  const authUsers = fakeAuthUsers([ADA.uid, BEA.uid]);
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const deletion = createAccountDeletion({
    accounts: signup.accounts, memberships: stores.memberships, registry, shopData, auditLog, signups: signup.signups,
    devices, authUsers, email, now: () => new Date(NOW),
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: deletionRoutes(deletion) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { deletion, registry, signup, stores, shopData, devices, authUsers, auditLog, email, ask };
}

test("the only owner of an open shop is stopped, by press name, and nothing is deleted", async () => {
  const w = world();
  const preview = await w.deletion.preview(signedIn(ADA));
  assert.deepEqual(preview.blockers, [{ shopId: "ada-books", pressName: "Ada Books" }]);
  assert.deepEqual(preview.leaving.map((s) => s.shopId).sort(), ["moth-press", "old-press"]);
  await assert.rejects(w.deletion.deleteMe(signedIn(ADA), { confirmEmail: ADA.email }), (e) => e.status === 409 && /only owner of Ada Books/.test(e.message));
  assert.ok(w.authUsers.live.has(ADA.uid));
  assert.ok(w.signup.accounts.rows.has(ADA.uid));
  assert.ok(w.stores.memberships.rows.has(`moth-press ${ADA.email}`));
});

test("once another person owns the shop, everything about the person goes and the rest stays", async () => {
  const w = world();
  w.stores.memberships.rows.set(`ada-books ${BEA.email}`, { shopId: "ada-books", email: BEA.email, role: "owner" });
  w.stores.memberships.rows.set(`ada-books ${ADA.email}`, { shopId: "ada-books", email: ADA.email, role: "owner" });
  w.shopData.docs.set(`ada-books members/${ADA.email}`, { role: "owner" });

  const answer = await w.deletion.deleteMe(signedIn(ADA), { confirmEmail: " ADA@moth.example " });
  assert.equal(answer.deleted, true);
  assert.equal(w.authUsers.live.has(ADA.uid), false);
  assert.ok(w.authUsers.live.has(BEA.uid));
  assert.equal(w.signup.accounts.rows.has(ADA.uid), false);
  assert.equal(w.devices.rows.has(ADA.uid), false);
  for (const shop of ["moth-press", "ada-books"]) {
    assert.equal(w.stores.memberships.rows.has(`${shop} ${ADA.email}`), false, shop);
    assert.equal(w.shopData.docs.has(`${shop} members/${ADA.email}`), false, shop);
  }
  assert.ok(w.stores.memberships.rows.has(`ada-books ${BEA.email}`));
  // A sign-up whose shop exists keeps its row without the person; one never made is gone.
  assert.equal(w.signup.signups.rows.has("never-made"), false);
  assert.deepEqual({ ...w.signup.signups.rows.get("ada-books"), accountDeletedAt: "x" }, { shopId: "ada-books", accountId: ADA.uid, ownerEmail: "", ownerName: "", pressName: "Ada Books", accountDeletedAt: "x" });
  // Each shop's history says who left; the person gets a goodbye note.
  assert.ok([...w.registry.events.get("moth-press").values()].some((e) => e.what === "member-deleted-account" && e.email === ADA.email));
  const notes = w.email.list().filter((m) => m.kind === "account-deleted");
  assert.deepEqual(notes.map((m) => m.to), [ADA.email]);
  // Safe to repeat: a second try (say, after the sign-in step failed) changes nothing more and doesn't throw.
  await w.deletion.deleteMe(signedIn(ADA), { confirmEmail: ADA.email });
});

test("a person on no shop can delete their account", async () => {
  const w = world();
  const loner = { uid: "uid-cal", email: "cal@moth.example" };
  w.authUsers.live.add(loner.uid);
  assert.deepEqual(await w.deletion.preview(signedIn(loner)), { email: loner.email, leaving: [], blockers: [] });
  await w.deletion.deleteMe(signedIn(loner), { confirmEmail: loner.email });
  assert.equal(w.authUsers.live.has(loner.uid), false);
});

test("a shop still being made (its trial started, no shop yet) stops the deletion, so it never opens without an owner", async () => {
  const w = world();
  w.registry.shops.get("ada-books").ownerEmail = BEA.email;
  // Signed up and admitted: the trial began, the shop maker hasn't made the shop's registry row yet.
  w.signup.signups.rows.set("ada-zines", { shopId: "ada-zines", accountId: ADA.uid, ownerEmail: ADA.email, ownerName: "Ada", pressName: "Ada Zines", status: "making", trialStartedAt: "2026-11-03T11:00:00Z" });
  const preview = await w.deletion.preview(signedIn(ADA));
  assert.deepEqual(preview.blockers, [{ shopId: "ada-zines", pressName: "Ada Zines", making: true }]);
  await assert.rejects(w.deletion.deleteMe(signedIn(ADA), { confirmEmail: ADA.email }), (e) => e.status === 409 && /Ada Zines is still being made/.test(e.message));
  assert.ok(w.authUsers.live.has(ADA.uid));
  assert.ok(w.signup.signups.rows.has("ada-zines"));
  // A sign-up whose trial never started (waiting in line, or its country not open) doesn't stop it.
  w.signup.signups.rows.set("ada-zines", { ...w.signup.signups.rows.get("ada-zines"), status: "in-line", trialStartedAt: undefined });
  assert.deepEqual((await w.deletion.preview(signedIn(ADA))).blockers, []);
});

test("a stale sign-in or a wrong confirmation is refused before anything changes", async () => {
  const w = world();
  w.registry.shops.get("ada-books").ownerEmail = BEA.email;
  await assert.rejects(w.deletion.deleteMe(signedIn(ADA, RECENT_SIGN_IN_MINUTES + 1), { confirmEmail: ADA.email }), (e) => e.status === 401 && /sign in again/.test(e.message));
  await assert.rejects(w.deletion.deleteMe({ ...signedIn(ADA), auth_time: undefined }, { confirmEmail: ADA.email }), (e) => e.status === 401);
  await assert.rejects(w.deletion.deleteMe(signedIn(ADA), { confirmEmail: "someone@else.example" }), (e) => e.status === 400);
  await assert.rejects(w.deletion.deleteMe(signedIn(ADA), {}), (e) => e.status === 400);
  assert.ok(w.authUsers.live.has(ADA.uid));
  assert.ok(w.stores.memberships.rows.has(`moth-press ${ADA.email}`));
});

test("the web door: signed in only, and the routes answer in the person's own terms", async () => {
  const w = world();
  w.registry.shops.get("ada-books").ownerEmail = BEA.email;
  const nobody = await w.ask(null, "GET", "/api/accounts/delete-check");
  assert.equal(nobody.status, 401);
  const check = await w.ask(signedIn(ADA), "GET", "/api/accounts/delete-check");
  assert.equal(check.status, 200);
  assert.deepEqual(check.body.blockers, []);
  const done = await w.ask(signedIn(ADA), "POST", "/api/accounts/delete-me", { confirmEmail: ADA.email });
  assert.equal(done.status, 200);
  assert.equal(w.authUsers.live.has(ADA.uid), false);
});

test("the goodbye email names the shops and what is kept, in plain words", () => {
  const settings = platformSettings({});
  const parts = TEMPLATES["account-deleted"]({ shops: ["Moth Press"] }, { settings });
  assert.match(parts.subject, /account is deleted/);
  assert.match(parts.text, /Moth Press/);
  assert.match(parts.text, /six years/);
  assert.doesNotMatch(TEMPLATES["account-deleted"]({}, { settings }).text, /team of/);
});
