// Orders › New order to pay: the shop emails the payment link itself (Send by email on the order page).
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { sendLinkEmail, keyHash, RESEND_GAP_MS } = require("./paymentLinks.js");

const DAY = 86400000;
const NOW = Date.parse("2026-11-10T12:00:00Z");
const iso = ms => new Date(ms).toISOString();

const order = (patch = {}) => ({
  id: "A1", orderId: "A1", source: "payment_link", paymentStatus: "unpaid", status: "pending_payment", total: 112.5,
  trackingKey: "k".repeat(64), customer: { name: "Robin", email: "robin@example.com" },
  paymentLink: { expiresAt: iso(NOW + 10 * DAY), note: "Ten tees." }, ...patch,
});
const linkFor = (o, patch = {}) => ({ status: "open", keyHash: keyHash(o.trackingKey), expiresAt: o.paymentLink.expiresAt, ...patch });

async function send(o, link, patch = {}) {
  const docs = { orders: { A1: o }, paymentLinks: { A1: link } };
  const writes = [];
  const sent = [];
  const compiled = [];
  const db = {
    collection: name => ({
      doc: id => ({
        get: async () => ({ exists: !!docs[name]?.[id], data: () => docs[name][id] }),
        set: async (data, opts) => { writes.push({ name, id, data, opts }); },
      }),
    }),
  };
  const out = await sendLinkEmail({
    db, orderId: "A1", now: NOW, settings: {}, secret: "s", formatTotal: x => `CA$${x.total.toFixed(2)}`,
    compileEmailTemplate: (id, _s, vars) => { compiled.push({ id, vars }); return { subject: `Pay ${vars.order_id}`, html: "<p>x</p>" }; },
    orderTrackUrl: async id => `https://shop.example/track?orderId=${id}&key=k`,
    sendEmail: async m => { sent.push(m); },
    ...patch,
  });
  return { out, sent, compiled, writes };
}

describe("emailing a payment link", () => {
  it("sends the payment_link email with the order's details and stamps the link record, not the order", async () => {
    const o = order();
    const { out, sent, compiled, writes } = await send(o, linkFor(o));
    expect(out).toMatchObject({ status: 200, to: "robin@example.com", queued: false });
    expect(compiled[0].id).toBe("payment_link");
    expect(compiled[0].vars).toMatchObject({ customer_name: "Robin", order_id: "A1", total_price: "CA$112.50", note: "Ten tees.", expires_on: "November 20, 2026" });
    expect(compiled[0].vars.button_url).toContain("orderId=A1");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "robin@example.com", subject: "Pay A1" });
    expect(writes).toEqual([{ name: "paymentLinks", id: "A1", data: { sentAt: iso(NOW), sentTo: "robin@example.com", sentCount: 1 }, opts: { merge: true } }]);
  });

  it("refuses paid, closed, expired or foreign links, a bad address and a second send straight away", async () => {
    const o = order();
    expect((await send(order({ paymentStatus: "paid" }), linkFor(o))).out.status).toBe(409);
    expect((await send(order({ source: "checkout" }), linkFor(o))).out.status).toBe(404);
    expect((await send(o, linkFor(o, { keyHash: "other" }))).out.status).toBe(409);
    expect((await send(o, linkFor(o, { expiresAt: iso(NOW - 1000) }))).out.status).toBe(409);
    expect((await send(order({ customer: { name: "R", email: "a@b.com, c@d.com" } }), linkFor(o))).out.status).toBe(400);
    const again = await send(o, linkFor(o, { sentAt: iso(NOW - RESEND_GAP_MS / 2) }));
    expect(again.out.status).toBe(429);
    expect(again.sent).toHaveLength(0);
    expect((await send(o, linkFor(o, { sentAt: iso(NOW - RESEND_GAP_MS - 1), sentCount: 1 }))).writes[0].data.sentCount).toBe(2);
  });

  it("counts a send the email queue picked up as sent", async () => {
    const o = order();
    const { out } = await send(o, linkFor(o), { sendEmail: async () => { throw Object.assign(new Error("later"), { queued: true }); } });
    expect(out).toMatchObject({ status: 200, queued: true });
    await expect(send(o, linkFor(o), { sendEmail: async () => { throw new Error("down"); } })).rejects.toThrow("down");
  });
});
