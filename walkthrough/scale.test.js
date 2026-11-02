// Phase 19 rows 19.14 to 19.16 on the whole platform (walkthrough/world.js): a new shop gets the control room's message
// in its admin and its owner the important email, the Costs page waits for the billing export, and the owner downloads
// all the shop's data from the account page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY, adminClaims, person, platformWorld } from "./world.js";
import { PUBLISHES, QUESTION } from "../signup/form.js";
import { TERMS_VERSION } from "../terms/terms.js";
import { COSTS_EMPTY } from "../control-room/costs.js";
import { readZip } from "../services/export/files.js";

const ADA = person("uid-ada", "owner@example.com", "Ada");

async function liveShop() {
  const w = platformWorld({ suffix: () => "k3f9q" });
  const signed = await w.ask(ADA, "POST", "/api/signup", { pressName: "Moth Press", plan: "both", country: "CA", [QUESTION.id]: "fairs", [PUBLISHES.id]: "zines", termsAccepted: true, termsVersion: TERMS_VERSION });
  assert.equal(signed.status, 200);
  assert.deepEqual(await w.shopMaker.sweep(), [{ shopId: signed.body.shopId, status: "ready" }]);
  return { w, shopId: signed.body.shopId };
}

test("a message from the control room reaches the new shop's admin and, when important, its owner's inbox once", async () => {
  const { w, shopId } = await liveShop();
  const admin = adminClaims(w.clock);
  const added = await w.ask(admin, "POST", "/api/control/messages/add", {
    words: "Card payments pause tonight from 1 to 2 am.", level: "important", audience: { plan: "both" },
    endsAt: new Date(w.clock.ms() + 2 * DAY).toISOString(), reason: "the payment provider's upkeep tonight",
  });
  assert.equal(added.status, 200, added.body.message);
  assert.equal(w.doc(shopId, "platform/messages").messages[0].words, "Card payments pause tonight from 1 to 2 am.");
  const emails = () => w.email.list().filter((m) => m.kind === "press-message");
  assert.equal(emails().length, 1);
  assert.equal(emails()[0].to, "owner@example.com");
  // The real template writes it into the practice inbox, with the way into the shop's admin.
  assert.ok(w.email.inbox.all().some((m) => /A message from/.test(m.subject) && /admin/.test(m.text)));
  await w.pressMessages.sweep();
  assert.equal(emails().length, 1);
  assert.equal((await w.ask(admin, "GET", "/api/control/messages")).body.messages[0].reaches, 1);
  // Ended: the admin's banner goes.
  await w.ask(admin, "POST", "/api/control/messages/end", { id: added.body.message.id, reason: "upkeep moved to next week" });
  assert.deepEqual(w.doc(shopId, "platform/messages").messages, []);
});

test("the Costs page says plainly that it waits for the billing export", async () => {
  const { w } = await liveShop();
  const costs = (await w.ask(adminClaims(w.clock), "GET", "/api/control/costs")).body;
  assert.equal(costs.configured, false);
  assert.equal(costs.empty, COSTS_EMPTY);
});

test("the owner downloads all the shop's data from the account page, once a day", async () => {
  const { w, shopId } = await liveShop();
  const asked = await w.ask(ADA, "POST", "/api/account/export", { shopId });
  assert.equal(asked.status, 200, asked.body.message);
  const [sent] = w.email.list().filter((m) => m.kind === "data-export-ready");
  assert.equal(sent.to, "owner@example.com");
  const zipPath = [...w.exportStorage.files.keys()].find((p) => p.endsWith(".zip"));
  const names = readZip(w.exportStorage.files.get(zipPath).content).map((f) => f.name);
  for (const name of ["books.csv", "orders.csv", "customers.csv", "settings.json", "stockroom-ledger.csv", "README.txt"]) assert.ok(names.includes(name), name);
  assert.ok(w.exportStorage.open(sent.data.link, w.clock.ms()));
  assert.equal((await w.ask(ADA, "POST", "/api/account/export", { shopId })).status, 429);
  assert.equal((await w.ask(person("uid-eve", "eve@example.com"), "POST", "/api/account/export", { shopId })).status, 403);
});
