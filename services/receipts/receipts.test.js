import test from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";
import { DAILY_LIMIT, bestFile, createReceiptMail, hasReceiptMail, receiptAddress } from "./index.js";
import { GMAIL_MODIFY_SCOPE, forwardingConfirmation, parseMessage, plainFromHtml } from "./mailbox.js";
import { fakeReceiptGmail, gmailMessage } from "./fakes.js";

const ENV = { RECEIPT_MAIL: "on", GMAIL_ACCOUNT: "platform-mail@lmb-platform-prod.iam.gserviceaccount.com", PLATFORM_DOMAIN: "colophon.example" };
const KEY = { moth: "moth-press-service-key-0123456789abcdef", fern: "fern-goods-service-key-0123456789abcdef" };
const PDF = { name: "invoice-118.pdf", type: "application/pdf", bytes: Buffer.from("%PDF-1.4 pretend invoice") };

async function build({ env = ENV, messages = [] } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", status: "live", serviceKeyHash: hashServiceKey(KEY.moth) });
  await registry.createShop("fern-goods", { shopId: "fern-goods", status: "live", serviceKeyHash: hashServiceKey(KEY.fern) });
  const google = fakeReceiptGmail(messages);
  const written = [];
  const auditLog = { ready: async () => true, write: async (shopId, id, entry) => void written.push({ shopId, ...entry }) };
  let n = 0;
  const receipts = createReceiptMail({ env, fetch: google.fetch, token: async () => "server-token", registry, auditLog, random: (max) => (n++ * 7) % max, now: () => new Date("2026-11-12T16:00:00Z") });
  const call = (shop, op, args = {}, key = KEY[shop === "moth-press" ? "moth" : "fern"]) =>
    receipts.shopCall({ headers: { "X-Shop-Id": shop, Authorization: `Bearer ${key}` }, body: { op, args } });
  return { registry, google, receipts, call, written };
}

test("off until RECEIPT_MAIL is on: every shop sees it as not open yet and nothing is made", async () => {
  assert.equal(hasReceiptMail({}), false);
  const { call, registry } = await build({ env: { ...ENV, RECEIPT_MAIL: "" } });
  assert.deepEqual(await call("moth-press", "receipts.status"), { available: false, on: false, address: "" });
  await assert.rejects(call("moth-press", "receipts.start"), /isn't open yet/);
  assert.equal((await registry.getShop("moth-press")).receiptMail, undefined);
});

test("start gives the shop its own address once, records it, and a second start changes nothing", async () => {
  const { call, written } = await build();
  assert.deepEqual(await call("moth-press", "receipts.status"), { available: true, on: false, address: "" });
  const first = await call("moth-press", "receipts.start", { by: "owner@example.com" });
  assert.equal(first.on, true);
  assert.match(first.address, /^receipts\+moth-press\.[a-z2-9]{8}@colophon\.example$/);
  assert.deepEqual(await call("moth-press", "receipts.start", { by: "owner@example.com" }), first);
  assert.deepEqual(written.map((e) => [e.shopId, e.kind, e.by]), [["moth-press", "receipt-mail-on", "owner@example.com"]]);
  // Turned off and on again: the same address, so forwarding the owner already set up keeps working.
  assert.equal((await call("moth-press", "receipts.stop")).on, false);
  assert.equal((await call("moth-press", "receipts.start")).address, first.address);
});

test("the door refuses a wrong key, an unknown shop and an unknown call with one plain answer", async () => {
  const { call } = await build();
  await assert.rejects(call("moth-press", "receipts.status", {}, KEY.fern), /can't reach its receipts/);
  await assert.rejects(call("no-such-shop", "receipts.status", {}, KEY.moth), /can't reach its receipts/);
  await assert.rejects(call("moth-press", "receipts.everything"), /Unknown call/);
});

test("a shop is handed only the mail sent to its own address, with the receipt's file", async () => {
  const world = await build();
  const moth = (await world.call("moth-press", "receipts.start")).address;
  const fern = (await world.call("fern-goods", "receipts.start")).address;
  assert.notEqual(moth.split("@")[0].split(".")[1], fern.split("@")[0].split(".")[1]);
  world.google.add(gmailMessage({ id: "msg-moth-000001", to: moth, subject: "Invoice 118", text: "Total $42.50", files: [PDF] }));
  world.google.add(gmailMessage({ id: "msg-fern-000001", to: fern, subject: "Fern's bill", text: "Total $9.00" }));
  world.google.add(gmailMessage({ id: "msg-other-00001", to: "notifications@colophon.example", subject: "A reply" }));
  const pulled = await world.call("moth-press", "receipts.pull", { have: [] });
  assert.deepEqual(pulled.emails.map((e) => [e.id, e.subject, e.text.trim()]), [["msg-moth-000001", "Invoice 118", "Total $42.50"]]);
  assert.deepEqual(pulled.emails[0].file, { name: "invoice-118.pdf", type: "application/pdf", data: PDF.bytes.toString("base64") });
  assert.equal(pulled.more, false);
  // What the shop already holds isn't sent again.
  assert.deepEqual((await world.call("moth-press", "receipts.pull", { have: ["msg-moth-000001"] })).emails, []);
  assert.deepEqual(world.google.scopes, [GMAIL_MODIFY_SCOPE]);
});

test("the wall is the message's own headers: a search hit addressed to another shop is never handed over, opened or binned", async () => {
  const world = await build();
  const moth = (await world.call("moth-press", "receipts.start")).address;
  const fern = (await world.call("fern-goods", "receipts.start")).address;
  // The words of this message mention moth's address, so a loose search finds it, but it was sent to fern.
  world.google.add(gmailMessage({ id: "msg-fern-000002", to: fern, subject: `Fwd to ${moth}`, text: "Total $9.00", files: [PDF], headers: { "X-Note": `deliveredto ${moth}` } }));
  assert.deepEqual((await world.call("moth-press", "receipts.pull", { have: [] })).emails, []);
  await assert.rejects(world.call("moth-press", "receipts.file", { id: "msg-fern-000002" }), /no longer in the receipts mailbox/);
  assert.deepEqual(await world.call("moth-press", "receipts.done", { ids: ["msg-fern-000002"] }), { done: 0 });
  assert.equal(world.google.box.has("msg-fern-000002"), true);
  assert.equal((await world.call("fern-goods", "receipts.pull", { have: [] })).emails.length, 1);
});

test("done bins the shop's own message; file gives the receipt again for the save", async () => {
  const world = await build();
  const moth = (await world.call("moth-press", "receipts.start")).address;
  world.google.add(gmailMessage({ id: "msg-moth-000003", to: moth, files: [PDF] }));
  assert.equal((await world.call("moth-press", "receipts.file", { id: "msg-moth-000003" })).file.name, "invoice-118.pdf");
  assert.deepEqual(await world.call("moth-press", "receipts.done", { ids: ["msg-moth-000003", "../../etc"] }), { done: 1 });
  assert.deepEqual(world.google.binned, ["msg-moth-000003"]);
  // Run again: already gone, nothing breaks.
  assert.deepEqual(await world.call("moth-press", "receipts.done", { ids: ["msg-moth-000003"] }), { done: 0 });
});

test("a new address stops the old one at once", async () => {
  const world = await build();
  const old = (await world.call("moth-press", "receipts.start")).address;
  world.google.add(gmailMessage({ id: "msg-moth-000004", to: old }));
  const next = (await world.call("moth-press", "receipts.newAddress", { by: "owner@example.com" })).address;
  assert.notEqual(next, old);
  assert.deepEqual((await world.call("moth-press", "receipts.pull", { have: [] })).emails, []);
  world.google.add(gmailMessage({ id: "msg-moth-000005", to: next }));
  assert.deepEqual((await world.call("moth-press", "receipts.pull", { have: [] })).emails.map((e) => e.id), ["msg-moth-000005"]);
});

test("a shop that turned it off is handed nothing; mail in spam is found; three at a time, with more to come", async () => {
  const world = await build();
  const moth = (await world.call("moth-press", "receipts.start")).address;
  for (let i = 1; i <= 4; i += 1) world.google.add(gmailMessage({ id: `msg-moth-00001${i}`, to: moth, labels: i === 4 ? ["SPAM"] : ["INBOX"] }));
  const first = await world.call("moth-press", "receipts.pull", { have: [] });
  assert.equal(first.emails.length, 3);
  assert.equal(first.more, true);
  const second = await world.call("moth-press", "receipts.pull", { have: first.emails.map((e) => e.id) });
  assert.deepEqual(second.emails.map((e) => e.id), ["msg-moth-000014"]);
  assert.equal((await world.registry.getShop("moth-press")).receiptMail.handed, 4);
  await world.call("moth-press", "receipts.stop");
  assert.deepEqual(await world.call("moth-press", "receipts.pull", { have: [] }), { emails: [], more: false });
});

test("a day's limit stops a flood sent to one shop's address", async () => {
  const world = await build();
  const moth = (await world.call("moth-press", "receipts.start")).address;
  const row = await world.registry.getShop("moth-press");
  await world.registry.updateShop("moth-press", { receiptMail: { ...row.receiptMail, day: "2026-11-12", handed: DAILY_LIMIT } });
  world.google.add(gmailMessage({ id: "msg-moth-000020", to: moth }));
  assert.deepEqual(await world.call("moth-press", "receipts.pull", { have: [] }), { emails: [], more: false });
});

test("Gmail's forwarding check is recognised and its code handed over", async () => {
  const world = await build();
  const moth = (await world.call("moth-press", "receipts.start")).address;
  world.google.add(gmailMessage({ id: "msg-moth-000030", to: moth, from: "Gmail Team <forwarding-noreply@google.com>", subject: "(#481516234) Gmail Forwarding Confirmation - Receive Mail from owner@example.com", text: "owner@example.com has requested to automatically forward mail" }));
  const [email] = (await world.call("moth-press", "receipts.pull", { have: [] })).emails;
  assert.deepEqual(email.confirm, { code: "481516234", from: "owner@example.com" });
  assert.equal(forwardingConfirmation({ from: "someone@example.com", subject: "(#481516234) Gmail Forwarding Confirmation", text: "" }), null);
});

test("reading a message: a web email becomes plain words, a forwarded one names where it was forwarded to", () => {
  assert.equal(plainFromHtml("<style>p{}</style><p>Thanks &amp; welcome</p><table><tr><td>Total</td><td>$12.00</td></tr></table>"), "Thanks & welcome\nTotal $12.00");
  const parsed = parseMessage(gmailMessage({ id: "m1", to: "someone@else.example", html: "<p>Total <b>$12.00</b></p>", headers: { "X-Forwarded-To": "receipts+moth-press.abcdefgh@colophon.example" } }));
  assert.equal(parsed.text, "Total $12.00");
  assert.ok(parsed.addressedTo.includes("receipts+moth-press.abcdefgh@colophon.example"));
  assert.equal(parsed.receivedAt, "2026-11-12T15:00:00.000Z");
});

test("the receipt's file: a PDF before a photo, and a small logo is never taken for the receipt", () => {
  const logo = { name: "logo.png", type: "image/png", size: 4_000 };
  const photo = { name: "IMG_2041.jpg", type: "image/jpeg", size: 900_000 };
  assert.equal(bestFile([logo]), null);
  assert.equal(bestFile([logo, photo]), photo);
  assert.equal(bestFile([photo, { name: "bill.pdf", type: "application/pdf", size: 30_000 }]).name, "bill.pdf");
  assert.equal(receiptAddress("receipts@colophon.example", "moth-press", "not a code"), "");
});
