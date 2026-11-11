// Trips, checked against the old stockroom's saveNewTrip / deleteTripRecord / exportTripCSV.
import { describe, expect, it } from "vitest";

import { deleteTrip, saveTrip, tripCsv, tripProblem, tripToForm } from "./taxTrips";

const tc = {
  trips: [{ id: 1, name: "Frankfurt", destination: "Germany", startDate: "2026-10-14", endDate: "2026-10-18", created: "2026-09-01" }],
  tripBudgets: { Frankfurt: 2000 },
  businessExpenses: [{ id: 5, desc: "Flight", trip: "Frankfurt" }, { id: 6, desc: "Ink", trip: "" }],
};

describe("trips", () => {
  it("fills the form from the record and budget", () => {
    expect(tripToForm(tc, "frankfurt")).toMatchObject({ name: "Frankfurt", destination: "Germany", budget: "2000" });
    expect(tripToForm(tc, null)).toMatchObject({ name: "", budget: "" });
  });
  it("refuses a blank name, another trip's name and dates out of order", () => {
    const f = tripToForm(tc, null);
    expect(tripProblem(tc, null, f)).toMatch(/name/);
    expect(tripProblem(tc, null, { ...f, name: "frankfurt" })).toBe('A trip called "Frankfurt" already exists.');
    expect(tripProblem(tc, "Frankfurt", { ...f, name: "Frankfurt" })).toBe("");
    expect(tripProblem(tc, null, { ...f, name: "Leipzig", startDate: "2026-03-05", endDate: "2026-03-01" })).toMatch(/end date/);
  });
  it("creates a trip with its budget", () => {
    const { taxCenter } = saveTrip(tc, null, { ...tripToForm(tc, null), name: " Leipzig ", budget: "500" }, "2026-11-11", 9);
    expect(taxCenter.trips[1]).toEqual({ id: 9, name: "Leipzig", destination: "", startDate: "", endDate: "", purpose: "", notes: "", created: "2026-11-11" });
    expect(taxCenter.tripBudgets).toEqual({ Frankfurt: 2000, Leipzig: 500 });
  });
  it("a rename takes the expenses and the budget along, keeping the id and creation date", () => {
    const { taxCenter, moved } = saveTrip(tc, "Frankfurt", { ...tripToForm(tc, "Frankfurt"), name: "Frankfurt 2026" }, "2026-11-11", 9);
    expect(moved).toBe(1);
    expect(taxCenter.trips[0]).toMatchObject({ id: 1, name: "Frankfurt 2026", created: "2026-09-01" });
    expect(taxCenter.businessExpenses[0].trip).toBe("Frankfurt 2026");
    expect(taxCenter.tripBudgets).toEqual({ "Frankfurt 2026": 2000 });
  });
  it("a blank budget clears it", () => {
    expect(saveTrip(tc, "Frankfurt", { ...tripToForm(tc, "Frankfurt"), budget: "" }, "2026-11-11", 9).taxCenter.tripBudgets).toEqual({});
  });
  it("deleting keeps the expenses, without the trip", () => {
    const next = deleteTrip(tc, "Frankfurt");
    expect(next.trips).toEqual([]);
    expect(next.businessExpenses.map((e: { trip: string }) => e.trip)).toEqual(["", ""]);
    expect(next.tripBudgets).toEqual({});
  });
  it("the spreadsheet has the old columns and file name", () => {
    const f = tripCsv("Frankfurt Fair!", [{ date: "2026-10-14", desc: "Flight", cat: "Travel", origCurrency: "EUR", origAmount: 300, baseAmount: 450 }], "CAD");
    expect(f.name).toBe("trip_expenses_Frankfurt_Fair_.csv");
    expect(f.text.split(/\r?\n/)[0]).toContain("Base Amount (CAD)");
    expect(f.text).toContain("300.00");
  });
});
