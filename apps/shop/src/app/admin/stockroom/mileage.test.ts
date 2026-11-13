import { describe, expect, it } from "vitest";

import {
  driveProblem, drivesCsv, driveToForm, mileageOf, mileageYear, pricedDrives, rateOn, rateText, ratesProblem, removeDrive,
  saveDrive, saveMileage, tripDrives, withPreset, type DriveForm,
} from "./mileage";
import { tripReportHtml } from "./tripReport";
import { yearReportCsv } from "./yearReport";

const cra = { unit: "km", rates: [{ id: "c", from: "2026-01-01", unit: "km", rate: 0.73, tierAfter: 5000, tierRate: 0.67, label: "Canada (CRA) 2026" }] };
const form = (patch: Partial<DriveForm> = {}): DriveForm => ({ date: "2026-03-02", from: "Studio", to: "Printer", purpose: "Pick up books", distance: "20", roundTrip: true, trip: "", stockist: "", ...patch });

describe("mileage", () => {
  it("prices a round trip at the rate of its day", () => {
    const tc = saveDrive({ mileage: cra }, null, form(), "km", "d1", "2026-03-02");
    const [d] = pricedDrives(tc);
    expect(d.total).toBe(40);
    expect(d.deduction).toBe(29.2);
  });

  it("drops to the lower rate past 5,000 km in a year, splitting the drive that crosses", () => {
    let tc: Record<string, any> = { mileage: cra };
    tc = saveDrive(tc, null, form({ date: "2026-02-01", distance: "4990", roundTrip: false }), "km", "a", "x");
    tc = saveDrive(tc, null, form({ date: "2026-02-02", distance: "20", roundTrip: false }), "km", "b", "x");
    tc = saveDrive(tc, null, form({ date: "2027-01-05", distance: "10", roundTrip: false }), "km", "c", "x");
    const rows = pricedDrives(tc);
    expect(rows.find((r) => r.id === "b")!.deduction).toBe(Math.round((10 * 0.73 + 10 * 0.67) * 100) / 100);
    // A new year starts at the first rate again (2026's rate still holds: nothing newer was added).
    expect(rows.find((r) => r.id === "c")!.deduction).toBe(7.3);
    expect(mileageYear(tc, "2026").deduction).toBe(Math.round((4990 * 0.73 + 14) * 100) / 100);
  });

  it("keeps each drive on the rate that held that day (the US rate changed in July 2026)", () => {
    const m = withPreset(mileageOf(null, "USD"), "irs-2026");
    expect(m.unit).toBe("mi");
    expect(rateOn(m, "2026-06-30")!.rate).toBe(0.725);
    expect(rateOn(m, "2026-07-01")!.rate).toBe(0.76);
    let tc = saveMileage({}, m);
    tc = saveDrive(tc, null, form({ date: "2026-06-10", distance: "10", roundTrip: false }), "mi", "a", "x");
    tc = saveDrive(tc, null, form({ date: "2026-08-10", distance: "10", roundTrip: false }), "mi", "b", "x");
    expect(mileageYear(tc, "2026", "USD").deduction).toBe(14.85);
  });

  it("converts a drive logged in kilometres to a rate per mile", () => {
    const tc = saveDrive(saveMileage({}, withPreset(mileageOf(null), "irs-2026")), null, form({ distance: "16.09344", roundTrip: false }), "km", "a", "x");
    expect(pricedDrives(tc)[0].deduction).toBe(7.25);
  });

  it("counts a drive before any rate as needing one, never as money", () => {
    const tc = saveDrive({ mileage: cra }, null, form({ date: "2025-12-31" }), "km", "a", "x");
    const y = mileageYear(tc, "2025");
    expect(y.noRate).toBe(1);
    expect(y.deduction).toBe(0);
  });

  it("edits in place and removes by voiding the row", () => {
    let tc = saveDrive({ mileage: cra }, null, form(), "km", "a", "x");
    tc = saveDrive(tc, "a", form({ distance: "30" }), "km", "ignored", "y");
    expect(tc.drives).toHaveLength(1);
    expect(tc.drives[0]).toMatchObject({ id: "a", distance: 30, created: "x" });
    expect(driveToForm(tc, "a", "z").distance).toBe("30");
    tc = removeDrive(tc, "a");
    expect(tc.drives[0].voided).toBe(true);
    expect(mileageYear(tc, "2026").drives).toHaveLength(0);
  });

  it("checks the forms", () => {
    expect(driveProblem(form({ to: " " }))).toMatch(/where/);
    expect(driveProblem(form({ distance: "0" }))).toMatch(/far/);
    expect(driveProblem(form())).toBe("");
    expect(ratesProblem({ unit: "km", rates: [{ id: "a", from: "2026-01-01", unit: "km", rate: 0.7, tierAfter: 5000, label: "" }] })).toMatch(/lower rate/);
    expect(ratesProblem({ unit: "km", rates: [cra.rates[0] as any, { ...cra.rates[0], id: "b" } as any] })).toMatch(/Two rates/);
    expect(ratesProblem(mileageOf({ mileage: cra }))).toBe("");
  });

  it("adding a preset twice keeps one rate per start day", () => {
    const m = withPreset(withPreset(mileageOf(null), "cra-2026"), "cra-2026");
    expect(m.rates).toHaveLength(1);
    expect(rateText(m.rates[0])).toBe("73¢ a km, 67¢ after 5,000 km");
  });

  it("ties drives to a trip and puts them in the trip report and the year's tax report", () => {
    let tc: Record<string, any> = { mileage: cra, trips: [{ id: 1, name: "Spring fair" }] };
    tc = saveDrive(tc, null, form({ trip: "Spring fair" }), "km", "a", "x");
    tc = saveDrive(tc, null, form({ stockist: "Corner Books", distance: "5" }), "km", "b", "x");
    const t = tripDrives(tc, "spring fair");
    expect(t.drives.map((d) => d.id)).toEqual(["a"]);
    const html = tripReportHtml({ name: "Spring fair", items: [], total: 0, categories: {}, baseCurrency: "CAD", pressName: "P", printedOn: "today", drives: t.drives });
    expect(html).toContain("<h2>Drives</h2>");
    expect(html).toContain("$29.20");
    const csv = yearReportCsv({ books: [], states: {}, taxCenter: tc, fxRateCache: {} } as any, "2026").text;
    expect(csv).toContain(`"Mileage","Spring fair","Vehicle (mileage)"`);
    expect(csv).toContain("Corner Books");
    expect(drivesCsv(mileageYear(tc, "2026").drives, "2026", "CAD").text).toContain("36.50");
  });
});
