import { describe, expect, it } from "vitest";
import { formatGrams, metricWeight, metricWeightValue } from "./metricWeight";
import { parseWeightGrams } from "./shippingEngine";

describe("metric weights", () => {
  it("shows grams, and kilograms from 1 kg", () => {
    expect(formatGrams(450)).toBe("450 g");
    expect(formatGrams(1250)).toBe("1.25 kg");
    expect(formatGrams(0)).toBe("");
  });
  it("shows older lb/oz catalog values in metric and leaves metric ones alone", () => {
    expect(metricWeight("1 lb")).toBe("454 g");
    expect(metricWeight("3 lbs")).toBe("1.36 kg");
    expect(metricWeight("8 oz")).toBe("227 g");
    expect(metricWeight("0.5 kg")).toBe("0.5 kg");
    expect(metricWeight("450")).toBe("450 g");
    expect(metricWeight("about a pound")).toBe("about a pound");
  });
  it("saves lb/oz as whole grams without changing what shipping weighs", () => {
    expect(metricWeightValue("1 lb")).toBe("454 g");
    expect(Math.abs(parseWeightGrams(metricWeightValue("1 lb"))! - parseWeightGrams("1 lb")!)).toBeLessThan(0.5);
    expect(metricWeightValue("0.5 kg")).toBe("0.5 kg");
    expect(metricWeightValue("")).toBe("");
  });
});
