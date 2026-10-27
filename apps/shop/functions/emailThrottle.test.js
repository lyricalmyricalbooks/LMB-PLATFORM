import { test, expect } from "vitest";
import { createRequire } from "node:module";
const { nextEmailWindow, claimEmailSend, emailKey, CONTACT_LIMITS } = createRequire(import.meta.url)("./emailThrottle");

test("a fixed window allows max sends, then refuses until it ends", () => {
  const limits = { max: 2, windowMs: 1000 };
  let saved = null;
  const results = [];
  for (const now of [10, 20, 30, 1009, 1010]) {
    const { allowed, record } = nextEmailWindow(saved, now, limits);
    results.push(allowed);
    if (record) saved = record;
  }
  expect(results).toEqual([true, true, false, false, true]);
});

test("the key is a hash of the normalised address", () => {
  expect(emailKey(" Ada@Example.COM ")).toBe(emailKey("ada@example.com"));
  expect(emailKey("ada@example.com")).not.toContain("ada");
});

test("a broken counter store fails closed for visitor replies and open when asked", async () => {
  const db = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error("down"); } };
  const quiet = console.warn;
  console.warn = () => {};
  try {
    await expect(claimEmailSend(db, "visitorReply", "a@b.co")).resolves.toBe(false);
    await expect(claimEmailSend(db, "ownerNotify", "a@b.co", { failOpen: true })).resolves.toBe(true);
  } finally {
    console.warn = quiet;
  }
  expect(CONTACT_LIMITS.visitorReply.max).toBe(1);
});
