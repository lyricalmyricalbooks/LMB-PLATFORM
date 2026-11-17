import { describe, it, expect } from "vitest";
const { shopOrigin, checkoutClosed, dailyDigestEnabled, backupOutcome, backupStatusRecord, ownCopyDue } = require("./shopSettings");

describe("shopOrigin", () => {
  it("never invents an origin when General › Location is blank (no other shop's street or phone)", () => {
    expect(shopOrigin({})).toMatchObject({ street1: "", city: "", zip: "", country: "", phone: "" });
  });
  it("reads postal code, country and phone from settings", () => {
    const o = shopOrigin({ info: { name: "Shop" }, location: { street: "1 Main", city: "Ottawa", state: "ON", zip: "k1a 0b1", country: "Canada", phone: "(613) 555-0100" } });
    expect(o).toMatchObject({ name: "Shop", street1: "1 Main", city: "Ottawa", zip: "K1A0B1", country: "Canada", phone: "6135550100" });
  });
});

describe("store switches", () => {
  it("checkout closes only when maintenance is on", () => {
    expect(checkoutClosed({ maintenance: { enabled: true } })).toBe(true);
    expect(checkoutClosed({ maintenanceMode: true })).toBe(false);
    expect(checkoutClosed({})).toBe(false);
  });
  it("daily digest is on unless switched off", () => {
    expect(dailyDigestEnabled({})).toBe(true);
    expect(dailyDigestEnabled({ shopAlerts: { dailyOrderDigest: false } })).toBe(false);
  });
  it("a failed backup keeps the last good one", () => {
    const r = backupStatusRecord({ ok: false, day: "2026-10-10", at: "t2", error: "denied", previous: { lastSuccessAt: "t1", lastSuccessDay: "2026-10-09" } });
    expect(r).toMatchObject({ ok: false, error: "denied", lastSuccessAt: "t1", lastSuccessDay: "2026-10-09" });
    expect(backupStatusRecord({ ok: true, day: "d", at: "t", operation: "op" })).toMatchObject({ ok: true, lastSuccessAt: "t", error: "", runningSince: "" });
  });
  it("a backup succeeds when either the export or the document copy works", () => {
    expect(backupOutcome({ exportResult: { ok: false, error: "7 PERMISSION_DENIED" }, copyResult: { ok: true } })).toEqual({ ok: true, error: "" });
    expect(backupOutcome({ exportResult: { ok: true }, copyResult: { ok: false, error: "x" } }).ok).toBe(true);
    const both = backupOutcome({ exportResult: { ok: false, error: "denied" }, copyResult: { ok: false, error: "bucket" } });
    expect(both).toEqual({ ok: false, error: "Firestore export: denied · Document copy: bucket" });
    expect(backupOutcome({}).error).toBe("Unknown error");
  });
});

describe("ownCopyDue (shared shops copy their folder weekly)", () => {
  const now = Date.parse("2026-11-17T08:17:00Z");
  const daysAgo = (d) => ({ lastSuccessAt: new Date(now - d * 24 * 3600 * 1000).toISOString() });
  it("a shared shop's nightly run copies only once the last good copy is about a week old", () => {
    expect(ownCopyDue({ trigger: "nightly", shared: true, previous: daysAgo(1), now })).toBe(false);
    expect(ownCopyDue({ trigger: "nightly", shared: true, previous: daysAgo(6), now })).toBe(false);
    expect(ownCopyDue({ trigger: "nightly", shared: true, previous: daysAgo(6.6), now })).toBe(true);
    expect(ownCopyDue({ trigger: "nightly", shared: true, previous: null, now })).toBe(true);
    expect(ownCopyDue({ trigger: "nightly", shared: true, previous: { lastSuccessAt: "" }, now })).toBe(true);
  });
  it("Back up now always runs, and a shop in its own project still copies every night", () => {
    expect(ownCopyDue({ trigger: "manual", shared: true, previous: daysAgo(0.1), now })).toBe(true);
    expect(ownCopyDue({ trigger: "nightly", shared: false, previous: daysAgo(0.9), now })).toBe(true);
  });
});
