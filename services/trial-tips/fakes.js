// In-memory clients for the trial tips sweep's tests: its own store, the shops' guide documents, and an email service
// that keeps what it would have sent (with the same idempotency rule as services/email: one send per key).
import { TEMPLATES } from "../email/templates.js";

export function fakeTipStore() {
  const rows = new Map();
  return {
    rows,
    async get(shopId) {
      return rows.has(shopId) ? structuredClone(rows.get(shopId)) : null;
    },
    async set(shopId, row) {
      rows.set(shopId, structuredClone(row));
    },
  };
}

/** `docs` maps shop id → its firstWeek/start document. */
export function fakeGuide(docs = {}) {
  const map = new Map(Object.entries(docs));
  return {
    docs: map,
    async read(shopId) {
      return map.has(shopId) ? structuredClone(map.get(shopId)) : null;
    },
  };
}

/** Renders each email through its real template, so a broken template fails the tests. */
export function fakePlatformEmail(settings) {
  const sent = [];
  const keys = new Set();
  return {
    sent,
    async sendPlatform(message) {
      if (keys.has(message.idempotencyKey)) return { id: "duplicate" };
      keys.add(message.idempotencyKey);
      const parts = TEMPLATES[message.kind](message.data ?? {}, { settings, pressName: message.data?.pressName ?? "" });
      sent.push({ ...structuredClone(message), parts });
      return { id: `email-${sent.length}` };
    },
  };
}
