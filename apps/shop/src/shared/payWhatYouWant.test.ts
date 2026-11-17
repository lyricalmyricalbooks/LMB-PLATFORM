import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import * as shop from "./payWhatYouWant";

const server = createRequire(import.meta.url)("../../functions/shared/payWhatYouWant.js") as typeof shop;

for (const [name, lib] of [["shop", shop], ["server", server]] as const) {
  describe(`pay what you want (${name})`, () => {
    const book = { payWhatYouWant: true };
    it("lets the buyer choose only on the product itself", () => {
      expect(lib.paysWhatTheyWant(book)).toBe(true);
      expect(lib.paysWhatTheyWant(book, { id: "v" })).toBe(false);
      expect(lib.paysWhatTheyWant({ ...book, productType: "giftCard" })).toBe(false);
      expect(lib.paysWhatTheyWant({ ...book, bundleItems: [{ bookId: "a" }] })).toBe(false);
      expect(lib.paysWhatTheyWant({ payWhatYouWant: "true" })).toBe(false);
    });
    it("charges the chosen amount between the lowest and the limit", () => {
      expect(lib.chosenUnitPrice(book, undefined, 5, undefined)).toBe(5);
      expect(lib.chosenUnitPrice(book, undefined, 5, "")).toBe(5);
      expect(lib.chosenUnitPrice(book, undefined, 5, "7.499")).toBe(7.5);
      expect(lib.chosenUnitPrice(book, undefined, 0, 0)).toBe(0);
      expect(lib.chosenUnitPrice(book, undefined, 5, 4)).toBeNull();
      expect(lib.chosenUnitPrice(book, undefined, 5, 1001)).toBeNull();
      expect(lib.chosenUnitPrice(book, undefined, 5, "abc")).toBeNull();
      expect(lib.chosenUnitPrice(book, undefined, 2000, 2000)).toBe(2000);
      expect(lib.chosenUnitPrice({}, undefined, 5, 1)).toBe(5);
    });
  });
}
