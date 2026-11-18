import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import * as shop from "./soldByAmount";

const server = createRequire(import.meta.url)("../../functions/shared/soldByAmount.js") as typeof shop;

for (const [name, lib] of [["shop", shop], ["server", server]] as const) {
  describe(`sold by amount (${name})`, () => {
    const fabric = { title: "Linen", amount: { unit: "m", step: 0.1, min: 0.5 } };
    const beads = { title: "Seed beads", amount: { unit: "g", step: 10, min: 25 } };
    it("reads only sensible settings", () => {
      expect(lib.soldAmount(fabric)).toEqual({ unit: "m", step: 0.1, min: 0.5 });
      expect(lib.soldAmount({ amount: { unit: "m", step: 0.3, min: 1 } })).toBeNull();
      expect(lib.soldAmount({ amount: { unit: "kg", step: 1, min: 1 } })).toBeNull();
      expect(lib.soldAmount({ amount: null })).toBeNull();
      expect(lib.soldAmount({})).toBeNull();
      expect(lib.soldAmount({ amount: { unit: "g", step: 10, min: -4 } })).toEqual({ unit: "g", step: 10, min: 10 });
    });
    it("rounds the smallest amount up to whole steps", () => {
      expect(lib.minSteps(lib.soldAmount(fabric))).toBe(5);
      expect(lib.minSteps(lib.soldAmount(beads))).toBe(3);
      expect(lib.minSteps(null)).toBe(1);
      expect(lib.minSteps({ unit: "m", step: 0.1, min: 0.3 })).toBe(3);
    });
    it("writes amounts the way people say them", () => {
      expect(lib.amountText(fabric, 15)).toBe("1.5 m");
      expect(lib.amountText(fabric, 5)).toBe("50 cm");
      expect(lib.amountText(fabric, 10)).toBe("1 m");
      expect(lib.amountText(beads, 25)).toBe("250 g");
      expect(lib.amountText({ amount: { unit: "g", step: 100, min: 100 } }, 12)).toBe("1.2 kg");
      expect(lib.amountText({}, 3)).toBe("");
      expect(lib.stockText({}, -2)).toBe("-2");
      expect(lib.stockText(fabric, 30)).toBe("3 m");
    });
    it("shows prices per metre or per 100 g", () => {
      expect(lib.pricePerUnit({ unit: "m", step: 0.1, min: 0.1 }, 1.8)).toBe(18);
      expect(lib.pricePerUnit({ unit: "g", step: 10, min: 10 }, 0.8)).toBe(8);
      expect(lib.stepPrice({ unit: "m", step: 0.25, min: 0.25 }, 22)).toBe(5.5);
      expect(lib.perLabel({ unit: "g", step: 10, min: 10 })).toBe("100 g");
    });
    it("lets the server refuse a line under the smallest amount", () => {
      expect(lib.amountLine(fabric, 4)).toEqual({ ok: false, message: 'Choose at least 50 cm of "Linen".' });
      expect(lib.amountLine(fabric, 12)).toEqual({ ok: true, amount: { unit: "m", step: 0.1, value: 1.2 } });
      expect(lib.amountLine({}, 1)).toEqual({ ok: true });
    });
    it("reads a line's amount from the order record or the bag", () => {
      expect(lib.lineAmountText({ quantity: 15, amount: { unit: "m", step: 0.1, value: 1.5 } })).toBe("1.5 m");
      expect(lib.lineAmountText({ quantity: 7, amount: { unit: "g", step: 10, min: 50 } })).toBe("70 g");
      expect(lib.lineAmountText({ quantity: 2 })).toBe("");
    });
    it("starts fabric by the metre and beads by weight", () => {
      expect(lib.startingAmount("metre")).toEqual({ unit: "m", step: 0.1, min: 0.5 });
      expect(lib.startingAmount("gram")).toEqual({ unit: "g", step: 10, min: 50 });
      expect(lib.startingAmount("skein")).toBeNull();
    });
  });
}
