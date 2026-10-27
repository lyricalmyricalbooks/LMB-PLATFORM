import { expect, it } from "vitest";
import { FINE_TUNE_CONFLICTS, fineTuneConflict } from "./fineTuneConflicts";
import { STYLE_GROUPS } from "./styleSchema";
import { REGION_GROUPS, REGION_SUFFIXES } from "../../features/site/storefrontRegions";

it("names real controls and real Fine-tune settings", () => {
  const keys = new Set(STYLE_GROUPS.flatMap(g => g.fields.map(f => f.key)));
  const regions = new Set(REGION_GROUPS.flatMap(g => g.regions.map(r => r.id)));
  for (const [key, { region, suffix }] of Object.entries(FINE_TUNE_CONFLICTS)) {
    expect(keys.has(key), key).toBe(true);
    expect(regions.has(region), region).toBe(true);
    expect(REGION_SUFFIXES).toContain(suffix);
  }
});

it("reports the element setting that wins, on any screen size or the page itself", () => {
  expect(fineTuneConflict({}, "pdpDescColor")).toBeNull();
  expect(fineTuneConflict({ regions: { productDescriptionColor: "#fff" } }, "pdpDescColor")).toMatchObject({ value: "#fff", paths: ["regions.productDescriptionColor"], label: "Book description" });
  expect(fineTuneConflict({ regions: { productDescriptionMobileFont: "DM Mono" } }, "pdpDescFont")?.paths).toEqual(["regions.productDescriptionMobileFont"]);
  expect(fineTuneConflict({ productPage: { regions: { productDescriptionAlign: "left" } } }, "pdpDescAlign", "productPage")?.value).toBe("left");
  expect(fineTuneConflict({ regions: { productDescriptionColor: "" } }, "pdpDescColor")).toBeNull();
  expect(fineTuneConflict({ regions: { productDescriptionColor: "#fff" } }, "pdpDescSize")).toBeNull();
});
