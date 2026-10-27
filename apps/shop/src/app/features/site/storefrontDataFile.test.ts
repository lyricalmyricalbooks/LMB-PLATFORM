import { describe, expect, it, vi } from "vitest";
import { CHECK_DEADLINE_MS, currentStorefrontData, fileIsCurrent, isStorefrontDataFile, nanoTime, shippingProfilesFrom } from "./storefrontDataFile";

const file = { v: 1, readTime: "2026-10-15T03:49:48.748909Z", settings: { info: {} }, books: [{ id: "b" }], pages: [] };
const ts = (iso: string, nanos: number) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: nanos });

describe("storefront data file", () => {
  it("compares Firestore times to the nanosecond", () => {
    expect(nanoTime("2026-10-15T03:49:48.748909Z")).toBe("2026-10-15T03:49:48.748909000");
    expect(nanoTime("2026-10-15T03:49:48Z")).toBe("2026-10-15T03:49:48.000000000");
    expect(nanoTime(ts("2026-10-15T03:49:48Z", 748909001))).toBe("2026-10-15T03:49:48.748909001");
    expect(nanoTime("yesterday")).toBeNull();
  });

  it("uses the file only when nothing changed after its snapshot", () => {
    expect(fileIsCurrent(file, { changedAt: ts("2026-10-15T03:49:48Z", 748909000) })).toBe(true);
    expect(fileIsCurrent(file, { changedAt: ts("2026-10-15T03:49:48Z", 748909001) })).toBe(false);
    expect(fileIsCurrent(file, { changedAt: ts("2026-10-15T03:40:00Z", 0) })).toBe(true);
    expect(fileIsCurrent(file, null)).toBe(false);
    expect(fileIsCurrent(file, {})).toBe(false);
  });

  it("refuses files of another shape", () => {
    expect(isStorefrontDataFile(file)).toBe(true);
    expect(isStorefrontDataFile({ ...file, v: 2 })).toBe(false);
    expect(isStorefrontDataFile({ ...file, books: null })).toBe(false);
    expect(isStorefrontDataFile({ ...file, readTime: "" })).toBe(false);
    expect(isStorefrontDataFile("<!doctype html>")).toBe(false);
  });

  it("falls back (null) when the file, the marker or both can't be read", async () => {
    const marker = async () => ({ changedAt: ts("2026-10-15T03:00:00Z", 0) });
    expect(await currentStorefrontData(async () => file, marker)).toEqual(file);
    expect(await currentStorefrontData(async () => { throw new Error("offline"); }, marker)).toBeNull();
    expect(await currentStorefrontData(async () => file, async () => { throw new Error("denied"); })).toBeNull();
    expect(await currentStorefrontData(async () => file, async () => ({ changedAt: ts("2026-10-15T04:00:00Z", 0) }))).toBeNull();
  });

  it("shares one check between readers for 30 seconds, giving each its own copy", async () => {
    let fileReads = 0, markerReads = 0;
    const fetchFile = async () => { fileReads++; return file; };
    const marker = async () => { markerReads++; return { changedAt: ts("2026-10-15T03:00:00Z", 0) }; };
    const t = 1_000_000;
    const a = await currentStorefrontData(fetchFile, marker, { now: t });
    const b = await currentStorefrontData(fetchFile, marker, { now: t + 29_000 });
    expect([fileReads, markerReads]).toEqual([1, 1]);
    expect(a).toEqual(file);
    expect(b).not.toBe(a);
    (a as any).books.push({ id: "changed" });
    expect((b as any).books).toHaveLength(1);
    await currentStorefrontData(fetchFile, marker, { now: t + 30_000 });
    expect(markerReads).toBe(2);
    // Checkout always checks again.
    await currentStorefrontData(fetchFile, marker, { now: t + 30_001, fresh: true });
    expect(markerReads).toBe(3);
    // Other readers never share.
    await currentStorefrontData(async () => file, marker, { now: t + 30_002 });
    expect(markerReads).toBe(4);
  });

  it("gives up on a stalled file download after the deadline (null, so the caller reads Firestore)", async () => {
    vi.useFakeTimers();
    try {
      const marker = async () => ({ changedAt: ts("2026-10-15T03:00:00Z", 0) });
      const result = currentStorefrontData(() => new Promise(() => {}), marker, { fresh: true });
      await vi.advanceTimersByTimeAsync(CHECK_DEADLINE_MS);
      expect(await result).toBeNull();
      const stalledMarker = currentStorefrontData(async () => file, () => new Promise(() => {}), { fresh: true });
      await vi.advanceTimersByTimeAsync(CHECK_DEADLINE_MS);
      expect(await stalledMarker).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("gives shipping profiles only from files that carry them", () => {
    expect(shippingProfilesFrom(file as any)).toBeNull();
    expect(shippingProfilesFrom(null)).toBeNull();
    expect(shippingProfilesFrom({ ...file, shippingProfiles: [] } as any)).toEqual([]);
    expect(shippingProfilesFrom({ ...file, shippingProfiles: [{ id: "general-profile", zones: [] }] } as any)).toEqual([{ id: "general-profile", zones: [] }]);
    expect(shippingProfilesFrom({ ...file, shippingProfiles: [{ zones: [] }] } as any)).toBeNull();
    expect(isStorefrontDataFile({ ...file, shippingProfiles: [{ id: "x" }] })).toBe(true);
  });
});
