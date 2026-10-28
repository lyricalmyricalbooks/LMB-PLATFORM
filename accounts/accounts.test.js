// One account, many shops (code plan 2.7): the shop switcher lists every shop a person belongs to and sends them to
// the right place for their role; owners invite people by email with a role; the shop's own team list is written so
// its rules decide access; every change is logged; and nobody can take a shop's last owner away.
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createAccounts, INVITE_DAYS, ROLES } from "./accounts.js";
import { accountRoutes } from "./routes.js";
import { fakeAccountStores, fakeShopData } from "./fakes.js";
import { createApi } from "../signup/api.js";
import { fakeAuth, fakeSignupStores, fakeVerifyIdToken } from "../signup/fakes.js";
import { createSignup } from "../signup/signup.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { TEMPLATES } from "../services/email/templates.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";

const OWNER = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const BEA = { uid: "uid-bea", email: "bea@example.com", email_verified: true };
const CAL = { uid: "uid-cal", email: "cal@example.com", email_verified: true };
const SHOP = "moth-press";
const OTHER = "press-two";

function world() {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const settings = platformSettings({});
  const registry = fakeRegistry();
  const profile = (shopId, plan) => ({
    shopId, siteUrl: `https://${shopId}.example`, firebase: { projectId: shopId },
    apps: { shop: plan !== "stockroom", stockroom: plan !== "shop" },
  });
  registry.shops.set(SHOP, { shopId: SHOP, pressName: "Moth Press", plan: "both", status: "live", ownerEmail: OWNER.email, billing: { access: "open" } });
  registry.profiles.set(SHOP, profile(SHOP, "both"));
  registry.shops.set(OTHER, { shopId: OTHER, pressName: "Another Press", plan: "shop", status: "live", ownerEmail: BEA.email });
  registry.profiles.set(OTHER, profile(OTHER, "shop"));

  const signupStores = fakeSignupStores();
  signupStores.accounts.rows.set(OWNER.uid, { accountId: OWNER.uid, email: OWNER.email, shops: { [SHOP]: "owner" } });
  signupStores.accounts.rows.set(BEA.uid, { accountId: BEA.uid, email: BEA.email, shops: { [OTHER]: "owner" } });
  const stores = fakeAccountStores();
  const shopData = fakeShopData();
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  let n = 0;
  const accounts = createAccounts({
    accounts: signupStores.accounts, ...stores, registry, shopData, auditLog, email, settings,
    now: () => new Date(clock), token: () => `secret-${(n += 1)}`,
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: accountRoutes(accounts) });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const secretOf = (to) => new URL(email.list().filter((m) => m.to === to).at(-1).data.link).searchParams.get("invite");
  return { accounts, stores, shopData, registry, auditLog, email, ask, secretOf, tick: (days) => { clock += days * 86400_000; } };
}

test("the shop switcher lists every shop with the person's role and sends them to the right place", async () => {
  const w = world();
  await w.accounts.invite(BEA, { shopId: OTHER, email: OWNER.email, role: "author" });
  await w.accounts.accept(OWNER, w.secretOf(OWNER.email));

  const answer = await w.ask(OWNER, "GET", "/api/accounts/shops");
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.shops.map(({ shopId, role, pressName, access }) => ({ shopId, role, pressName, access })), [
    { shopId: OTHER, role: "author", pressName: "Another Press", access: null },
    { shopId: SHOP, role: "owner", pressName: "Moth Press", access: "open" },
  ]);

  const own = await w.ask(OWNER, "POST", "/api/accounts/switch", { shopId: SHOP });
  assert.equal(own.body.url, `https://${SHOP}.example/admin`);
  // An author has no place in the admin. That shop has no stockroom, so there is nowhere to send them yet.
  assert.equal((await w.ask(OWNER, "POST", "/api/accounts/switch", { shopId: OTHER })).status, 409);
  assert.equal((await w.ask(CAL, "POST", "/api/accounts/switch", { shopId: SHOP })).status, 404, "not on the team");
});

test("an author goes to the stockroom, never to the admin", async () => {
  const w = world();
  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "author" });
  await w.accounts.accept(CAL, w.secretOf(CAL.email));
  const { url } = await w.accounts.switchTo(CAL, SHOP);
  assert.equal(url, `https://${SHOP}-stockroom.web.app`);
});

test("an owner invites by email with a role; accepting writes the shop's own team list and logs it", async () => {
  const w = world();
  const sent = await w.ask(OWNER, "POST", "/api/accounts/invite", { shopId: SHOP, email: " Cal@Example.com ", role: "staff" });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.email, CAL.email);

  const [message] = w.email.list();
  assert.equal(message.kind, "invite");
  assert.equal(message.to, CAL.email);
  assert.equal(message.data.days, INVITE_DAYS);
  assert.ok(message.data.link.startsWith(`${platformSettings({}).platformUrl}/accounts/?invite=`));
  const words = TEMPLATES.invite(message.data, { settings: platformSettings({}) });
  assert.match(words.subject, /You're invited to join Moth Press on Colophon/);
  assert.match(words.text, /owner@example\.com invited you to join the team for Moth Press, as staff/);

  // Only the invited address can accept, and only with the right secret.
  assert.equal((await w.ask(BEA, "POST", "/api/accounts/accept", { invite: w.secretOf(CAL.email) })).status, 403);
  assert.equal((await w.ask(CAL, "POST", "/api/accounts/accept", { invite: "made-up" })).status, 404);
  const accepted = await w.ask(CAL, "POST", "/api/accounts/accept", { invite: w.secretOf(CAL.email) });
  assert.deepEqual([accepted.status, accepted.body.shopId, accepted.body.role], [200, SHOP, "staff"]);
  assert.equal((await w.ask(CAL, "POST", "/api/accounts/accept", { invite: w.secretOf(CAL.email) })).status, 200, "accepting twice is fine");

  assert.equal(w.shopData.docs.get(`${SHOP} members/${CAL.email}`).role, "staff");
  assert.equal((await w.stores.memberships.get(SHOP, CAL.email)).accountId, CAL.uid);
  const logged = [...w.registry.events.get(SHOP).values()].map((e) => e.what);
  assert.deepEqual(logged, ["invite-sent", "invite-accepted"]);
  assert.equal(w.auditLog.entries.get(SHOP).size, 2, "the shop's own audit log has the same entries");
  // The invite secret is never stored, only its hash.
  assert.ok(![...w.stores.invites.rows.values()].some((row) => JSON.stringify(row).includes(w.secretOf(CAL.email))));
});

test("only owners manage the team; staff and strangers can't", async () => {
  const w = world();
  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "staff" });
  await w.accounts.accept(CAL, w.secretOf(CAL.email));
  for (const [path, body] of [
    ["/api/accounts/team", { shopId: SHOP }],
    ["/api/accounts/invite", { shopId: SHOP, email: "dee@example.com", role: "owner" }],
    ["/api/accounts/role", { shopId: SHOP, email: CAL.email, role: "owner" }],
    ["/api/accounts/remove", { shopId: SHOP, email: CAL.email }],
  ]) {
    assert.equal((await w.ask(CAL, "POST", path, body)).status, 403, `staff: ${path}`);
    assert.equal((await w.ask(BEA, "POST", path, body)).status, 403, `stranger: ${path}`);
  }
  assert.equal((await w.ask({ uid: "x", email: "x@example.com", email_verified: false }, "GET", "/api/accounts/shops")).status, 403, "an unconfirmed email");
  assert.equal((await w.ask(null, "GET", "/api/accounts/shops")).status, 401);
});

test("invites: bad input is refused in plain words, a second invite replaces the first, and cancelled or old ones don't work", async () => {
  const w = world();
  const bad = await w.ask(OWNER, "POST", "/api/accounts/invite", { shopId: SHOP, email: "not-an-email", role: "staff" });
  assert.deepEqual([bad.status, bad.body.problems.email], [400, "Enter the email address to invite."]);
  assert.equal((await w.ask(OWNER, "POST", "/api/accounts/invite", { shopId: SHOP, email: CAL.email, role: "boss" })).status, 400);
  assert.equal((await w.ask(OWNER, "POST", "/api/accounts/invite", { shopId: SHOP, email: OWNER.email, role: "staff" })).status, 409, "the shop's own owner");

  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "staff" });
  const first = w.secretOf(CAL.email);
  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "author" });
  const second = w.secretOf(CAL.email);
  const team = await w.accounts.team(OWNER, SHOP);
  assert.deepEqual(team.invites.map((i) => [i.email, i.role]), [[CAL.email, "author"]], "one open invite per address");
  await assert.rejects(w.accounts.accept(CAL, first), { status: 410 });

  await w.accounts.cancelInvite(OWNER, { shopId: SHOP, id: team.invites[0].id });
  await assert.rejects(w.accounts.accept(CAL, second), { status: 410 });

  await w.accounts.invite(OWNER, { shopId: SHOP, email: BEA.email, role: "staff" });
  w.tick(INVITE_DAYS + 1);
  await assert.rejects(w.accounts.accept(BEA, w.secretOf(BEA.email)), { status: 410 });
  assert.equal((await w.accounts.team(OWNER, SHOP)).invites.length, 0);
  assert.equal(w.shopData.docs.size, 0, "nothing reached the shop's team list");
});

test("roles change and people leave, but a shop always keeps an owner", async () => {
  const w = world();
  w.registry.shops.set(SHOP, { ...w.registry.shops.get(SHOP), ownerEmail: undefined });
  // Without a sign-up owner on file, the only owner is a member.
  await w.stores.memberships.set(SHOP, OWNER.email, { shopId: SHOP, email: OWNER.email, accountId: OWNER.uid, role: "owner" });
  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "staff" });
  await w.accounts.accept(CAL, w.secretOf(CAL.email));

  await assert.rejects(w.accounts.setRole(OWNER, { shopId: SHOP, email: OWNER.email, role: "staff" }), { status: 409 });
  await assert.rejects(w.accounts.remove(OWNER, { shopId: SHOP, email: OWNER.email }), { status: 409 });

  const promoted = await w.ask(OWNER, "POST", "/api/accounts/role", { shopId: SHOP, email: CAL.email, role: "owner" });
  assert.deepEqual([promoted.status, promoted.body.changed], [200, true]);
  assert.equal(w.shopData.docs.get(`${SHOP} members/${CAL.email}`).role, "owner");
  // Now there are two owners, so the first can step down.
  await w.accounts.setRole(CAL, { shopId: SHOP, email: OWNER.email, role: "staff" });
  const removed = await w.ask(CAL, "POST", "/api/accounts/remove", { shopId: SHOP, email: OWNER.email });
  assert.equal(removed.status, 200);
  assert.equal(await w.stores.memberships.get(SHOP, OWNER.email), null);
  assert.equal(w.shopData.docs.has(`${SHOP} members/${OWNER.email}`), false, "taken off the shop's own team list too");
  assert.equal((await w.ask(OWNER, "POST", "/api/accounts/switch", { shopId: SHOP })).status, 404);
  assert.deepEqual((await w.accounts.myShops(OWNER)).shops, [], "the account's old list of shops gives no role");
  const logged = [...w.registry.events.get(SHOP).values()].map((e) => e.what);
  assert.deepEqual(logged.slice(-3), ["role-changed", "role-changed", "member-removed"]);
  assert.deepEqual(ROLES, ["owner", "staff", "author"]);
});

test("the team list shows the shop's sign-up owner, members and open invites", async () => {
  const w = world();
  await w.accounts.invite(OWNER, { shopId: SHOP, email: CAL.email, role: "staff" });
  await w.accounts.accept(CAL, w.secretOf(CAL.email));
  await w.accounts.invite(OWNER, { shopId: SHOP, email: "dee@example.com", role: "author" });
  const answer = await w.ask(OWNER, "POST", "/api/accounts/team", { shopId: SHOP });
  assert.deepEqual(answer.body.members.map((m) => [m.email, m.role]), [[OWNER.email, "owner"], [CAL.email, "staff"]]);
  assert.deepEqual(answer.body.invites.map((i) => [i.email, i.role]), [["dee@example.com", "author"]]);
  assert.equal(JSON.stringify(answer.body).includes("tokenHash"), false);
});

test("a sign-in link can bring the person back to the account page (an invite), and nowhere else", async () => {
  const settings = platformSettings({});
  const email = fakePlatformEmail();
  let clock = 0;
  const signup = createSignup({ ...fakeSignupStores(), registry: fakeRegistry(), billing: {}, email, auth: fakeAuth(), settings, now: () => new Date(Date.parse("2026-10-28T12:00:00Z") + (clock += 1000)) });
  await signup.sendSignInLink({ email: CAL.email, page: "accounts" });
  await signup.sendSignInLink({ email: CAL.email, page: "https://elsewhere.example/" });
  await signup.sendSignInLink({ email: CAL.email });
  const links = email.list().map((m) => m.data.link);
  assert.ok(links[0].startsWith(`${settings.platformUrl}/accounts/?finish=1`));
  assert.ok(links[1].startsWith(`${settings.platformUrl}/signup/?finish=1`));
  assert.ok(links[2].startsWith(`${settings.platformUrl}/signup/?finish=1`));
});

test("the page: one sign-in, every shop, owners manage the team; built without markup from strings, no rival named", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(page, /Continue with Google/);
  assert.match(page, /Invite someone/);
  assert.match(app, /page: "accounts"/, "an emailed sign-in link comes back here");
  for (const path of Object.keys(accountRoutes({}))) {
    const [method, route] = path.split(" ");
    assert.ok(app.includes(`"${route.replace("/api", "")}"`), `the page calls ${method} ${route}`);
  }
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/, "names and emails are shown as text only");
  assert.doesNotMatch(app, /node:/, "the page loads nothing made for Node");
  const words = (page + app).toLowerCase();
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) assert.ok(!words.includes(rival), rival);
});
