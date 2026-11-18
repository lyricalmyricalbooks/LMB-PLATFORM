import { describe, expect, it } from "vitest";
import { typeById } from "../../shared/productTypes";
import { factValue, missingLawFacts, safetyForType, safetyLine, withFact, withSafety } from "./typeFacts";
import { shownDetailRows } from "../features/site/detailRows";

const candle = typeById("candles")!;
const soap = typeById("soap")!;

describe("type facts", () => {
  it("saves a fact as a Details row the product page shows", () => {
    const form: any = { kind: "other", typeId: "candles" };
    Object.assign(form, withFact(form, candle.facts.find((f) => f.key === "burnTime")!, "About 50 hours"));
    expect(factValue(form, "burnTime")).toBe("About 50 hours");
    const shown = shownDetailRows(form, (k) => k);
    expect(shown.find((r) => r.key === "fact:burnTime")).toMatchObject({ label: "Burn time", value: "About 50 hours" });
  });

  it("keeps the owner's own label when the value changes", () => {
    const form: any = { kind: "other", detailRows: [{ key: "fact:burnTime", label: "Burns for", value: "40 h" }] };
    Object.assign(form, withFact(form, { key: "burnTime", label: "Burn time" }, "50 h"));
    expect(form.detailRows.find((r: any) => r.key === "fact:burnTime")).toMatchObject({ label: "Burns for", value: "50 h" });
  });

  it("edits the product's own box for material and care", () => {
    expect(withFact({}, { key: "material", label: "Material" }, "Linen")).toEqual({ material: "Linen" });
  });

  it("puts the type's safety line on, swaps it and takes it away", () => {
    const form: any = { kind: "other" };
    Object.assign(form, safetyForType(form, candle));
    expect(safetyLine(form)).toMatch(/unattended/);
    expect(shownDetailRows(form, (k) => k).find((r) => r.key === "fact:safety")?.label).toBe("Safety");
    Object.assign(form, safetyForType(form, typeById("tops")!));
    expect(safetyLine(form)).toBe("");
    Object.assign(form, withSafety(form, "Keep dry."));
    expect(safetyLine(form)).toBe("Keep dry.");
  });

  it("lists the law's facts still empty", () => {
    const form: any = { kind: "other" };
    expect(missingLawFacts(form, soap).map((f) => f.key)).toEqual(["ingredients", "netAmount"]);
    Object.assign(form, withFact(form, soap.facts[0], "Olive oil, lye"));
    expect(missingLawFacts(form, soap).map((f) => f.key)).toEqual(["netAmount"]);
    expect(missingLawFacts(form, null)).toEqual([]);
  });
});
