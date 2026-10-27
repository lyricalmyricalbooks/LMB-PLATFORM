import { test, expect } from "vitest";
import { createRequire } from "node:module";
const { buildMessageReply, withReply, handleMessageReply } = createRequire(import.meta.url)("./messageReply");

const msg = { name: "Ana <b>", email: "ana@example.com", subject: "Wholesale", message: "Hi <script>" };

test("builds an escaped reply with a clean subject", () => {
  const r = buildMessageReply(msg, "  Thanks <i>!\r\nBest  ");
  expect(r.to).toBe("ana@example.com");
  expect(r.subject).toBe("Re: Wholesale");
  expect(r.body).toBe("Thanks <i>!\nBest");
  expect(r.html).toContain("Thanks &lt;i&gt;!");
  expect(r.html).toContain("Hi &lt;script&gt;");
  expect(r.html).not.toContain("<script>");
});

test("refuses empty replies and header-injecting addresses", () => {
  expect(() => buildMessageReply(msg, "   ")).toThrow(/Write a reply/);
  expect(() => buildMessageReply({ ...msg, email: "a@x.com\r\nBcc: b@y.com" }, "hi")).toThrow(/valid email/);
  expect(() => buildMessageReply({ ...msg, subject: "x\r\nBcc: z" }, "hi")).not.toThrow();
  expect(buildMessageReply({ ...msg, subject: "x\r\nBcc: z" }, "hi").subject).not.toMatch(/[\r\n]/);
});

test("keeps replies bounded", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ at: String(i) }));
  const out = withReply(many, { at: "new" });
  expect(out).toHaveLength(50);
  expect(out[49].at).toBe("new");
});

function fakeDb(data) {
  const store = { ...data };
  const ref = id => ({
    id,
    get: async () => ({ exists: !!store[id], data: () => store[id] }),
  });
  return {
    store,
    collection: () => ({ doc: ref }),
    runTransaction: async fn => fn({
      get: r => r.get(),
      update: (r, patch) => { store[r.id] = { ...store[r.id], ...patch }; },
    }),
  };
}

test("sends, then records the reply on the message", async () => {
  const db = fakeDb({ m1: { ...msg, status: "read" } });
  const sent = [];
  const res = await handleMessageReply({ messageId: "m1", body: "Yes!" }, {
    db, secret: "k", adminEmail: "owner@x.com", now: () => new Date("2026-10-10T00:00:00Z"),
    sendEmail: async e => { sent.push(e); },
  });
  expect(res.status).toBe(200);
  expect(sent[0]).toMatchObject({ to: "ana@example.com", subject: "Re: Wholesale" });
  expect(db.store.m1).toMatchObject({ status: "replied", repliedAt: "2026-10-10T00:00:00.000Z" });
  expect(db.store.m1.replies).toEqual([{ at: "2026-10-10T00:00:00.000Z", body: "Yes!", by: "owner@x.com" }]);
});

test("a failed send records nothing; bad ids and missing messages are refused", async () => {
  const db = fakeDb({ m1: { ...msg } });
  const res = await handleMessageReply({ messageId: "m1", body: "Yes" }, { db, sendEmail: async () => { throw new Error("SMTP down"); } });
  expect(res.status).toBe(502);
  expect(db.store.m1.replies).toBeUndefined();
  expect((await handleMessageReply({ messageId: "../x", body: "a" }, { db, sendEmail: async () => {} })).status).toBe(400);
  expect((await handleMessageReply({ messageId: "nope", body: "a" }, { db, sendEmail: async () => {} })).status).toBe(404);
});
