import { beforeEach, describe, expect, it, vi } from "vitest";

const getShippingProfiles = vi.fn();
const getCatalogVersion = vi.fn();
vi.mock("../../lib/publicApi", () => ({ publicApi: { getShippingProfiles: (...a: any[]) => getShippingProfiles(...a), getCatalogVersion: (...a: any[]) => getCatalogVersion(...a) } }));

const marker = (iso: string) => ({ changedAt: { seconds: Date.parse(iso) / 1000, nanoseconds: 0 } });
const file = (extra: Record<string, unknown> = {}) => ({ v: 1, readTime: "2026-10-15T03:49:48Z", settings: null, books: [], pages: [], ...extra });

function serveFile(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => body })));
}

describe("loadShippingProfiles", () => {
  beforeEach(() => { vi.resetModules(); getShippingProfiles.mockReset().mockResolvedValue([{ id: "live" }]); getCatalogVersion.mockReset(); });

  it("uses the catalog file's profiles while the file is current", async () => {
    serveFile(file({ shippingProfiles: [{ id: "general-profile", zones: [] }] }));
    getCatalogVersion.mockResolvedValue(marker("2026-10-15T03:00:00Z"));
    const { readShippingProfiles } = await import("./shippingProfilesLoad");
    expect(await readShippingProfiles()).toEqual([{ id: "general-profile", zones: [] }]);
    expect(getShippingProfiles).not.toHaveBeenCalled();
  });

  it("reads Firestore when a profile (or anything else) changed after the file's snapshot", async () => {
    serveFile(file({ shippingProfiles: [{ id: "old" }] }));
    getCatalogVersion.mockResolvedValue(marker("2026-10-15T04:00:00Z"));
    const { readShippingProfiles } = await import("./shippingProfilesLoad");
    expect(await readShippingProfiles()).toEqual([{ id: "live" }]);
  });

  it("reads Firestore when the file was built before it carried profiles", async () => {
    serveFile(file());
    getCatalogVersion.mockResolvedValue(marker("2026-10-15T03:00:00Z"));
    const { readShippingProfiles } = await import("./shippingProfilesLoad");
    expect(await readShippingProfiles()).toEqual([{ id: "live" }]);
  });
});
