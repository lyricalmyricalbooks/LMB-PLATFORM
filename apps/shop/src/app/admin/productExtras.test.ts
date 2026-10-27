import { describe, expect, it } from "vitest";
import {
  saleStatus, saleWindowOpen, saleWindowProblem, newAddOn, addOnProblems, cleanAddOns, ADD_ON_PRESETS,
  bundleAvailable, bundlePartProblem, bundleProblems, giftCardProblems, productForSave,
} from "./productExtras";
// The server rule the editor mirrors.

import * as promotions from "../../../functions/shared/promotions.js";

// 2026-10-09 at 03:00 UTC is still 2026-10-08 in Toronto.
const lateNightUtc = new Date("2026-10-09T03:00:00Z");
const noon = new Date("2026-10-09T16:00:00Z");

describe("scheduled sales", () => {
  const sale = { isOnSale: true, salePrice: 10 };
  it("uses the Toronto calendar day, both ends inclusive", () => {
    expect(saleStatus({ ...sale, saleStartsAt: "2026-10-09" }, lateNightUtc)).toBe("scheduled");
    expect(saleStatus({ ...sale, saleStartsAt: "2026-10-09" }, noon)).toBe("on");
    expect(saleStatus({ ...sale, saleEndsAt: "2026-10-09" }, noon)).toBe("on");
    expect(saleStatus({ ...sale, saleEndsAt: "2026-10-08" }, noon)).toBe("ended");
    expect(saleStatus({ ...sale }, noon)).toBe("on");
    expect(saleStatus({ isOnSale: true, salePrice: 0 }, noon)).toBe("off");
    expect(saleStatus({ ...sale, isOnSale: false }, noon)).toBe("off");
  });
  it("matches the server's saleWindowOpen", () => {
    const cases = [
      {}, { saleStartsAt: "2026-10-09" }, { saleStartsAt: "2026-10-10" }, { saleEndsAt: "2026-10-08" },
      { saleEndsAt: "2026-10-09" }, { saleStartsAt: "2026-10-01", saleEndsAt: "2026-10-31" }, { saleStartsAt: "junk" },
    ];
    for (const now of [lateNightUtc, noon]) {
      for (const c of cases) expect(saleWindowOpen(c, now)).toBe(promotions.saleWindowOpen(c, now));
    }
  });
  it("refuses an end before the start", () => {
    expect(saleWindowProblem({ saleStartsAt: "2026-10-10", saleEndsAt: "2026-10-09" })).toMatch(/end date/);
    expect(saleWindowProblem({ saleStartsAt: "2026-10-10", saleEndsAt: "2026-10-10" })).toBe("");
    expect(saleWindowProblem({ saleEndsAt: "2026-10-10" })).toBe("");
  });
});

describe("add-ons", () => {
  it("gives presets unique ids and the inscription a 120-character message", () => {
    const a = newAddOn(ADD_ON_PRESETS[1]);
    const b = newAddOn(ADD_ON_PRESETS[1]);
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ label: "Personal inscription", kind: "text", maxLength: 120, enabled: true });
    expect(newAddOn(ADD_ON_PRESETS[0])).not.toHaveProperty("maxLength");
  });
  it("lists missing names, bad prices and bad lengths", () => {
    expect(addOnProblems([{ id: "x", label: "Gift wrap", price: 4, kind: "option" }])).toEqual([]);
    expect(addOnProblems([{ id: "x", label: "", price: "", kind: "option" }])).toHaveLength(2);
    expect(addOnProblems([{ id: "x", label: "Note", price: 1, kind: "text", maxLength: 500 }])[0]).toMatch(/1 to 300/);
    expect(addOnProblems(Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: "a", price: 0, kind: "option" })))[0]).toMatch(/at most 6/);
  });
  it("saves the same shape the server reads", () => {
    const saved = cleanAddOns([{ id: "sig", label: " Signed copy ", price: "5", kind: "option", enabled: false }]);
    expect(saved).toEqual([{ id: "sig", label: "Signed copy", price: 5, kind: "option", enabled: false }]);
    expect(promotions.bookAddOns({ addOns: cleanAddOns([{ id: "w", label: "Wrap", price: 4, kind: "option" }]) })).toHaveLength(1);
  });
});

describe("box sets", () => {
  const books: Record<string, any> = {
    a: { id: "a", title: "A", trackInventory: true, stockLevel: 7 },
    b: { id: "b", title: "B", trackInventory: true, variants: [{ id: "hc", stock: 3 }] },
    c: { id: "c", title: "C", trackInventory: false },
    gift: { id: "gift", productType: "giftCard" },
    set: { id: "set", bundleItems: [{ bookId: "a", quantity: 1 }] },
  };
  const get = (id: string) => books[id];
  it("counts sets from the books inside, like the server", () => {
    const box = { bundleItems: [{ bookId: "a", quantity: 2 }, { bookId: "b", variantId: "hc", quantity: 1 }] };
    expect(bundleAvailable(box, get)).toBe(3);
    expect(bundleAvailable(box, get)).toBe(promotions.bundleAvailable({ bundleItems: box.bundleItems }, get));
    expect(bundleAvailable({ bundleItems: [{ bookId: "c", quantity: 1 }] }, get)).toBe(Infinity);
    expect(bundleAvailable({ bundleItems: [{ bookId: "missing", quantity: 1 }] }, get)).toBe(0);
  });
  it("refuses itself, gift cards and other box sets", () => {
    expect(bundlePartProblem(books.a, "a")).toMatch(/itself/);
    expect(bundlePartProblem(books.gift, "x")).toMatch(/Gift cards/);
    expect(bundlePartProblem(books.set, "x")).toMatch(/another box set/);
    expect(bundlePartProblem(books.a, "x")).toBe("");
    expect(bundleProblems({ id: "x", bundleItems: [{ bookId: "b", quantity: 1 }] }, get)[0]).toMatch(/choose which edition/);
    expect(bundleProblems({ id: "x", bundleItems: [{ bookId: "a", quantity: 21 }] }, get)[0]).toMatch(/1 to 20/);
  });
});

describe("saving", () => {
  it("makes gift cards digital, untracked and plain", () => {
    const saved = productForSave({ productType: "giftCard", trackInventory: true, addOns: [{ id: "x" }], bundleItems: [{ bookId: "a" }], variants: [{ id: "25", price: 25 }] });
    expect(saved).toMatchObject({ trackInventory: false, addOns: [], bundleItems: [], variants: [{ id: "25", price: 25, digital: true }] });
    expect(giftCardProblems({ variants: [] })[0]).toMatch(/at least one amount/);
    expect(giftCardProblems({ variants: [{ name: "Free", price: 0 }] })[0]).toMatch(/more than \$0/);
    expect(giftCardProblems({ variants: [{ price: 25 }] })).toEqual([]);
  });
  it("gives box sets no stock of their own and no add-ons", () => {
    const saved = productForSave({ trackInventory: true, addOns: [{ id: "x", label: "Wrap", price: 1 }], bundleItems: [{ bookId: "a", quantity: "2", variantId: "" }] });
    expect(saved).toMatchObject({ trackInventory: false, addOns: [], bundleItems: [{ bookId: "a", quantity: 2, variantId: null }] });
    expect(saved).not.toHaveProperty("productType");
  });
  it("keeps ordinary books' stock settings and trims bad dates", () => {
    const saved = productForSave({ trackInventory: true, saleStartsAt: "2026-10-01", saleEndsAt: "soon" });
    expect(saved).toMatchObject({ trackInventory: true, bundleItems: [], addOns: [], saleStartsAt: "2026-10-01", saleEndsAt: "" });
  });
});
