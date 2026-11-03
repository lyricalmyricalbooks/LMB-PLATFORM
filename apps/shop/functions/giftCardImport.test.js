// Gift cards brought over from the old shop (plan 23.5): balances kept, codes kept when the file has them, a re-run adds none.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importGiftCards } = require("./giftCardImport.js");
const gc = require("./giftCards.js");

/** A pretend Firestore with create() that refuses a document that exists, as the real one does. */
function fakeDb() {
  const docs = new Map();
  const ref = (name, id) => ({ name, id, path: `${name}/${id}` });
  const db = {
    docs,
    collection: (name) => ({ doc: (id) => ref(name, id), add: async (data) => { docs.set(`${name}/auto${docs.size}`, data); } }),
    async runTransaction(fn) {
      const writes = [];
      const out = await fn({
        get: async (r) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
        create: (r, data) => writes.push([r.path, data]),
      });
      for (const [path, data] of writes) { if (docs.has(path)) throw new Error("ALREADY_EXISTS"); docs.set(path, data); }
      return out;
    },
  };
  return db;
}

const NOW = new Date("2026-11-03T12:00:00Z");
const makeCode = () => "NEWC-ODEA-BCDE-FGHJ";

describe("bringing gift cards over (plan 23.5)", () => {
  it("keeps a full code and its balance, gives a masked one a new code, and skips what can't come", async () => {
    const db = fakeDb();
    const { added, skipped } = await importGiftCards(db, [
      { oldRef: "old-1", code: "ab12-cd34-ef56", balanceMinor: 2500, expiresOn: "2027-12-31", recipientEmail: "Ada@Example.com", recipientName: "Ada" },
      { oldRef: "old-2", balanceMinor: 1000, recipientEmail: "ben@example.com" },
      { oldRef: "old-3", balanceMinor: 0 },
      { oldRef: "old-4", balanceMinor: 500, expiresOn: "2026-01-01" },
      { oldRef: "", balanceMinor: 500 },
    ], { actor: "owner@example.com", now: NOW, makeCode, senderName: "Moth Press" });
    expect(added.map((a) => [a.code, a.kept, a.card.balanceMinor])).toEqual([["AB12CD34EF56", true, 2500], ["NEWC-ODEA-BCDE-FGHJ", false, 1000]]);
    expect(skipped.map((s) => s.reason)).toEqual(["no balance left", "already expired", "nothing to tell it apart"]);
    const kept = db.docs.get(`giftCards/${gc.giftCardId("ab12 cd34 ef56")}`);
    expect(kept).toMatchObject({ balanceMinor: 2500, initialMinor: 2500, currency: "CAD", enabled: true, expiresOn: "2027-12-31", recipientEmail: "ada@example.com", source: "import", codeKept: true, last4: "EF56" });
    expect(kept.history).toEqual([{ type: "imported", minor: 2500, actor: "owner@example.com", at: NOW.toISOString() }]);
    // The kept code works at checkout exactly as typed by the holder.
    expect(gc.giftCardProblem(kept, { now: NOW })).toBeNull();
    expect([...db.docs.values()].some((d) => /Brought 2 gift cards over/.test(d.message || ""))).toBe(true);
  });

  it("a re-run adds nothing, and a code already here is never overwritten", async () => {
    const db = fakeDb();
    const cards = [{ oldRef: "old-1", code: "AB12CD34EF56", balanceMinor: 2500 }, { oldRef: "old-2", balanceMinor: 1000 }];
    await importGiftCards(db, cards, { now: NOW, makeCode: () => "ZZZZ-YYYY-XXXX-WWWW" });
    const before = db.docs.size;
    const again = await importGiftCards(db, cards, { now: NOW, makeCode: () => "QQQQ-RRRR-SSSS-TTTT" });
    expect(again.added).toEqual([]);
    expect(again.skipped.map((s) => s.reason)).toEqual(["already brought over", "already brought over"]);
    expect(db.docs.size).toBe(before);
    const clash = await importGiftCards(db, [{ oldRef: "other", code: "ab12cd34ef56", balanceMinor: 99999 }], { now: NOW });
    expect(clash.skipped[0].reason).toBe("a card with this code is already here");
    expect(db.docs.get(`giftCards/${gc.giftCardId("AB12CD34EF56")}`).balanceMinor).toBe(2500);
  });

  it("this shop's own 16-character codes keep their ids; shorter old codes are read whole", () => {
    expect(gc.normalizeGiftCardCode("abcd efgh jkmn pqrs")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(gc.normalizeGiftCardCode("ab12-cd34")).toBe("AB12CD34");
    expect(gc.normalizeGiftCardCode("abc1234")).toBe("");
    expect(gc.normalizeGiftCardCode("A".repeat(25))).toBe("");
  });
});
