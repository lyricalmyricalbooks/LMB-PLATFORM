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
