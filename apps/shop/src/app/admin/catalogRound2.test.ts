// Round-2 catalog fixes (PR 7): book saves keep editor defaults, deletions and edition stock honest (#46, #63, #65);
// a published web address is frozen (#15); the scheduled-date warning compares calendar days (#150);
// the legacy stock copy skips bad records and never guesses (#62).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changedBookFields, removedBookFields } from "./bookStockMerge";
import { slugFollowsTitle, slugLocked, slugifyTitle } from "./bookEditorState";
import { releaseArrived } from "../features/site/liveBook";

describe("#46 editor defaults are written once for legacy books", () => {
  it("writes the tracked/draft state the editor showed when the stored book has none", () => {
    const initial = { title: "Old", status: "draft", trackInventory: true, chargeTax: true, allowBackorder: false };
    const form = { ...initial, title: "Old, revised" };
    const live = { title: "Old", stockLevel: 3 }; // no status/trackInventory ever saved
    const out = changedBookFields(form, initial, live);
    expect(out).toMatchObject({ title: "Old, revised", status: "draft", trackInventory: true, chargeTax: true, allowBackorder: false });
  });
  it("leaves a flag alone when the stored book already has it (another tab's change wins)", () => {
    const initial = { status: "draft", trackInventory: true };
    const out = changedBookFields({ ...initial, title: "x" }, initial, { status: "published", trackInventory: false });
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("trackInventory");
  });
  it("does not invent flags for partial writes (bulk price change)", () => {
    expect(changedBookFields({ title: "A", retailPrice: 9 }, { title: "A", retailPrice: 10 }, { title: "A", retailPrice: 10 })).toEqual({ retailPrice: 9 });
  });
});

describe("#63 fields the owner removed are reported for deletion", () => {
  it("names productType when a gift card is switched back to a book", () => {
    expect(removedBookFields({ title: "A" }, { title: "A", productType: "giftCard" })).toEqual(["productType"]);
  });
  it("ignores bookkeeping keys and empty values", () => {
    expect(removedBookFields({ title: "A" }, { id: "x", title: "A", createdAt: "t", updatedAt: "t", note: null })).toEqual([]);
  });
});

describe("#65 a book sold in editions gets its count from the live editions", () => {
  const initial = { stockLevel: 8, variants: [{ id: "pb", stock: 5 }, { id: "hc", stock: 3 }] };
  it("never writes the editor's stale total", () => {
    // A sale since the editor opened: live editions 4 + 3. The editor's own sum (8) is stale.
    const live = { stockLevel: 7, variants: [{ id: "pb", stock: 4 }, { id: "hc", stock: 3 }] };
    const form = { stockLevel: 9, variants: [{ id: "pb", stock: 5 }, { id: "hc", stock: 4 }] }; // owner changed hc to 4
    const out = changedBookFields(form, initial, live);
    expect(out.variants.map((v: any) => v.stock)).toEqual([4, 4]);
    expect(out.stockLevel).toBe(8);
  });
  it("leaves the book count alone when no edition changed", () => {
    const live = { stockLevel: 7, variants: [{ id: "pb", stock: 4 }, { id: "hc", stock: 3 }] };
    const out = changedBookFields({ ...initial, stockLevel: 8, title: "T" }, { ...initial, stockLevel: 8 }, live);
    expect(out).toEqual({ title: "T" });
  });
});

describe("#15 a published book keeps its web address", () => {
  it("locks a published book that has an address, until the owner unlocks it", () => {
    expect(slugLocked({ status: "published", slug: "a-book" })).toBe(true);
    expect(slugLocked({ status: "published", slug: "a-book" }, true)).toBe(false);
    expect(slugLocked({ status: "draft", slug: "a-book" })).toBe(false);
    expect(slugLocked({ status: "published", slug: "" })).toBe(false);
    expect(slugLocked(null)).toBe(false);
  });
  it("only follows the title while unlocked and in step with it", () => {
    expect(slugFollowsTitle({ slug: "a-book", title: "A Book" }, false)).toBe(true);
    expect(slugFollowsTitle({ slug: "a-book", title: "A Book" }, true)).toBe(false);
    expect(slugFollowsTitle({ slug: "custom", title: "A Book" }, false)).toBe(false);
    expect(slugFollowsTitle({ slug: "", title: "" }, false)).toBe(true);
    expect(slugifyTitle("A Book: Revised!")).toBe("a-book-revised");
  });
  it("the editor asks before changing a published address", () => {
    const src = readFileSync(new URL("./BookEditor.tsx", import.meta.url), "utf8");
    expect(src).toContain("Change web address");
    expect(src).toContain("slugFollowsTitle(prev, slugLocked(initialData, slugUnlocked))");
  });
});

describe("#150 the scheduled-later warning compares calendar days in Toronto", () => {
  it("treats tomorrow in Toronto as not yet arrived even when UTC is already tomorrow", () => {
    // 8:30 pm on 9 Oct in Toronto is 00:30Z on 10 Oct.
    expect(releaseArrived("2026-10-10", "2026-10-10T00:30:00.000Z")).toBe(false);
    expect(releaseArrived("2026-10-09", "2026-10-10T00:30:00.000Z")).toBe(true);
  });
  it("the editor no longer compares a date to an ISO timestamp as text", () => {
    const src = readFileSync(new URL("./BookEditor.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/scheduleDate\)\s*>\s*new Date\(\)\.toISOString\(\)/);
    expect(src).toContain("!releaseArrived(formData.scheduleDate)");
  });
});
