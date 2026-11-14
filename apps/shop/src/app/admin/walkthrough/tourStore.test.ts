// The tour's mark on the shop's account (tourStore.ts): read and written in the shape the rules allow, and
// never a failure the admin has to deal with.
import { describe, expect, it, vi } from "vitest";
vi.mock("../../../lib/firebase", () => ({ firestore: {}, db: {} }));
import { markTourSeenOnAccount, tourSeenOnAccount } from "./tourStore";

const snap = (data: unknown, exists = true) => async () => ({ exists: () => exists, data: () => data });

describe("the tour's mark on the account", () => {
  it("is seen only when the document names this tour", async () => {
    expect(await tourSeenOnAccount(snap({ data: "tour-2", updatedAt: 1 }))).toBe(true);
    expect(await tourSeenOnAccount(snap({ data: "done", updatedAt: 1 }))).toBe(false);
    expect(await tourSeenOnAccount(snap({ data: "later" }))).toBe(false);
    expect(await tourSeenOnAccount(snap(undefined, false))).toBe(false);
  });
  it("counts as unseen when it can't be read", async () => {
    expect(await tourSeenOnAccount(async () => { throw new Error("permission-denied"); })).toBe(false);
  });
  it("writes only the two fields the rules allow, and never throws", async () => {
    const write = vi.fn(async () => {});
    await markTourSeenOnAccount(write);
    expect(write).toHaveBeenCalledWith({ data: "tour-2", updatedAt: expect.any(Number) });
    await expect(markTourSeenOnAccount(async () => { throw new Error("offline"); })).resolves.toBeUndefined();
  });
});
