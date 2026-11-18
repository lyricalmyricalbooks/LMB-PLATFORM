import { describe, expect, test } from "vitest";
import { importColumns, planImport, readMinutes, readPrice, SAMPLE_SHEET } from "./serviceImport";

describe("bring your services from a spreadsheet (plan 4, 2.11)", () => {
  test("reads lengths and prices the way people write them", () => {
    expect(["60", "45 min", "1h", "1 h 30", "1:30", "1.5 hours", "90 minutes", "2 hrs 15 mins"].map(readMinutes)).toEqual([60, 45, 60, 90, 90, 90, 90, 135]);
    expect(readMinutes("about an hour")).toBeNaN();
    expect(["$45", "45.00", "CA$ 1,200.50", "1.200,50", "free", "", "0"].map(readPrice)).toEqual([4500, 4500, 120050, 120050, 0, 0, 0]);
    expect(readPrice("call us")).toBeNaN();
  });
  test("finds the columns by their usual headings", () => {
    expect(importColumns(["Service Name", "Duration (mins)", "Price", "Category", "Notes", "Capacity"]))
      .toEqual({ name: 0, minutes: 1, price: 2, group: 3, description: 4, places: 5 });
  });
  test("the sample sheet comes in whole", () => {
    const plan = planImport(SAMPLE_SHEET);
    expect(plan.skipped).toEqual([]);
    expect(plan.services).toEqual([
      expect.objectContaining({ name: "Haircut", minutes: 45, priceMinor: 4000, payment: "atShop", group: "Cuts" }),
      expect.objectContaining({ name: "Colour", minutes: 90, priceMinor: 9500 }),
      expect.objectContaining({ name: "Consultation", minutes: 15, priceMinor: 0, payment: "free", group: "" }),
    ]);
  });
  test("says why a line was left out, and skips names the shop already has", () => {
    const sheet = "Name,Length,Price\nHaircut,45,40\n,30,10\nTrim,forever,10\nNap,2,0\nShave,30,?\nhaircut,30,10\nPin,30,0.20\nBeard,30,15\n";
    const plan = planImport(sheet, ["Beard"]);
    expect(plan.services.map((s) => s.name)).toEqual(["Haircut"]);
    expect(plan.skipped.map((s) => [s.line, s.why])).toEqual([
      [3, "It has no name."],
      [4, 'We couldn\'t read the length "forever".'],
      [5, "A booking lasts between 5 minutes and 8 hours."],
      [6, 'We couldn\'t read the price "?".'],
      [7, "You already have a service with this name."],
      [8, "A paid booking costs at least 0.50."],
      [9, "You already have a service with this name."],
    ]);
  });
  test("with no length or price column, each takes an hour and is free; with no name column, nothing comes in", () => {
    const plan = planImport("Service\nMassage\n");
    expect(plan.services[0]).toMatchObject({ name: "Massage", minutes: 60, priceMinor: 0, payment: "free" });
    expect(plan.missing).toEqual(["minutes", "price"]);
    expect(planImport("Length,Price\n30,10\n")).toEqual({ services: [], skipped: [], missing: ["name"] });
  });
});
