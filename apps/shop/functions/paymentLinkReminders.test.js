// Code plan 21.5: one reminder email two days before an unpaid payment link closes.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { reminderDue, sendLinkReminders, keyHash } = require("./paymentLinks.js");

const DAY = 86400000;
const NOW = Date.parse("2026-11-10T12:00:00Z");
const iso = ms => new Date(ms).toISOString();

const order = (patch = {}) => ({
  id: "A1", orderId: "A1", source: "payment_link", paymentStatus: "unpaid", status: "pending_payment", total: 112.5,
  trackingKey: "k".repeat(64), customer: { name: "Robin", email: "robin@example.com" },
  createdAt: iso(NOW - 28 * DAY), paymentLink: { expiresAt: iso(NOW + 1.5 * DAY) }, ...patch,
});
const linkFor = (o, patch = {}) => ({ status: "open", keyHash: keyHash(o.trackingKey), expiresAt: o.paymentLink.expiresAt, ...patch });

function fakeDb(links) {
  const writes = [];
  return {
    writes,
    collection: name => ({
      doc: id => ({
        get: async () => ({ exists: name === "paymentLinks" && id in links, data: () => links[id] }),
        set: async (data, opts) => { writes.push({ name, id, data, opts }); links[id] = { ...links[id], ...data }; },
      }),
    }),
  };
}

async function run(orders, links, patch = {}) {
  const db = fakeDb(links);
  const sent = [];
  const compiled = [];
  const result = await sendLinkReminders({
    db, orders, now: NOW, settings: { payment_link_reminder: { enabled: true } }, moneyFmt: n => `$${n.toFixed(2)}`, secret: "s",
    compileEmailTemplate: (id, _settings, vars) => { compiled.push({ id, vars }); return { subject: `Pay ${vars.order_id}`, html: "<p>x</p>" }; },
    orderTrackUrl: async id => `https://shop.example/track?orderId=${id}&key=k`,
    sendOrderEmailOnce: async (id, kind, message) => { sent.push({ id, kind, ...message }); },
    ...patch,
  });
  return { result, sent, compiled, db };
}

describe("payment link reminders", () => {
  it("is due only for an unpaid, open link order with two days or less left that is at least a day old", () => {
    expect(reminderDue(order(), NOW)).toBe(true);
    expect(reminderDue(order({ paymentLink: { expiresAt: iso(NOW + 3 * DAY) } }), NOW)).toBe(false);
    expect(reminderDue(order({ paymentLink: { expiresAt: iso(NOW - 1000) } }), NOW)).toBe(false);
    expect(reminderDue(order({ createdAt: iso(NOW - 12 * 3600000) }), NOW)).toBe(false);
    expect(reminderDue(order({ paymentStatus: "paid" }), NOW)).toBe(false);
    expect(reminderDue(order({ status: "cancelled" }), NOW)).toBe(false);
    expect(reminderDue(order({ source: "checkout" }), NOW)).toBe(false);
    expect(reminderDue(order({ customer: { name: "R", email: "a@b.com, c@d.com" } }), NOW)).toBe(false);
  });

  // Closes at midnight UTC on the 12th, which is the evening of the 11th in Toronto.
  it("sends one email with the total, closing day and pay link, and stamps the link record", async () => {
    const o = order();
    const { result, sent, compiled, db } = await run([o], { A1: linkFor(o) });
    expect(result.sent).toBe(1);
    expect(sent).toEqual([expect.objectContaining({ id: "A1", kind: "payment_link_reminder", to: "robin@example.com", subject: "Pay A1" })]);
    expect(compiled[0]).toMatchObject({ id: "payment_link_reminder", vars: { customer_name: "Robin", total_price: "$112.50", expires_on: "November 11, 2026" } });
    expect(compiled[0].vars.button_url).toMatch(/^https:\/\/shop\.example\/track\?orderId=A1/);
    expect(db.writes).toEqual([expect.objectContaining({ name: "paymentLinks", id: "A1", data: { reminderSentAt: iso(NOW) } })]);
  });

  it("never sends twice, for a closed or another order's link, or when switched off", async () => {
    const o = order();
    expect((await run([o], { A1: linkFor(o, { reminderSentAt: iso(NOW - DAY) }) })).sent).toEqual([]);
    expect((await run([o], { A1: linkFor(o, { status: "closed" }) })).sent).toEqual([]);
    expect((await run([o], { A1: linkFor(o, { keyHash: keyHash("other") }) })).sent).toEqual([]);
    expect((await run([o], {})).sent).toEqual([]);
    expect((await run([o], { A1: linkFor(o) }, { settings: { payment_link_reminder: { enabled: false } } })).sent).toEqual([]);
  });

  it("stamps a reminder parked in the email queue, and leaves a failed one to try again", async () => {
    const o = order();
    const queued = await run([o], { A1: linkFor(o) }, { sendOrderEmailOnce: async () => { throw Object.assign(new Error("down"), { queued: "q1" }); } });
    expect(queued.db.writes.map(w => w.data)).toEqual([{ reminderSentAt: iso(NOW) }]);
    const failed = await run([o], { A1: linkFor(o) }, { sendOrderEmailOnce: async () => { throw new Error("down"); } });
    expect(failed.result.sent).toBe(0);
    expect(failed.db.writes).toEqual([]);
  });
});
