import { describe, it, expect } from "vitest";
const { calculateShipping, applyStockDelta } = require("./orderMath");

// A minimal set of profiles. The catch-all (rest-of-world) profile matches any
// country via matchShippingZone's fallback.
const profiles = [
  { id: "standard", base: 15, additional: 5, region: "rest of world", isCatchAll: true },
  { id: "heavy", base: 25, additional: 8 },
  { id: "free80", base: 15, additional: 5, freeThreshold: 80, region: "rest-of-world", isCatchAll: false },
];
const addr = { country: "Canada" };

describe("calculateShipping", () => {
  it("charges a single base for one item", () => {
    const items = [{ price: 20, quantity: 1, shippingProfileId: "standard" }];
    expect(calculateShipping(items, addr, profiles)).toBe(15);
  });

  it("adds the per-item additional for extra quantity of one line", () => {
    const items = [{ price: 20, quantity: 3, shippingProfileId: "standard" }];
    // base 15 + additional 5 * (3 - 1) = 25
    expect(calculateShipping(items, addr, profiles)).toBe(25);
  });

  it("uses the highest base and folds the lower base into additionals (mixed profiles)", () => {
    const items = [
      { price: 20, quantity: 1, shippingProfileId: "standard" }, // base 15
      { price: 50, quantity: 1, shippingProfileId: "heavy" },    // base 25 (higher)
    ];
    // first base 15 becomes additional, highest base 25 -> 25 + 15 = 40
    expect(calculateShipping(items, addr, profiles)).toBe(40);
  });

  it("waives shipping when the free threshold is met", () => {
    const items = [{ price: 100, quantity: 1, shippingProfileId: "free80" }];
    expect(calculateShipping(items, addr, profiles)).toBe(0);
  });

  it("falls back to the catch-all zone when no profile id matches", () => {
    const items = [{ price: 20, quantity: 1 }];
    expect(calculateShipping(items, addr, profiles)).toBe(15);
  });
});

describe("applyStockDelta", () => {
  it("returns null when inventory is not tracked", () => {
    expect(applyStockDelta({ trackInventory: false }, { quantity: 1 }, -1)).toBeNull();
  });

  it("decrements a simple product and clamps at zero", () => {
    const patch = applyStockDelta({ trackInventory: true, stockLevel: 2 }, { quantity: 5 }, -5);
    expect(patch.stockLevel).toBe(0);
    expect(patch.variants).toBeUndefined();
  });

  it("restocks a simple product", () => {
    const patch = applyStockDelta({ trackInventory: true, stockLevel: 3 }, { quantity: 2 }, 2);
    expect(patch.stockLevel).toBe(5);
  });

  it("writes both stock and stockLevel on the matched variant", () => {
    const book = {
      trackInventory: true,
      stockLevel: 10,
      variants: [
        { id: "v1", stock: 4, stockLevel: 4 },
        { id: "v2", stock: 7, stockLevel: 7 },
      ],
    };
    const patch = applyStockDelta(book, { variantId: "v1", quantity: 1 }, -1);
    const v1 = patch.variants.find(v => v.id === "v1");
    expect(v1.stock).toBe(3);
    expect(v1.stockLevel).toBe(3);
    // untouched variant preserved
    expect(patch.variants.find(v => v.id === "v2").stock).toBe(7);
    // parent rollup also decremented
    expect(patch.stockLevel).toBe(9);
  });

  it("reads legacy variants that only carry `stock`", () => {
    const book = {
      trackInventory: true,
      stockLevel: 5,
      variants: [{ id: "v1", stock: 4 }],
    };
    const patch = applyStockDelta(book, { variantId: "v1", quantity: 2 }, -2);
    const v1 = patch.variants.find(v => v.id === "v1");
    expect(v1.stockLevel).toBe(2);
    expect(v1.stock).toBe(2);
  });
});
