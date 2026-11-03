// Email from the press's own domain (code plan 6.18) against a pretend Resend: the shop's emails switch to
// orders@<their domain> only after the sending records check out, go back to Colophon's sender if the records break,
// with one notice email, and replies always reach the press.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "./index.js";
import { createOwnDomainSender, ownDomainSender, OWN_EMAIL_PAUSED } from "./ownDomain.js";
import { TEMPLATES } from "./templates.js";
import { fakeResendDomains, fakeResendFetch, fakeSentLog } from "./fakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { platformSettings } from "../settings.js";
import { createDomainService } from "../domains/domains.js";
import { fakeDeploy, fakeEnvFiles, fakeHosting, fakeProfileFiles } from "../domains/fakes.js";
import { domainsBridge } from "../../google/domainBridge.js";

const SHOP = "moth-press";
const DOMAIN = "mothpress.example";

async function setup({ waiting = false } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", replyTo: "hello@mothpress.example", status: "live" });
  const resend = fakeResendFetch();
  const email = createEmailService({ env: { RESEND_API_KEY: "re_test_not_real" }, fetch: resend.fetch, registry, sentLog: fakeSentLog() });
  const resendDomains = fakeResendDomains();
  const auditLog = fakeAuditLog();
  const asked = [];
  const domainsCall = async (op, row, args) => (asked.push([op, args]), waiting ? { waiting: true } : { done: true });
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const sender = createOwnDomainSender({ resendDomains, registry, auditLog, domainsCall, email, now: () => (clock += 1000) });
  const receipt = (n) => email.send(SHOP, { kind: "order-note", to: "reader@example.com", idempotencyKey: `note-${n}`, subject: "Your order", text: "Thanks" });
  const lastFrom = () => resend.requests.at(-1).body.from;
  return { registry, resend, resendDomains, auditLog, asked, sender, receipt, lastFrom };
}

test("the shop's emails switch to orders@ their domain only after the records check out", async () => {
  const t = await setup();
  const first = await t.sender.connect(SHOP, DOMAIN);
  assert.deepEqual(first, { state: "checking", address: null });
  // The records Resend asks for go to the domain service's Allow step.
  assert.equal(t.asked[0][0], "addRecords");
  assert.equal(t.asked[0][1].purpose, "email");
  assert.deepEqual(t.asked[0][1].records.map((r) => r.record), ["SPF", "SPF", "DKIM"]);
  await t.receipt(1);
  assert.equal(t.lastFrom(), '"Moth Press" <notifications@platform.example>');

  t.resendDomains.setStatus(DOMAIN, "verified");
  assert.deepEqual(await t.sender.check(SHOP), { state: "on", address: `orders@${DOMAIN}` });
  await t.receipt(2);
  assert.equal(t.lastFrom(), `"Moth Press" <orders@${DOMAIN}>`);
  // Replies still reach the press.
  assert.deepEqual(t.resend.requests.at(-1).body.reply_to, ["hello@mothpress.example"]);
  // Connecting again adds nothing twice.
  await t.sender.connect(SHOP, DOMAIN);
  assert.equal(t.resendDomains.calls.filter((c) => c[0] === "create").length, 1);
  assert.ok([...t.auditLog.entries.get(SHOP).values()].some((e) => e.kind === "email.own-domain-on"));
});

test("broken records put Colophon's sender back with one notice email, and the own address returns when fixed", async () => {
  const t = await setup();
  await t.sender.connect(SHOP, DOMAIN);
  t.resendDomains.setStatus(DOMAIN, "verified");
  await t.sender.check(SHOP);
  t.resendDomains.setStatus(DOMAIN, "failed");
  assert.deepEqual(await t.sender.check(SHOP), { state: "broken", address: null });
  await t.sender.checkAll();
  await t.sender.check(SHOP);
  const notices = t.resend.requests.filter((r) => r.body.tags.some((tag) => tag.value === OWN_EMAIL_PAUSED));
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0].body.to, ["owner@example.com"]);
  assert.match(notices[0].body.text, /orders@mothpress\.example/);
  await t.receipt(3);
  assert.equal(t.lastFrom(), '"Moth Press" <notifications@platform.example>');
  t.resendDomains.setStatus(DOMAIN, "verified");
  await t.sender.check(SHOP);
  await t.receipt(4);
  assert.equal(t.lastFrom(), `"Moth Press" <orders@${DOMAIN}>`);
});

test("while the domain's Allow step isn't built, the sender keeps checking and never switches on its own", async () => {
  const t = await setup({ waiting: true });
  await t.sender.connect(SHOP, DOMAIN);
  assert.equal((await t.registry.getShop(SHOP)).emailSender.recordsAdded, false);
  assert.equal(ownDomainSender(await t.registry.getShop(SHOP)), null);
  await assert.rejects(t.sender.connect(SHOP, "not a domain"), /isn't a web address/);
});

test("removing the domain takes its records and Resend's domain away; Colophon's sender stays", async () => {
  const t = await setup();
  await t.sender.connect(SHOP, DOMAIN);
  assert.deepEqual(await t.sender.disconnect(SHOP), { removed: true });
  assert.equal(t.resendDomains.domains.size, 0);
  assert.deepEqual(t.asked.at(-1), ["removeRecords", { domain: DOMAIN, purpose: "email" }]);
  assert.deepEqual(await t.sender.disconnect(SHOP), { removed: false });
});

test("the notice email is plain", () => {
  const { text, subject } = TEMPLATES[OWN_EMAIL_PAUSED]({ domain: DOMAIN }, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.match(subject, /Moth Press's emails are coming from Colophon/);
  for (const word of [/\bDNS\b/, /\bTXT\b/, /\bSPF\b/, /DKIM/, /Resend/, /\bkey\b/i, /\bAPI\b/]) assert.ok(!word.test(text), `${word}`);
});

test("an address that changes hands: A removes it, B adds it, A is torn down, and B keeps sending from it", async () => {
  const registry = fakeRegistry();
  for (const id of ["moth-press", "press-two"]) {
    await registry.createShop(id, { shopId: id, projectId: id, pressName: id, ownerEmail: "owner@example.com", status: "live", region: "x" });
  }
  const hosting = fakeHosting();
  const auditLog = fakeAuditLog();
  const domains = createDomainService({ registry, auditLog, hosting, envFiles: fakeEnvFiles(), profileFiles: fakeProfileFiles(), deploy: fakeDeploy(), platformDomain: "platform.example" });
  const resend = fakeResendFetch();
  const email = createEmailService({ env: { RESEND_API_KEY: "re_test_not_real" }, fetch: resend.fetch, registry, sentLog: fakeSentLog() });
  const resendDomains = fakeResendDomains();
  const own = createOwnDomainSender({ resendDomains, registry, auditLog, domainsCall: domainsBridge(domains), email });
  const sendFrom = async (shopId, n) => {
    await email.send(shopId, { kind: "order-note", to: "reader@example.com", idempotencyKey: `n-${shopId}-${n}`, subject: "Order", text: "Thanks" });
    return resend.requests.at(-1).body.from;
  };
  const live = async (shopId) => { await domains.add(shopId, DOMAIN); hosting.set(shopId, DOMAIN, "live"); await domains.check(shopId, DOMAIN); };

  await live("moth-press");
  await own.connect("moth-press", DOMAIN);
  resendDomains.setStatus(DOMAIN, "verified");
  assert.deepEqual(await own.check("moth-press"), { state: "on", address: `orders@${DOMAIN}` });
  await assert.rejects(domains.add("press-two", DOMAIN), /already connected to another shop/);

  // A removes the address: its emails go back to Colophon's sender at once, and the address is free.
  await domains.remove("moth-press", DOMAIN);
  assert.equal((await registry.getShop("moth-press")).emailSender, null);
  assert.match(await sendFrom("moth-press", 1), /notifications@platform\.example/);

  await live("press-two");
  assert.deepEqual(await own.connect("press-two", DOMAIN), { state: "on", address: `orders@${DOMAIN}` });
  // A is torn down: B's sender stays on.
  assert.deepEqual(await own.disconnect("moth-press"), { removed: false });
  assert.deepEqual(await own.check("press-two"), { state: "on", address: `orders@${DOMAIN}` });
  assert.match(await sendFrom("press-two", 1), new RegExp(`orders@${DOMAIN}`));
  assert.equal(resendDomains.domains.size, 1);
});

test("an address held by another shop's sender can't be added, reused or deleted from under it", async () => {
  const t = await setup();
  await t.registry.createShop("press-two", { shopId: "press-two", projectId: "press-two", pressName: "Wasp", status: "live", region: "x" });
  await t.sender.connect(SHOP, DOMAIN);
  const held = (await t.registry.getShop(SHOP)).emailSender;
  await assert.rejects(t.sender.connect("press-two", DOMAIN), /already sends another shop's emails/);
  // The domain service refuses an address another shop still sends from, even when it isn't in that shop's list.
  const domains = createDomainService({ registry: t.registry, auditLog: t.auditLog, hosting: fakeHosting(), envFiles: fakeEnvFiles(), profileFiles: fakeProfileFiles(), deploy: fakeDeploy(), platformDomain: "platform.example" });
  await assert.rejects(domains.add("press-two", DOMAIN), /already connected to another shop/);
  // An older row where both shops point at one Resend domain: tearing one down leaves the other's.
  await t.registry.updateShop("press-two", { emailSender: { ...held } });
  assert.deepEqual(await t.sender.disconnect(SHOP), { removed: true });
  assert.equal(t.resendDomains.domains.size, 1);
  assert.equal(t.resendDomains.calls.filter((c) => c[0] === "remove").length, 0);
});

test("switching to another address takes the old one's records and Resend domain away", async () => {
  const t = await setup();
  await t.sender.connect(SHOP, "old.example");
  await t.sender.connect(SHOP, "new.example");
  assert.deepEqual([...t.resendDomains.domains.keys()], ["new.example"]);
  assert.deepEqual(t.asked.filter(([op]) => op === "removeRecords"), [["removeRecords", { domain: "old.example", purpose: "email" }]]);
  assert.equal((await t.registry.getShop(SHOP)).emailSender.domain, "new.example");
});
