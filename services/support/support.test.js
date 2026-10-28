// The support inbox (plan 4.4): presses ask from their account page, the platform team answers from the control room,
// every message is kept and every answer is emailed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { fakePlatformEmail } from "../billing/fakes.js";
import { TEMPLATES } from "../email/templates.js";
import { platformSettings } from "../settings.js";
import { fakeRegistry } from "../../setup/fakes.js";
import { fakeSupportStore } from "./fakes.js";
import { MAX_OPEN_PER_DAY, createSupportInbox } from "./inbox.js";
import { supportRoutes } from "./routes.js";

const ADA = { uid: "uid-ada", email: "Ada@Moth.example", email_verified: true };
const BEA = { uid: "uid-bea", email: "bea@example.com", email_verified: true };
const ADMIN = { uid: "uid-admin", email: "team@platform.example", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(Date.now() / 1000) };
const settings = platformSettings({});

function world() {
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const registry = fakeRegistry();
  registry.shops.set("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live" });
  const roles = { "ada@moth.example moth-press": "owner" };
  const store = fakeSupportStore();
  const email = fakePlatformEmail();
  let n = 0;
  const inbox = createSupportInbox({
    store, email, registry, settings, admins: ["team@platform.example"],
    roleIn: async (person, shopId) => roles[`${person.email} ${shopId}`] ?? null,
    now: () => new Date(clock), newId: () => `ticket${(n += 1)}`,
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: supportRoutes(inbox) });
  const ask = async (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { store, email, ask, tick: (minutes) => { clock += minutes * 60_000; } };
}

test("a press opens a request; they get a copy and the team is told", async () => {
  const { ask, email, store } = world();
  const res = await ask(ADA, "POST", "/api/support/open", { subject: "  Can't   add a book ", body: "The Save button does nothing.", shopId: "moth-press", requestId: "req-00000001" });
  assert.equal(res.status, 200);
  const { ticket } = res.body;
  assert.equal(ticket.subject, "Can't add a book");
  assert.equal(ticket.pressName, "Moth Press");
  assert.deepEqual(ticket.messages.map((m) => m.from), ["you"]);
  assert.equal(store.tickets.get(ticket.id).email, "ada@moth.example");
  assert.deepEqual(email.list().map((m) => [m.kind, m.to]), [["support-received", "ada@moth.example"], ["support-new", settings.supportEmail]]);

  const again = await ask(ADA, "POST", "/api/support/open", { subject: "Can't add a book", body: "The Save button does nothing.", shopId: "moth-press", requestId: "req-00000001" });
  assert.equal(again.body.ticket.id, ticket.id, "pressing Send twice makes one request");
  assert.equal(store.tickets.size, 1);
  assert.equal(email.list().length, 2);
});

test("nobody files in another press's name, and the form's words are checked", async () => {
  const { ask } = world();
  const other = await ask(BEA, "POST", "/api/support/open", { subject: "Hi", body: "Help with Moth Press please", shopId: "moth-press" });
  assert.equal(other.status, 403);
  const empty = await ask(ADA, "POST", "/api/support/open", { subject: "", body: "short" });
  assert.equal(empty.status, 400);
  assert.deepEqual(Object.keys(empty.body.problems), ["subject", "body"]);
  const unconfirmed = await ask({ ...ADA, email_verified: false }, "POST", "/api/support/open", { subject: "Hi", body: "A real question here" });
  assert.equal(unconfirmed.status, 403);
  const noShop = await ask(BEA, "POST", "/api/support/open", { subject: "Before I sign up", body: "Can I sell prints too?" });
  assert.equal(noShop.status, 200, "a request needn't name a shop");
  assert.equal(noShop.body.ticket.shopId, null);
});

test("a person can't open more than the daily number of requests", async () => {
  const { ask } = world();
  for (let i = 0; i < MAX_OPEN_PER_DAY; i++) assert.equal((await ask(BEA, "POST", "/api/support/open", { subject: `Q${i}`, body: "Another question for you" })).status, 200);
  const over = await ask(BEA, "POST", "/api/support/open", { subject: "One more", body: "Another question for you" });
  assert.equal(over.status, 429);
  assert.match(over.body.message, /Add to one you've already sent/);
});

test("the team lists, answers and closes; the press gets the answer by email and sees it", async () => {
  const { ask, email, tick } = world();
  const { ticket } = (await ask(ADA, "POST", "/api/support/open", { subject: "Stock count", body: "My counts look wrong after a fair." })).body;
  assert.equal((await ask(ADA, "POST", "/api/control/support", {})).status, 403, "a press can't see the inbox");
  const list = await ask(ADMIN, "POST", "/api/control/support", { status: "open" });
  assert.deepEqual(list.body.tickets.map((t) => [t.id, t.email]), [[ticket.id, "ada@moth.example"]]);

  tick(30);
  const answered = await ask(ADMIN, "POST", "/api/control/support/answer", { id: ticket.id, body: "We've fixed the counts; have a look now." });
  assert.equal(answered.body.ticket.status, "answered");
  const reply = email.list().at(-1);
  assert.deepEqual([reply.kind, reply.to], ["support-reply", "ada@moth.example"]);
  const words = TEMPLATES["support-reply"](reply.data, { settings, pressName: "" });
  assert.equal(words.subject, "Re: Stock count");
  assert.match(words.text, /We've fixed the counts/);

  const mine = await ask(ADA, "GET", "/api/support/mine");
  assert.deepEqual(mine.body.tickets[0].messages.map((m) => m.from), ["you", "support"]);
  assert.doesNotMatch(JSON.stringify(mine.body), /team@platform\.example/, "the press never sees which admin answered");

  const more = await ask(ADA, "POST", "/api/support/add", { id: ticket.id, body: "Thanks! One more count is off." });
  assert.equal(more.body.ticket.status, "open", "adding to an answered request opens it again");
  assert.equal(email.list().at(-1).data.followUp, true);
  assert.equal((await ask(BEA, "POST", "/api/support/add", { id: ticket.id, body: "Let me in on this one" })).status, 404, "only the asker adds to it");

  const closed = await ask(ADMIN, "POST", "/api/control/support/close", { id: ticket.id });
  assert.equal(closed.body.ticket.status, "closed");
  assert.equal((await ask(ADMIN, "POST", "/api/control/support/close", { id: "nope000000" })).status, 404);
});

test("the support emails say what they should", () => {
  const data = { pressName: "Moth Press", ticketId: "abc123", subject: "Stock", body: "Counts are off <b>today</b>", from: "ada@moth.example" };
  const received = TEMPLATES["support-received"](data, { settings, pressName: "Moth Press" });
  assert.equal(received.subject, "We have your request: Stock");
  assert.match(received.html, /Counts are off &lt;b&gt;today&lt;\/b&gt;/);
  const fresh = TEMPLATES["support-new"](data, { settings, pressName: "Moth Press" });
  assert.equal(fresh.subject, "New request abc123: Stock");
  assert.match(fresh.text, /From ada@moth\.example \(Moth Press\)/);
  assert.equal(TEMPLATES["support-new"]({ ...data, followUp: true }, { settings, pressName: "" }).subject, "More on abc123: Stock");
});
